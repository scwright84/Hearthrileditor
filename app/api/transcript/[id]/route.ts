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

  const row = await prisma.transcriptRow.findFirst({
    where: { id: params.id, project: { userId: session.user.id } },
  });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const text = typeof body.text === "string" ? body.text : row.text;

  const updated = await prisma.transcriptRow.update({
    where: { id: row.id },
    data: { text },
  });

  return NextResponse.json(updated);
}
