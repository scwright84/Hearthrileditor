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

  const updated = await prisma.scene.update({
    where: { id: params.id },
    data: {
      promptText: typeof body.promptText === "string" ? body.promptText : scene.promptText,
    },
  });

  return NextResponse.json(updated);
}
