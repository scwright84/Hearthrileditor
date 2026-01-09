import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishProjectEvent } from "@/lib/events";
import { getMidjourneyProvider } from "@/lib/midjourney";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scene = await prisma.scene.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!scene) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  publishProjectEvent(scene.projectId, { message: "Image generation started" });

  const latestRun = await prisma.imageGenerationRun.findFirst({
    where: { sceneId: scene.id },
    orderBy: { version: "desc" },
  });
  const version = (latestRun?.version ?? 0) + 1;

  await prisma.scene.update({
    where: { id: scene.id },
    data: { status: "generating" },
  });

  try {
    const provider = getMidjourneyProvider();
    const result = await provider.generateGrid({ prompt: scene.promptText });

    const run = await prisma.imageGenerationRun.create({
      data: {
        sceneId: scene.id,
        provider: process.env.MJ_PROVIDER ?? "mock",
        providerJobId: result.jobId,
        status: "ready",
        version,
      },
    });

    await prisma.imageCandidate.createMany({
      data: result.images.map((url) => ({
        sceneId: scene.id,
        runId: run.id,
        url,
        providerJobId: result.jobId,
      })),
    });

    await prisma.scene.update({
      where: { id: scene.id },
      data: { status: "ready" },
    });

    publishProjectEvent(scene.projectId, { message: "Images ready" });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await prisma.scene.update({
      where: { id: scene.id },
      data: { status: "error" },
    });
    publishProjectEvent(scene.projectId, { message: "Image generation failed" });
    console.error(error);
    return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
  }
}
