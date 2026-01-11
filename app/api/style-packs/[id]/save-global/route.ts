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

  const pack = await prisma.stylePack.findFirst({
    where: { id: params.id, ownerUserId: session.user.id, isGlobal: false },
    include: { styleRefs: true },
  });
  if (!pack) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const globalPack = await prisma.stylePack.create({
    data: {
      ownerUserId: session.user.id,
      name: pack.name,
      isGlobal: true,
    },
  });

  if (pack.styleRefs.length > 0) {
    await prisma.styleRef.createMany({
      data: pack.styleRefs.map((ref) => ({
        stylePackId: globalPack.id,
        name: ref.name,
        imageUrl: ref.imageUrl,
        weight: ref.weight,
      })),
    });
  }

  return NextResponse.json(globalPack);
}
