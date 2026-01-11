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
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  const name = String(formData.get("name") ?? "").trim() || null;
  const stylePackIdInput = String(formData.get("stylePackId") ?? "").trim();
  const weightValue = formData.get("weight");
  const weight = weightValue ? Number(weightValue) : undefined;

  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = getStorageProvider();
  const upload = await storage.uploadFile({
    data: buffer,
    contentType: file.type || "image/jpeg",
    keyPrefix: `styles/${project.id}`,
    originalName: file.name,
  });

  let stylePackId = stylePackIdInput;
  if (!stylePackId) {
    if (project.stylePackId) {
      stylePackId = project.stylePackId;
    } else {
      const createdPack = await prisma.stylePack.create({
        data: {
          projectId: project.id,
          ownerUserId: session.user.id,
          name: "Style Pack",
        },
      });
      stylePackId = createdPack.id;
      await prisma.project.update({
        where: { id: project.id },
        data: { stylePackId },
      });
    }
  }

  const styleRef = await prisma.styleRef.create({
    data: {
      projectId: project.id,
      stylePackId,
      name,
      imageUrl: upload.url,
      weight: Number.isFinite(weight) ? Number(weight) : undefined,
    },
  });

  return NextResponse.json(styleRef);
}
