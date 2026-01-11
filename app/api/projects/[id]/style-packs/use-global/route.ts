import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

  const body = await request.json().catch(() => ({}));
  const sourcePackId = String(body?.stylePackId || "");
  if (!sourcePackId) {
    return NextResponse.json({ error: "Style pack required" }, { status: 400 });
  }

  const sourcePack = await prisma.stylePack.findFirst({
    where: { id: sourcePackId, isGlobal: true, ownerUserId: session.user.id },
    include: { styleRefs: true },
  });
  if (!sourcePack) {
    return NextResponse.json({ error: "Style pack not found" }, { status: 404 });
  }

  const newPack = await prisma.stylePack.create({
    data: {
      projectId: project.id,
      ownerUserId: session.user.id,
      name: sourcePack.name,
    },
  });

  if (sourcePack.styleRefs.length > 0) {
    await prisma.styleRef.createMany({
      data: sourcePack.styleRefs.map((ref) => ({
        projectId: project.id,
        stylePackId: newPack.id,
        name: ref.name,
        imageUrl: ref.imageUrl,
        weight: ref.weight,
      })),
    });
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { stylePackId: newPack.id },
  });

  return NextResponse.json(newPack);
}
