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
  const name = String(body?.name || "Style Pack").trim() || "Style Pack";

  const stylePack = await prisma.stylePack.create({
    data: {
      projectId: project.id,
      ownerUserId: session.user.id,
      name,
    },
  });

  await prisma.project.update({
    where: { id: project.id },
    data: { stylePackId: stylePack.id },
  });

  return NextResponse.json(stylePack);
}
