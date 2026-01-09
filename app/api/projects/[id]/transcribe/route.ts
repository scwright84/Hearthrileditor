import fs from "fs/promises";
import path from "path";
import { createReadStream } from "node:fs";
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishProjectEvent } from "@/lib/events";
import { openai } from "@/lib/openai";
import { quantizeWordsToRows } from "@/lib/transcription";

async function ensureLocalAudioPath(url: string) {
  if (url.startsWith("/")) {
    return path.join(process.cwd(), "public", url);
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
  return tmpPath;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: { audioAsset: true },
  });
  if (!project || !project.audioAsset?.originalUrl) {
    return NextResponse.json({ error: "Missing audio" }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 400 });
  }

  publishProjectEvent(project.id, { message: "Transcription queued" });

  try {
    const audioPath = await ensureLocalAudioPath(project.audioAsset.originalUrl);
    const transcript = await openai.audio.transcriptions.create({
      file: createReadStream(audioPath),
      model: "gpt-4o-mini-transcribe",
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    });

    const words = transcript.words ?? [];
    const rows = quantizeWordsToRows(words).map((row) => ({
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    publishProjectEvent(project.id, { message: "Transcription failed" });
    console.error(error);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}
