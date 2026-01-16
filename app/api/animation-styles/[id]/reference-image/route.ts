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
  const style = await prisma.animationStyle.findFirst({
    where: { id, ownerUserId: session.user.id },
  });
  if (!style) {
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
    keyPrefix: `animation-styles/${style.id}`,
    originalName: file.name,
  });

  const updated = await prisma.animationStyle.update({
    where: { id: style.id },
    data: { referenceImageUrl: upload.url },
  });

  return NextResponse.json(updated);
}
