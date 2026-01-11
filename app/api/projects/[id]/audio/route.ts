import path from "path";
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAudioDurationSeconds } from "@/lib/ffmpeg";
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

  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = getStorageProvider();
  const upload = await storage.uploadFile({
    data: buffer,
    contentType: file.type || "audio/mpeg",
    keyPrefix: `uploads/${project.id}`,
    originalName: file.name,
  });

  let durationSec: number | null = null;
  if (process.env.STORAGE_PROVIDER !== "s3") {
    const localPath = path.join(process.cwd(), "public", upload.key);
    durationSec = await getAudioDurationSeconds(localPath);
  }

  const audioAsset = await prisma.audioAsset.upsert({
    where: { projectId: project.id },
    update: {
      originalUrl: upload.url,
      durationSec: durationSec ?? undefined,
      trimStartSec: 0,
      trimEndSec: durationSec ?? undefined,
      fadeInSec: 0,
      fadeOutSec: 0,
    },
    create: {
      projectId: project.id,
      originalUrl: upload.url,
      durationSec: durationSec ?? undefined,
      trimStartSec: 0,
      trimEndSec: durationSec ?? undefined,
      fadeInSec: 0,
      fadeOutSec: 0,
    },
  });

  return NextResponse.json(audioAsset);
}

export async function PATCH(
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

  const body = await request.json();
  const trimStartSec = Number(body?.trimStartSec ?? 0);
  const trimEndSec = Number(body?.trimEndSec ?? 0);
  const fadeInSec = Number(body?.fadeInSec ?? 0);
  const fadeOutSec = Number(body?.fadeOutSec ?? 0);

  const audioAsset = await prisma.audioAsset.update({
    where: { projectId: project.id },
    data: { trimStartSec, trimEndSec, fadeInSec, fadeOutSec },
  });

  return NextResponse.json(audioAsset);
}
