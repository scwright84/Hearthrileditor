import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";
import { getOmniVariantCount } from "@/lib/lumaClient";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const character = await prisma.characterReference.findFirst({
    where: { id, project: { userId: session.user.id } },
  });
  if (!character) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const stylePresetId = String(formData.get("stylePresetId") ?? "").trim();
  if (!stylePresetId) {
    return NextResponse.json({ error: "Style preset required" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = getStorageProvider();
  const upload = await storage.uploadFile({
    data: buffer,
    contentType: file.type || "image/jpeg",
    keyPrefix: `uploads/${character.projectId}/omni-manual`,
    originalName: file.name,
  });

  const omniRef = await prisma.characterOmniRef.upsert({
    where: {
      characterId_stylePresetId: {
        characterId: character.id,
        stylePresetId,
      },
    },
    update: { status: "ready", errorMessage: null },
    create: {
      characterId: character.id,
      stylePresetId,
      status: "ready",
    },
  });

  const existingCount = await prisma.characterOmniVariant.count({
    where: { characterId: character.id, stylePresetId },
  });

  const variant = await prisma.characterOmniVariant.create({
    data: {
      characterId: character.id,
      stylePresetId,
      omniRefId: omniRef.id,
      index: existingCount + getOmniVariantCount(),
      status: "ready",
      imageUrl: upload.url,
      promptUsed: "manual upload",
      modelUsed: "manual",
      aspectRatio: "3:4",
    },
  });

  return NextResponse.json({ variant });
}
