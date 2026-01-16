import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getGeneration, mapLumaStateToJobStatus } from "@/lib/lumaClient";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const variant = await prisma.animationStyleVariant.findFirst({
    where: { id, animationStyle: { ownerUserId: session.user.id } },
  });
  if (!variant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!variant.lumaGenerationId) {
    return NextResponse.json(
      { error: "Missing generation id" },
      { status: 400 },
    );
  }

  const generation = await getGeneration(variant.lumaGenerationId);
  const status = mapLumaStateToJobStatus(generation.state);
  const updated = await prisma.animationStyleVariant.update({
    where: { id: variant.id },
    data: {
      status,
      imageUrl:
        status === "ready" ? generation.assets?.image ?? variant.imageUrl : variant.imageUrl,
      failureReason:
        status === "error" ? generation.failure_reason ?? "Generation failed" : null,
    },
  });

  if (status === "ready") {
    await prisma.animationStyle.update({
      where: { id: variant.animationStyleId },
      data: {
        imageUrl: updated.imageUrl,
        selectedVariantId: updated.id,
      },
    });
  }

  return NextResponse.json(updated);
}
