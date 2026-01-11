import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    include: {
      audioAsset: true,
      transcript: { orderBy: { tSec: "asc" } },
      scenes: {
        orderBy: { index: "asc" },
        include: {
          imageCandidates: {
            where: { run: { isActive: true } },
            orderBy: { createdAt: "asc" },
          },
          animationClips: { orderBy: { createdAt: "asc" } },
        },
      },
      characters: {
        include: {
          omniRefs: true,
          omniVariants: { orderBy: { createdAt: "asc" } },
        },
      },
      stylePack: {
        include: {
          styleRefs: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: {
      title: typeof body.title === "string" ? body.title : project.title,
      stylePresetId:
        typeof body.stylePresetId === "string"
          ? body.stylePresetId
          : project.stylePresetId,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stylePacks = await prisma.stylePack.findMany({
    where: { projectId: project.id, isGlobal: false },
    select: { id: true },
  });
  const stylePackIds = stylePacks.map((pack) => pack.id);

  await prisma.$transaction([
    prisma.animationClip.deleteMany({
      where: { scene: { projectId: project.id } },
    }),
    prisma.imageCandidate.deleteMany({
      where: { scene: { projectId: project.id } },
    }),
    prisma.imageGenerationRun.deleteMany({
      where: { scene: { projectId: project.id } },
    }),
    prisma.scene.deleteMany({ where: { projectId: project.id } }),
    prisma.transcriptRow.deleteMany({ where: { projectId: project.id } }),
    prisma.exportRender.deleteMany({ where: { projectId: project.id } }),
    prisma.audioAsset.deleteMany({ where: { projectId: project.id } }),
    prisma.characterOmniVariant.deleteMany({
      where: { character: { projectId: project.id } },
    }),
    prisma.characterOmniRef.deleteMany({
      where: { character: { projectId: project.id } },
    }),
    prisma.characterReference.deleteMany({ where: { projectId: project.id } }),
    prisma.styleRef.deleteMany({ where: { projectId: project.id } }),
    ...(stylePackIds.length > 0
      ? [prisma.styleRef.deleteMany({ where: { stylePackId: { in: stylePackIds } } })]
      : []),
    ...(stylePackIds.length > 0
      ? [prisma.stylePack.deleteMany({ where: { id: { in: stylePackIds } } })]
      : []),
    prisma.project.delete({ where: { id: project.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
