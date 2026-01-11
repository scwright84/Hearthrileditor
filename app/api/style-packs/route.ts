import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const packs = await prisma.stylePack.findMany({
    where: { ownerUserId: session.user.id, isGlobal: true },
    include: { styleRefs: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ updatedAt: "desc" }],
  });

  return NextResponse.json(packs, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name =
    typeof body?.name === "string" && body.name.trim()
      ? body.name.trim()
      : "Style Pack";

  const pack = await prisma.stylePack.create({
    data: {
      name,
      ownerUserId: session.user.id,
      isGlobal: true,
    },
    include: { styleRefs: { orderBy: { createdAt: "asc" } } },
  });

  return NextResponse.json(pack);
}
