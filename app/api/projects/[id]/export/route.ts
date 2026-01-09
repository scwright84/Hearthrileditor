import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishProjectEvent } from "@/lib/events";
import { renderProjectVideo } from "@/lib/render";
import { getStorageProvider } from "@/lib/storage";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      audioAsset: true,
      scenes: {
        orderBy: { index: "asc" },
        include: { imageCandidates: true, animationClips: true },
      },
    },
  });
  if (!project || !project.audioAsset) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }

  if (project.scenes.length === 0) {
    return NextResponse.json({ error: "No scenes to render" }, { status: 400 });
  }

  const render = await prisma.exportRender.create({
    data: { projectId: project.id, status: "running" },
  });
  publishProjectEvent(project.id, { message: "Render started" });

  const scenes = project.scenes.map((scene) => {
    const selected = scene.imageCandidates.find((item) => item.isSelected);
    const fallback = scene.imageCandidates[0];
    const clip = scene.animationClips.at(-1);
    return {
      startMs: scene.startMs,
      endMs: scene.endMs,
      imageUrl: selected?.url ?? fallback?.url,
      clipUrl: clip?.url,
    };
  });

  const tmpDir = path.join(process.cwd(), "tmp");
  await fs.mkdir(tmpDir, { recursive: true });
  const outputPath = path.join(tmpDir, `render-${render.id}.mp4`);

  try {
    await renderProjectVideo({
      scenes,
      audio: {
        url: project.audioAsset.originalUrl,
        trimStartSec: project.audioAsset.trimStartSec,
        trimEndSec: project.audioAsset.trimEndSec,
        fadeInSec: project.audioAsset.fadeInSec,
        fadeOutSec: project.audioAsset.fadeOutSec,
      },
      outputPath,
    });

    const buffer = await fs.readFile(outputPath);
    const storage = getStorageProvider();
    const upload = await storage.uploadFile({
      data: buffer,
      contentType: "video/mp4",
      keyPrefix: `exports/${project.id}`,
      originalName: `render-${render.id}.mp4`,
    });
    await fs.unlink(outputPath).catch(() => undefined);

    await prisma.exportRender.update({
      where: { id: render.id },
      data: { status: "ready", outputUrl: upload.url },
    });

    publishProjectEvent(project.id, { message: "Render ready" });

    return NextResponse.json({ url: upload.url });
  } catch (error) {
    await prisma.exportRender.update({
      where: { id: render.id },
      data: { status: "error" },
    });
    publishProjectEvent(project.id, { message: "Render failed" });
    console.error(error);
    return NextResponse.json({ error: "Render failed" }, { status: 500 });
  }
}
