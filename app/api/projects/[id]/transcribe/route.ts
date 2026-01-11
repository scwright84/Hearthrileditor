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

async function ensureLocalAudioPath(url: string) {
  if (url.startsWith("/")) {
    const localPath = path.join(process.cwd(), "public", url);
    const stats = await fs.stat(localPath);
    return { path: localPath, size: stats.size, mime: "audio/mpeg" };
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to download audio");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const tmpDir = path.join(process.cwd(), "tmp");
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `audio-${Date.now()}.mp3`);
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
    const rowsSource =
      words.length > 0
        ? quantizeWordsToRows(words)
        : quantizeSegmentsToRows(segments);
    if (rowsSource.length === 0 && transcript.text) {
      console.warn(
        `[transcribe:${correlationId}] No timestamps; falling back to single row`,
      );
      rowsSource.push({ tSec: 0, text: transcript.text });
    }
    const rows = rowsSource.map((row) => ({
      projectId: project.id,
      tSec: row.tSec,
      text: row.text,
      words: row.words ?? undefined,
    }));

    await prisma.$transaction([
      prisma.transcriptRow.deleteMany({ where: { projectId: project.id } }),
      prisma.project.update({
        where: { id: project.id },
        data: { transcriptRaw: transcript as unknown as object },
      }),
      prisma.transcriptRow.createMany({ data: rows }),
    ]);

    publishProjectEvent(project.id, { message: "Transcription ready" });

    return NextResponse.json({
      ok: true,
      correlationId,
      rows,
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
