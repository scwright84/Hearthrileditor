import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const pack = await prisma.stylePack.findFirst({
    where: {
      id,
      ownerUserId: session.user.id,
    },
  });
  if (!pack) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.stylePack.update({
    where: { id: pack.id },
    data: { name },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
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

  await prisma.project.updateMany({
    where: { stylePackId: pack.id },
    data: { stylePackId: null },
  });

  await prisma.$transaction([
    prisma.styleRef.deleteMany({ where: { stylePackId: pack.id } }),
    prisma.stylePack.delete({ where: { id: pack.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
