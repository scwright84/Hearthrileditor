import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCharacterHeadshotUrls } from "@/lib/characters";
import { publishProjectEvent } from "@/lib/events";
import {
  createImageGeneration,
  getOmniVariantCount,
  mapLumaStateToJobStatus,
} from "@/lib/lumaClient";
import { toPublicAssetUrl } from "@/lib/publicAssetUrl";
import { buildOmniPrompt } from "@/lib/omniPrompt";

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const projectId = String(body?.projectId || "");
  const stylePresetId = String(body?.stylePresetId || "");
  if (!projectId || !stylePresetId) {
    return NextResponse.json(
      { error: "Project and style preset required" },
      { status: 400 },
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: {
      characters: true,
      stylePack: { include: { styleRefs: true } },
      styleRefs: true,
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stylePreset = await prisma.stylePreset.findUnique({
    where: { id: stylePresetId },
  });
  if (!stylePreset) {
    return NextResponse.json({ error: "Style preset missing" }, { status: 400 });
  }

  const packRefs =
    project.stylePack?.styleRefs ??
    (project.styleRefs.length > 0 ? project.styleRefs : []);
  const styleRefs = packRefs
    .map((ref) => ({
      url: toPublicAssetUrl(ref.imageUrl),
      weight: ref.weight ?? 0.8,
    }))
    .filter((ref): ref is { url: string; weight: number } => Boolean(ref.url));
  const limitedStyleRefs = styleRefs
    .sort((a, b) => (b.weight ?? 0.8) - (a.weight ?? 0.8))
    .slice(0, 1);
  if (packRefs.length > 0 && styleRefs.length === 0) {
    return NextResponse.json(
      { error: "Style references must be publicly accessible. Re-upload." },
      { status: 400 },
    );
  }

  let completed = 0;
  let failed = 0;
  const total = project.characters.filter(
    (character) => getCharacterHeadshotUrls(character).length > 0,
  ).length;

  for (const character of project.characters) {
    const headshotUrls = getCharacterHeadshotUrls(character);
    const publicHeadshots = headshotUrls
      .map((url) => toPublicAssetUrl(url))
      .filter((url): url is string => Boolean(url));
    if (publicHeadshots.length === 0) continue;

    const existing = await prisma.characterOmniRef.findUnique({
      where: {
        characterId_stylePresetId: {
          characterId: character.id,
          stylePresetId,
        },
      },
    });
    if (existing?.status === "ready") {
      completed += 1;
      continue;
    }

    const promptText =
      character.descriptionPrompt?.trim() ||
      buildOmniPrompt(character.name, undefined);

    const omniRef = await prisma.characterOmniRef.upsert({
      where: {
        characterId_stylePresetId: {
          characterId: character.id,
          stylePresetId,
        },
      },
      update: { status: "generating", errorMessage: null, promptText },
      create: {
        characterId: character.id,
        stylePresetId,
        status: "generating",
        promptText,
      },
    });
    await prisma.characterOmniVariant.updateMany({
      where: { characterId: character.id, stylePresetId },
      data: { isSelected: false },
    });

    publishProjectEvent(project.id, {
      message: `Generating omni refs ${completed + failed + 1}/${total}...`,
    });
    try {
      let identityKey = character.lumaIdentityKey;
      if (!identityKey) {
        const used = new Set(
          project.characters
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

      const variantCount = getOmniVariantCount();
      const variants = await Promise.all(
        Array.from({ length: variantCount }).map(async (_value, index) => {
          const modelUsed = "photon-flash-1";
          const aspectRatio = "3:4";
          const generation = await createImageGeneration({
            prompt: promptText,
            model: modelUsed,
            aspect_ratio: aspectRatio,
            style_ref: limitedStyleRefs.length ? limitedStyleRefs : undefined,
            character_ref: {
              [identityKey]: { images: publicHeadshots },
            },
          });
          const status = mapLumaStateToJobStatus(generation.state);
          return prisma.characterOmniVariant.create({
          data: {
            characterId: character.id,
            stylePresetId,
            omniRefId: omniRef.id,
            index,
            status,
            imageUrl: status === "ready" ? generation.assets?.image ?? null : null,
            lumaGenerationId: generation.id,
            promptUsed: promptText,
              modelUsed,
              aspectRatio,
            },
          });
        }),
      );

      const allReady = variants.every((variant) => variant.status === "ready");
      completed += 1;
      publishProjectEvent(project.id, {
        message: allReady
          ? `Omni refs ready for ${character.name} (${completed}/${total})`
          : `Omni refs queued for ${character.name} (${completed}/${total})`,
      });
    } catch (error) {
      console.error(`Omni ref failed for ${character.name}`, error);
      await prisma.characterOmniRef.update({
        where: {
          characterId_stylePresetId: {
            characterId: character.id,
            stylePresetId,
          },
        },
        data: {
          status: "error",
          errorMessage: (error as Error).message,
        },
      });
      failed += 1;
      publishProjectEvent(project.id, {
        message: `Omni ref failed for ${character.name}`,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    message: `Omni refs complete: ${completed} ready, ${failed} failed.`,
  });
}
