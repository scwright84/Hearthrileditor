import fs from "fs/promises";
import path from "path";
import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishProjectEvent } from "@/lib/events";
import { openai } from "@/lib/openai";
import {
  quantizeSegmentsToRows,
  quantizeWordsToRows,
} from "@/lib/transcription";

const SUPPORTED_EXTS = new Set([
  ".flac",
  ".m4a",
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".oga",
  ".ogg",
  ".wav",
  ".webm",
]);

const mimeToExt: Record<string, string> = {
  "audio/flac": ".flac",
  "audio/x-flac": ".flac",
  "audio/m4a": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/mp4": ".mp4",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/ogg": ".ogg",
  "audio/oga": ".oga",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/webm": ".webm",
};

const resolveExt = (url: string, contentType?: string | null) => {
  const parsed = path.extname(new URL(url, "http://localhost").pathname).toLowerCase();
  if (SUPPORTED_EXTS.has(parsed)) return parsed;
  if (contentType) {
    const normalized = contentType.split(";")[0]?.trim().toLowerCase();
    if (normalized && mimeToExt[normalized]) return mimeToExt[normalized];
  }
  return ".mp3";
};

async function ensureLocalAudioPath(url: string) {
  const toLocalPath = async (pathname: string) => {
    const localPath = path.join(process.cwd(), "public", pathname);
    const stats = await fs.stat(localPath);
    const ext = path.extname(localPath).toLowerCase();
    return {
      path: localPath,
      size: stats.size,
      mime: ext ? `audio/${ext.replace(".", "")}` : "audio/mpeg",
    };
  };

  if (url.startsWith("/")) {
    return toLocalPath(url);
  }

  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith("/uploads/")) {
      return await toLocalPath(parsed.pathname);
    }
  } catch {
    // Fall through to fetch.
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to download audio");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const tmpDir = path.join(process.cwd(), "tmp");
  await fs.mkdir(tmpDir, { recursive: true });
  const ext = resolveExt(url, response.headers.get("content-type"));
  const tmpPath = path.join(tmpDir, `audio-${Date.now()}${ext}`);
  await fs.writeFile(tmpPath, buffer);
  return {
    path: tmpPath,
    size: buffer.length,
    mime: response.headers.get("content-type") ?? "audio/mpeg",
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let requestedClips: Array<{ start: number; end: number }> = [];
  try {
    const body = await request.json();
    if (Array.isArray(body?.clips)) {
      requestedClips = body.clips
        .map((clip: { start?: number; end?: number }) => ({
          start: Number(clip.start ?? 0),
          end: Number(clip.end ?? 0),
        }))
        .filter((clip) => clip.end > clip.start);
    }
  } catch {
    // No body or invalid JSON; fall back to stored clips.
  }
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    include: { audioAsset: true },
  });
  const correlationId = randomUUID();
  if (!project || !project.audioAsset?.editedUrl) {
    return NextResponse.json(
      { error: "Missing edited audio", correlationId },
      { status: 400 },
    );
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error(`[transcribe:${correlationId}] missing OPENAI_API_KEY`);
    return NextResponse.json(
      { error: "OPENAI_API_KEY missing", correlationId },
      { status: 400 },
    );
  }
  publishProjectEvent(project.id, { message: "Transcription queued" });

  try {
    const audioFile = await ensureLocalAudioPath(project.audioAsset.editedUrl);
    console.log(
      `[transcribe:${correlationId}] project=${project.id} audio=${project.audioAsset.editedUrl} size=${audioFile.size} mime=${audioFile.mime}`,
    );
    console.log(`[transcribe:${correlationId}] OpenAI start`);
    const transcript = await openai.audio.transcriptions.create({
      file: createReadStream(audioFile.path),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    });
    console.log(`[transcribe:${correlationId}] OpenAI complete`);

    const words = transcript.words ?? [];
    const segments = transcript.segments ?? [];
    console.log(
      `[transcribe:${correlationId}] words=${words.length} segments=${segments.length}`,
    );
    const { rowsSource, rowsAreMapped } = (() => {
      if (words.length === 0) {
        return { rowsSource: quantizeSegmentsToRows(segments), rowsAreMapped: false };
      }
      return { rowsSource: quantizeWordsToRows(words), rowsAreMapped: false };
    })();
    if (rowsSource.length === 0 && transcript.text) {
      console.warn(
        `[transcribe:${correlationId}] No timestamps; falling back to single row`,
      );
      rowsSource.push({ tSec: 0, text: transcript.text });
    }
  const rows = rowsSource
      .map((row) => ({
        projectId: project.id,
        tSec: row.tSec,
        text: row.text,
        words: row.words ?? undefined,
      })) as Array<{
      projectId: string;
      tSec: number;
      text: string;
      words?: unknown;
    }>;
    const dedupedRows = Array.from(
      rows.reduce((acc, row) => {
        const key = row.tSec;
        const existing = acc.get(key);
        if (existing) {
          existing.text = `${existing.text} ${row.text}`.replace(/\s+/g, " ").trim();
          if (row.words && Array.isArray(existing.words)) {
            existing.words = [...existing.words, ...(row.words as unknown[])];
          }
        } else {
          acc.set(key, { ...row });
        }
        return acc;
      }, new Map<number, { projectId: string; tSec: number; text: string; words?: unknown }>()),
    ).map(([, value]) => value);

    const clipDurationSec = (() => {
      if (requestedClips.length) {
        return requestedClips.reduce(
          (sum, clip) => sum + (clip.end - clip.start),
          0,
        );
      }
      const storedClips = project.audioAsset?.waveformData as
        | { clips?: Array<{ start: number; end: number }> }
        | undefined;
      if (storedClips?.clips?.length) {
        return storedClips.clips.reduce(
          (sum, clip) => sum + (clip.end - clip.start),
          0,
        );
      }
      return project.audioAsset?.durationSec ?? 0;
    })();
    const maxSecond = Math.max(0, Math.ceil(clipDurationSec) - 1);
    const rowsBySecond = new Map<number, (typeof dedupedRows)[number]>();
    dedupedRows.forEach((row) => rowsBySecond.set(row.tSec, row));
    const fullRows =
      maxSecond > 0
        ? Array.from({ length: maxSecond + 1 }).map((_, idx) => {
            const existing = rowsBySecond.get(idx);
            return (
              existing ?? {
                projectId: project.id,
                tSec: idx,
                text: "",
              }
            );
          })
        : dedupedRows;

    await prisma.$transaction([
      prisma.transcriptRow.deleteMany({ where: { projectId: project.id } }),
      prisma.project.update({
        where: { id: project.id },
        data: { transcriptRaw: transcript as unknown as object },
      }),
      prisma.transcriptRow.createMany({ data: fullRows }),
    ]);

    publishProjectEvent(project.id, { message: "Transcription ready" });

    return NextResponse.json({
      ok: true,
      correlationId,
      rows: fullRows,
    });
  } catch (error) {
    publishProjectEvent(project.id, { message: "Transcription failed" });
    const status = (error as { status?: number })?.status;
    const message = (error as { message?: string })?.message;
    console.error(`[transcribe:${correlationId}] status=${status ?? "n/a"} ${message ?? "unknown error"}`);
    console.error(error);
    return NextResponse.json(
      { error: "Transcription failed", correlationId },
      { status: 500 },
    );
  }
}
