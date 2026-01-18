import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishProjectEvent } from "@/lib/events";
import { getCharacterHeadshotUrls } from "@/lib/characters";
import { createImageGeneration, mapLumaStateToJobStatus } from "@/lib/lumaClient";
import { toPublicAssetUrl } from "@/lib/publicAssetUrl";

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
    include: {
      project: {
        include: {
          characters: { include: { omniRefs: true } },
        },
      },
    },
  });
  if (!scene) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!scene.project.stylePresetId) {
    return NextResponse.json({ error: "Style preset required" }, { status: 400 });
  }

  const focal = scene.focalPoint.toLowerCase();
  const character = scene.project.characters.find(
    (item) => item.name.toLowerCase() === focal,
  );
  if (character) {
    const omni = character.omniRefs.find(
      (ref) => ref.stylePresetId === scene.project.stylePresetId,
    );
    if (!omni || omni.status !== "ready") {
      return NextResponse.json(
        { error: `Omni ref required for ${character.name}` },
        { status: 400 },
      );
    }
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

  let runId: string | null = null;
  try {
    await prisma.imageGenerationRun.updateMany({
      where: { sceneId: scene.id, isActive: true },
      data: { isActive: false },
    });

    const run = await prisma.imageGenerationRun.create({
      data: {
        sceneId: scene.id,
        provider: "luma",
        providerJobId: `luma-run-${randomUUID()}`,
        status: "running",
        version,
        reason: "initial",
      },
    });
    runId = run.id;

    let characterRef: Record<string, { images: string[] }> | undefined;
    if (character) {
      const images = getCharacterHeadshotUrls(character);
      const publicHeadshots = images
        .map((url) => toPublicAssetUrl(url))
        .filter((url): url is string => Boolean(url));
      if (publicHeadshots.length) {
        let identityKey = character.lumaIdentityKey;
        if (!identityKey) {
          const used = new Set(
            scene.project.characters
              .map((item) => item.lumaIdentityKey)
              .filter((key): key is string => Boolean(key)),
          );
          let index = 0;
          while (used.has(`identity${index}`)) index += 1;
          identityKey = `identity${index}`;
          await prisma.characterReference.update({
            where: { id: character.id },
            data: { lumaIdentityKey: identityKey },
          });
        }
        characterRef = {
          [identityKey]: { images: publicHeadshots },
        };
      }
    }

    const candidates = await Promise.all(
      Array.from({ length: 4 }).map(async () => {
        const generation = await createImageGeneration({
          prompt: scene.promptText,
          model: "photon-flash-1",
          aspect_ratio: "16:9",
          character_ref: characterRef,
        });
        const status = mapLumaStateToJobStatus(generation.state);
        return prisma.imageCandidate.create({
          data: {
            sceneId: scene.id,
            runId: run.id,
            url: status === "ready" ? generation.assets?.image ?? null : null,
            providerJobId: generation.id,
            lumaGenerationId: generation.id,
            status,
          },
        });
      }),
    );

    const allReady = candidates.every((candidate) => candidate.status === "ready");
    await prisma.imageGenerationRun.update({
      where: { id: run.id },
      data: { status: allReady ? "ready" : "running" },
    });
    if (allReady) {
      await prisma.scene.update({
        where: { id: scene.id },
        data: { status: "ready" },
      });
    }

    publishProjectEvent(scene.projectId, {
      message: allReady ? "Images ready" : "Images queued",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (runId) {
      await prisma.imageGenerationRun.update({
        where: { id: runId },
        data: { status: "error" },
      });
    }
    await prisma.scene.update({
      where: { id: scene.id },
      data: { status: "error" },
    });
    publishProjectEvent(scene.projectId, { message: "Image generation failed" });
    console.error(error);
    return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
  }
}
