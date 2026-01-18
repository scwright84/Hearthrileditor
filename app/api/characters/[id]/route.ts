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
  const body = await request.json().catch(() => ({}));
  const name =
    typeof body?.name === "string" ? body.name.trim() : undefined;
  const descriptionPrompt =
    typeof body?.descriptionPrompt === "string"
      ? body.descriptionPrompt.trim()
      : undefined;
  if (!name && !descriptionPrompt) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const character = await prisma.characterReference.findFirst({
    where: { id, project: { userId: session.user.id } },
  });
  if (!character) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.characterReference.update({
    where: { id: character.id },
    data: {
      ...(name ? { name } : {}),
      ...(descriptionPrompt !== undefined
        ? { descriptionPrompt }
        : {}),
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
  const character = await prisma.characterReference.findFirst({
    where: { id, project: { userId: session.user.id } },
  });
  if (!character) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.scene.updateMany({
      where: { characterRefId: character.id },
      data: { characterRefId: null },
    }),
    prisma.characterOmniVariant.deleteMany({
      where: { characterId: character.id },
    }),
    prisma.characterOmniRef.deleteMany({
      where: { characterId: character.id },
    }),
    prisma.characterReference.delete({
      where: { id: character.id },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
