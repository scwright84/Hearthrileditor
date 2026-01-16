import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  createImageGeneration,
  getOmniVariantCount,
  mapLumaStateToJobStatus,
} from "@/lib/lumaClient";
import { publishProjectEvent } from "@/lib/events";
import { toPublicAssetUrl } from "@/lib/publicAssetUrl";
import { buildOmniPrompt } from "@/lib/omniPrompt";

const USE_STYLE_PACK_REFS = process.env.USE_STYLE_PACK_REFS === "true";
const MAX_OMNI_PROMPT_CHARS = 700;
const clampPrompt = (prompt: string) => {
  if (prompt.length <= MAX_OMNI_PROMPT_CHARS) {
    return { text: prompt, truncated: false };
  }
  return {
    text: `${prompt.slice(0, MAX_OMNI_PROMPT_CHARS).trim()}…`,
    truncated: true,
  };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const stylePresetId = String(body?.stylePresetId || "");
  const model =
    body?.model === "photon-1" || body?.model === "photon-flash-1"
      ? body.model
      : "photon-flash-1";
  if (!stylePresetId) {
    return NextResponse.json({ error: "Style preset required" }, { status: 400 });
  }

  const character = await prisma.characterReference.findFirst({
    where: { id, project: { userId: session.user.id } },
    include: {
      omniRefs: true,
      project: {
        include: {
          stylePack: { include: { styleRefs: true } },
          styleRefs: true,
          characters: true,
          animationStyle: true,
        },
      },
    },
  });
  if (!character) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }


  const stylePreset = await prisma.stylePreset.findUnique({
    where: { id: stylePresetId },
  });
  if (!stylePreset) {
    return NextResponse.json({ error: "Style preset missing" }, { status: 400 });
  }

  const promptTextRaw =
    character.descriptionPrompt?.trim() ||
    buildOmniPrompt(
      character.name,
      undefined,
      character.project.animationStyle?.stylePrompt ??
        character.project.animationStyle?.description ??
        null,
      character.project.animationStyle?.mjStyleModifier ?? null,
    );
  const { text: promptText, truncated } = clampPrompt(promptTextRaw);

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
  publishProjectEvent(character.projectId, {
    message: `Generating omni ref for ${character.name}`,
  });

  try {
    const limitedStyleRefs = USE_STYLE_PACK_REFS
      ? (() => {
          const packRefs =
            character.project.stylePack?.styleRefs ??
            (character.project.styleRefs.length > 0
              ? character.project.styleRefs
              : []);
          const styleRefs = packRefs
            .map((ref) => ({
              url: toPublicAssetUrl(ref.imageUrl),
              weight: ref.weight ?? 0.8,
            }))
            .filter(
              (ref): ref is { url: string; weight: number } => Boolean(ref.url),
            );
          if (packRefs.length > 0 && styleRefs.length === 0) {
            return "error" as const;
          }
          return styleRefs
            .sort((a, b) => (b.weight ?? 0.8) - (a.weight ?? 0.8))
            .slice(0, 1);
        })()
      : [];

    if (limitedStyleRefs === "error") {
      return NextResponse.json(
        { error: "Style references must be publicly accessible. Re-upload." },
        { status: 400 },
      );
    }

    console.log("Luma omni request", {
      characterId: character.id,
      stylePresetId,
      mode: "prompt-only",
      styleRefUrls:
        limitedStyleRefs === "error"
          ? []
          : limitedStyleRefs.map((ref) => ref.url),
      promptLength: promptText.length,
      promptTruncated: truncated,
    });

    const variantCount = getOmniVariantCount();
    const variants = await Promise.all(
      Array.from({ length: variantCount }).map(async (_value, index) => {
        const modelUsed = model;
        const aspectRatio = "3:4";
        const generation = await createImageGeneration({
          prompt: promptText,
          model: modelUsed,
          aspect_ratio: aspectRatio,
          style_ref: undefined,
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
    if (allReady) {
      publishProjectEvent(character.projectId, {
        message: `Omni refs ready for ${character.name}`,
      });
    } else {
      publishProjectEvent(character.projectId, {
        message: `Omni refs queued for ${character.name}`,
      });
    }

    return NextResponse.json({
      ok: true,
      omniRefId: omniRef.id,
      variants,
    });
  } catch (error) {
    console.error("Omni ref generation failed", error);
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
    publishProjectEvent(character.projectId, {
      message: `Omni ref failed for ${character.name}`,
    });
    return NextResponse.json(
      { error: "Omni ref generation failed" },
      { status: 500 },
    );
  }
}
