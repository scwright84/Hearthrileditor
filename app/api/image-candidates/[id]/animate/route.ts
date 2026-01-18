import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishProjectEvent } from "@/lib/events";
import { createVideoGeneration, mapLumaStateToJobStatus } from "@/lib/lumaClient";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidate = await prisma.imageCandidate.findFirst({
    where: { id: params.id, scene: { project: { userId: session.user.id } } },
    include: { scene: true },
  });
  if (!candidate) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  publishProjectEvent(candidate.scene.projectId, { message: "Animating clip" });

  try {
    if (!candidate.url || candidate.status !== "ready") {
      return NextResponse.json(
        { error: "Candidate image missing" },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const usePrompt =
      typeof body?.usePrompt === "boolean" ? body.usePrompt : true;
    const generation = await createVideoGeneration({
      prompt: usePrompt ? candidate.scene.promptText : undefined,
      model: "ray-flash-2",
      resolution: "720p",
      duration: "5s",
      aspect_ratio: "16:9",
      keyframes: {
        frame0: { type: "image", url: candidate.url },
      },
    });

    const status = mapLumaStateToJobStatus(generation.state);
    const clip = await prisma.animationClip.create({
      data: {
        sceneId: candidate.sceneId,
        imageCandidateId: candidate.id,
        providerJobId: generation.id,
        lumaGenerationId: generation.id,
        url: status === "ready" ? generation.assets?.video ?? null : null,
        durationSec: 5,
        resolution: "720p",
        status,
      },
    });

    publishProjectEvent(candidate.scene.projectId, {
      message: status === "ready" ? "Animation ready" : "Animation queued",
    });

    return NextResponse.json(clip);
  } catch (error) {
    publishProjectEvent(candidate.scene.projectId, { message: "Animation failed" });
    console.error(error);
    return NextResponse.json({ error: "Animation failed" }, { status: 500 });
  }
}
