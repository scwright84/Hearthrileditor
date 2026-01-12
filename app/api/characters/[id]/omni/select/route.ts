import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: characterId } = await params;
  const body = await request.json().catch(() => null);
  const stylePresetId = String(body?.stylePresetId || "");
  const variantId = String(body?.variantId || "");

  if (!stylePresetId || !variantId) {
    return NextResponse.json(
      { error: "stylePresetId and variantId are required" },
      { status: 400 },
    );
  }

  const variant = await prisma.characterOmniVariant.findFirst({
    where: {
      id: variantId,
      characterId,
      stylePresetId,
      character: { project: { userId: session.user.id } },
    },
  });
  if (!variant) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }
  if (!variant.imageUrl) {
    return NextResponse.json(
      { error: "Variant not ready yet" },
      { status: 400 },
    );
  }

  const [, , updatedRef] = await prisma.$transaction([
    prisma.characterOmniVariant.updateMany({
      where: { characterId, stylePresetId },
      data: { isSelected: false },
    }),
    prisma.characterOmniVariant.update({
      where: { id: variant.id },
      data: { isSelected: true },
    }),
    prisma.characterOmniRef.upsert({
      where: {
        characterId_stylePresetId: {
          characterId,
          stylePresetId,
        },
      },
      update: {
        status: "ready",
        imageUrl: variant.imageUrl,
        providerJobId: variant.lumaGenerationId,
        selectedVariantId: variant.id,
        errorMessage: null,
      },
      create: {
        characterId,
        stylePresetId,
        status: "ready",
        imageUrl: variant.imageUrl,
        providerJobId: variant.lumaGenerationId,
        selectedVariantId: variant.id,
      },
    }),
  ]);

  return NextResponse.json(updatedRef);
}
