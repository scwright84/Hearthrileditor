import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const variant = await prisma.characterOmniVariant.findFirst({
    where: {
      id: params.id,
      character: { project: { userId: session.user.id } },
    },
  });
  if (!variant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!variant.imageUrl) {
    return NextResponse.json(
      { error: "Variant not ready yet" },
      { status: 400 },
    );
  }

  await prisma.$transaction([
    prisma.characterOmniVariant.updateMany({
      where: {
        characterId: variant.characterId,
        stylePresetId: variant.stylePresetId,
      },
      data: { isSelected: false },
    }),
    prisma.characterOmniVariant.update({
      where: { id: variant.id },
      data: { isSelected: true },
    }),
    prisma.characterOmniRef.upsert({
      where: {
        characterId_stylePresetId: {
          characterId: variant.characterId,
          stylePresetId: variant.stylePresetId,
        },
      },
      update: {
        status: "ready",
        imageUrl: variant.imageUrl,
        providerJobId: variant.lumaGenerationId,
        errorMessage: null,
      },
      create: {
        characterId: variant.characterId,
        stylePresetId: variant.stylePresetId,
        status: "ready",
        imageUrl: variant.imageUrl,
        providerJobId: variant.lumaGenerationId,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
