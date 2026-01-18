import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const scene = await prisma.scene.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!scene) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nextStartMs =
    typeof body.startMs === "number" && Number.isFinite(body.startMs)
      ? Math.max(0, Math.floor(body.startMs))
      : scene.startMs;
  const nextEndMs =
    typeof body.endMs === "number" && Number.isFinite(body.endMs)
      ? Math.max(0, Math.floor(body.endMs))
      : scene.endMs;
  if (nextEndMs <= nextStartMs) {
    return NextResponse.json(
      { error: "endMs must be greater than startMs" },
      { status: 400 },
    );
  }

  const updated = await prisma.scene.update({
    where: { id: params.id },
    data: {
      promptText: typeof body.promptText === "string" ? body.promptText : scene.promptText,
      startMs: nextStartMs,
      endMs: nextEndMs,
    },
  });

  return NextResponse.json(updated);
}
