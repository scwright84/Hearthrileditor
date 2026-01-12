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
  const variant = await prisma.characterOmniVariant.findFirst({
    where: {
      id,
      character: { project: { userId: session.user.id } },
    },
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

  let generation;
  try {
    generation = await getGeneration(variant.lumaGenerationId);
  } catch (error) {
    console.error("Omni variant poll failed", {
      variantId: variant.id,
      lumaGenerationId: variant.lumaGenerationId,
      error: (error as Error).message,
    });
    return NextResponse.json(variant);
  }
  const status = mapLumaStateToJobStatus(generation.state);

  const updated = await prisma.characterOmniVariant.update({
    where: { id: variant.id },
    data: {
      status,
      imageUrl:
        status === "ready" ? generation.assets?.image ?? variant.imageUrl : variant.imageUrl,
      failureReason:
        status === "error" ? generation.failure_reason ?? "Generation failed" : null,
    },
  });

  if (status === "error") {
    console.error("Omni variant failed", {
      variantId: variant.id,
      lumaGenerationId: variant.lumaGenerationId,
      failureReason: generation.failure_reason ?? "Generation failed",
    });
  }

  return NextResponse.json(updated);
}
