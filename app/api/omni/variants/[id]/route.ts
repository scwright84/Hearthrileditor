import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const variant = await prisma.characterOmniVariant.findFirst({
    where: {
      id,
      character: { project: { userId: session.user.id } },
    },
  });
  if (!variant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.characterOmniVariant.delete({ where: { id: variant.id } });
    if (variant.isSelected) {
      await tx.characterOmniRef.updateMany({
        where: {
          characterId: variant.characterId,
          stylePresetId: variant.stylePresetId,
          selectedVariantId: variant.id,
        },
        data: {
          selectedVariantId: null,
          imageUrl: null,
          providerJobId: null,
          status: "pending",
        },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
