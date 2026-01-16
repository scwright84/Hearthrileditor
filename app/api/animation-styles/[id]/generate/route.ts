import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createImageGeneration, getStyleVariantCount, mapLumaStateToJobStatus } from "@/lib/lumaClient";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const style = await prisma.animationStyle.findFirst({
    where: { id, ownerUserId: session.user.id },
  });
  if (!style) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const promptText = style.stylePrompt?.trim() || style.description;
  if (!promptText) {
    return NextResponse.json(
      { error: "Style prompt required" },
      { status: 400 },
    );
  }

  const variantCount = getStyleVariantCount();
  const variants = await Promise.all(
    Array.from({ length: variantCount }).map(async (_value, index) => {
      const modelUsed = "photon-flash-1";
      const aspectRatio = "1:1";
      const generation = await createImageGeneration({
        prompt: promptText,
        model: modelUsed,
        aspect_ratio: aspectRatio,
      });
      const status = mapLumaStateToJobStatus(generation.state);
      return prisma.animationStyleVariant.create({
        data: {
          animationStyleId: style.id,
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

  return NextResponse.json({ ok: true, variants });
}
