import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const styleRef = await prisma.styleRef.findFirst({
    where: {
      id,
      OR: [
        { project: { userId: session.user.id } },
        { stylePack: { ownerUserId: session.user.id } },
        { stylePack: { project: { userId: session.user.id } } },
      ],
    },
  });
  if (!styleRef) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const weight =
    typeof body.weight === "number" ? Math.max(0, body.weight) : styleRef.weight;
  const name = typeof body.name === "string" ? body.name.trim() : styleRef.name;

  const updated = await prisma.styleRef.update({
    where: { id: styleRef.id },
    data: {
      weight,
      name,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const styleRef = await prisma.styleRef.findFirst({
    where: {
      id,
      OR: [
        { project: { userId: session.user.id } },
        { stylePack: { ownerUserId: session.user.id } },
        { stylePack: { project: { userId: session.user.id } } },
      ],
    },
  });
  if (!styleRef) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.styleRef.delete({ where: { id: styleRef.id } });
  return NextResponse.json({ ok: true });
}
