import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";

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
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = getStorageProvider();
  const upload = await storage.uploadFile({
    data: buffer,
    contentType: file.type || "image/jpeg",
    keyPrefix: `characters/${character.projectId}`,
    originalName: file.name,
  });

  const existing = Array.isArray(character.imageUrls) ? character.imageUrls : [];
  const updated = await prisma.characterReference.update({
    where: { id: character.id },
    data: { imageUrls: [upload.url, ...existing] },
  });

  return NextResponse.json(updated);
}
