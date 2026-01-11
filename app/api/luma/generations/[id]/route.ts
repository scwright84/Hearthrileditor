import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getGeneration, mapLumaStateToJobStatus } from "@/lib/lumaClient";

const updateSceneStatusIfComplete = async (sceneId: string) => {
  const candidates = await prisma.imageCandidate.findMany({
    where: { sceneId, run: { isActive: true } },
  });
  if (candidates.length === 0) return;
  const anyPending = candidates.some((candidate) =>
    ["queued", "running"].includes(candidate.status),
  );
  if (anyPending) return;
  const allReady = candidates.every((candidate) => candidate.status === "ready");
  const activeRun = await prisma.imageGenerationRun.findFirst({
    where: { sceneId, isActive: true },
  });
  if (activeRun) {
    await prisma.imageGenerationRun.update({
      where: { id: activeRun.id },
      data: { status: allReady ? "ready" : "error" },
    });
  }
  await prisma.scene.update({
    where: { id: sceneId },
    data: { status: allReady ? "ready" : "error" },
  });
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: generationId } = await params;
  const candidate = await prisma.imageCandidate.findFirst({
    where: {
      lumaGenerationId: generationId,
      scene: { project: { userId: session.user.id } },
    },
  });
  const animation = await prisma.animationClip.findFirst({
    where: {
      lumaGenerationId: generationId,
      scene: { project: { userId: session.user.id } },
    },
  });
  const omniVariant = await prisma.characterOmniVariant.findFirst({
    where: {
      lumaGenerationId: generationId,
      character: { project: { userId: session.user.id } },
    },
  });

  if (!candidate && !animation && !omniVariant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const generation = await getGeneration(generationId);
  const status = mapLumaStateToJobStatus(generation.state);

  if (candidate) {
    await prisma.imageCandidate.update({
      where: { id: candidate.id },
      data: {
        status,
        url: status === "ready" ? generation.assets?.image ?? candidate.url : candidate.url,
        failureReason:
          status === "error" ? generation.failure_reason ?? "Generation failed" : null,
      },
    });
    await updateSceneStatusIfComplete(candidate.sceneId);
  }

  if (animation) {
    await prisma.animationClip.update({
      where: { id: animation.id },
      data: {
        status,
        url: status === "ready" ? generation.assets?.video ?? animation.url : animation.url,
        failureReason:
          status === "error" ? generation.failure_reason ?? "Generation failed" : null,
      },
    });
  }

  if (omniVariant) {
    await prisma.characterOmniVariant.update({
      where: { id: omniVariant.id },
      data: {
        status,
        imageUrl:
          status === "ready"
            ? generation.assets?.image ?? omniVariant.imageUrl
            : omniVariant.imageUrl,
        failureReason:
          status === "error" ? generation.failure_reason ?? "Generation failed" : null,
      },
    });
    const variants = await prisma.characterOmniVariant.findMany({
      where: {
        characterId: omniVariant.characterId,
        stylePresetId: omniVariant.stylePresetId,
      },
    });
    const anyPending = variants.some((variant) =>
      ["queued", "running"].includes(variant.status),
    );
    if (!anyPending) {
      const allFailed = variants.every((variant) => variant.status === "error");
      if (allFailed) {
        await prisma.characterOmniRef.upsert({
          where: {
            characterId_stylePresetId: {
              characterId: omniVariant.characterId,
              stylePresetId: omniVariant.stylePresetId,
            },
          },
          update: {
            status: "error",
            errorMessage: "All omni variants failed",
          },
          create: {
            characterId: omniVariant.characterId,
            stylePresetId: omniVariant.stylePresetId,
            status: "error",
            errorMessage: "All omni variants failed",
          },
        });
      }
    }
  }

  return NextResponse.json(generation);
}
