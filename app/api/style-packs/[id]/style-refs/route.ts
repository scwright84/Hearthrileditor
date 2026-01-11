import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pack = await prisma.stylePack.findFirst({
    where: { id, ownerUserId: session.user.id },
  });
  if (!pack) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  const name = String(formData.get("name") ?? "").trim() || null;
  const weightValue = formData.get("weight");
  const weight = weightValue ? Number(weightValue) : undefined;

  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = getStorageProvider();
  const upload = await storage.uploadFile({
    data: buffer,
    contentType: file.type || "image/jpeg",
    keyPrefix: `styles/packs/${pack.id}`,
    originalName: file.name,
  });

  const styleRef = await prisma.styleRef.create({
    data: {
      stylePackId: pack.id,
      projectId: pack.projectId ?? undefined,
      name,
      imageUrl: upload.url,
      weight: Number.isFinite(weight) ? Number(weight) : undefined,
    },
  });

  return NextResponse.json(styleRef);
}
