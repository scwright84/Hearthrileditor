import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishProjectEvent } from "@/lib/events";
import { createVideoGeneration, mapLumaStateToJobStatus } from "@/lib/lumaClient";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    include: {
      scenes: {
        orderBy: { index: "asc" },
        include: {
          imageCandidates: { where: { run: { isActive: true } } },
          animationClips: true,
        },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const missing = project.scenes.filter(
    (scene) => !scene.imageCandidates.some((candidate) => candidate.isSelected),
  );
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Select winners for all scenes before animating." },
      { status: 400 },
    );
  }

  publishProjectEvent(project.id, { message: "Animating winners..." });

  for (const scene of project.scenes) {
    const selected = scene.imageCandidates.find((candidate) => candidate.isSelected);
    if (!selected) continue;
    if (!selected.url || selected.status !== "ready") continue;
    const generation = await createVideoGeneration({
      prompt: scene.promptText,
      model: "ray-flash-2",
      resolution: "720p",
      duration: "5s",
      aspect_ratio: "16:9",
      keyframes: {
        frame0: { type: "image", url: selected.url },
      },
    });
    const status = mapLumaStateToJobStatus(generation.state);
    await prisma.animationClip.create({
      data: {
        sceneId: scene.id,
        imageCandidateId: selected.id,
        providerJobId: generation.id,
        lumaGenerationId: generation.id,
        url: status === "ready" ? generation.assets?.video ?? null : null,
        durationSec: 5,
        resolution: "720p",
        status,
      },
    });
    publishProjectEvent(project.id, {
      message:
        status === "ready"
          ? `Animation ready for scene ${scene.index + 1}`
          : `Animation queued for scene ${scene.index + 1}`,
    });
  }

  publishProjectEvent(project.id, { message: "All animations queued" });
  return NextResponse.json({ ok: true });
}
