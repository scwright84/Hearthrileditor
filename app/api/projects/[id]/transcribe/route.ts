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
  if (url.startsWith("/")) {
    const localPath = path.join(process.cwd(), "public", url);
    const stats = await fs.stat(localPath);
    const ext = path.extname(localPath).toLowerCase();
    return {
      path: localPath,
      size: stats.size,
      mime: ext ? `audio/${ext.replace(".", "")}` : "audio/mpeg",
    };
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
  if (!project || !project.audioAsset?.originalUrl) {
    return NextResponse.json(
      { error: "Missing audio", correlationId },
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
    const audioFile = await ensureLocalAudioPath(project.audioAsset.originalUrl);
    console.log(
      `[transcribe:${correlationId}] project=${project.id} audio=${project.audioAsset.originalUrl} size=${audioFile.size} mime=${audioFile.mime}`,
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
    const rawClips =
      requestedClips.length > 0
        ? requestedClips
        : (project.audioAsset?.waveformData as { clips?: Array<{ start: number; end: number }> } | null)
            ?.clips ?? [];
    const clips = rawClips
      .filter((clip) => clip.end > clip.start)
      .sort((a, b) => a.start - b.start);
    const remapTime = (tSec: number) => {
      if (!clips.length) return tSec;
      let offset = 0;
      for (const clip of clips) {
        if (tSec < clip.start) {
          return null;
        }
        if (tSec >= clip.start && tSec <= clip.end) {
          return tSec - clip.start + offset;
        }
        offset += clip.end - clip.start;
      }
      return null;
    };
    const { rowsSource, rowsAreMapped } = (() => {
      if (words.length === 0) {
        return { rowsSource: quantizeSegmentsToRows(segments), rowsAreMapped: false };
      }
      if (!clips.length) {
        return { rowsSource: quantizeWordsToRows(words), rowsAreMapped: false };
      }
      const remappedWords = words
        .map((token) => {
          const mappedStart = remapTime(token.start);
          if (mappedStart == null) return null;
          const mappedEnd = remapTime(token.end) ?? mappedStart;
          return {
            ...token,
            start: mappedStart,
            end: Math.max(mappedStart, mappedEnd),
          };
        })
        .filter(Boolean) as typeof words;
      return { rowsSource: quantizeWordsToRows(remappedWords), rowsAreMapped: true };
    })();
    if (rowsSource.length === 0 && transcript.text) {
      console.warn(
        `[transcribe:${correlationId}] No timestamps; falling back to single row`,
      );
      rowsSource.push({ tSec: 0, text: transcript.text });
    }
    const rows = rowsSource
      .map((row) => {
        const mapped = rowsAreMapped ? row.tSec : remapTime(row.tSec);
        if (mapped == null) return null;
        return {
          projectId: project.id,
          tSec: mapped,
          text: row.text,
          words: row.words ?? undefined,
        };
      })
      .filter(Boolean) as Array<{
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

    await prisma.$transaction([
      prisma.transcriptRow.deleteMany({ where: { projectId: project.id } }),
      prisma.project.update({
        where: { id: project.id },
        data: { transcriptRaw: transcript as unknown as object },
      }),
      prisma.transcriptRow.createMany({ data: dedupedRows }),
    ]);

    publishProjectEvent(project.id, { message: "Transcription ready" });

    return NextResponse.json({
      ok: true,
      correlationId,
      rows: dedupedRows,
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
