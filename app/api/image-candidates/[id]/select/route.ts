import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidate = await prisma.imageCandidate.findFirst({
    where: { id: params.id, scene: { project: { userId: session.user.id } } },
  });
  if (!candidate) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.imageCandidate.updateMany({
      where: { sceneId: candidate.sceneId },
      data: { isSelected: false },
    }),
    prisma.imageCandidate.update({
      where: { id: candidate.id },
      data: { isSelected: true },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
