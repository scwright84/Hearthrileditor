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
  const brandedName =
    typeof body?.brandedName === "string" ? body.brandedName.trim() : undefined;
  const description =
    typeof body?.description === "string"
      ? body.description.trim()
      : undefined;
  const mjStyleModifier =
    typeof body?.mjStyleModifier === "string"
      ? body.mjStyleModifier.trim()
      : undefined;
  const promptInput =
    typeof body?.promptInput === "string"
      ? body.promptInput.trim()
      : undefined;
  const stylePrompt =
    typeof body?.stylePrompt === "string"
      ? body.stylePrompt.trim()
      : undefined;
  if (
    !brandedName &&
    description === undefined &&
    mjStyleModifier === undefined &&
    promptInput === undefined &&
    stylePrompt === undefined
  ) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const style = await prisma.animationStyle.findFirst({
    where: { id, ownerUserId: session.user.id },
  });
  if (!style) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.animationStyle.update({
    where: { id: style.id },
    data: {
      ...(brandedName ? { brandedName } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(mjStyleModifier !== undefined ? { mjStyleModifier } : {}),
      ...(promptInput !== undefined ? { promptInput } : {}),
      ...(stylePrompt !== undefined ? { stylePrompt } : {}),
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
  const style = await prisma.animationStyle.findFirst({
    where: { id, ownerUserId: session.user.id },
  });
  if (!style) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.animationStyle.delete({ where: { id: style.id } });

  return NextResponse.json({ ok: true });
}
