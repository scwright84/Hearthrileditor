import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ANIMATION_STYLES_CATALOG } from "@/lib/animationStylesCatalog";

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.user.upsert({
    where: { id: session.user.id },
    update: {
      email: session.user.email ?? undefined,
      name: session.user.name ?? undefined,
      image: session.user.image ?? undefined,
    },
    create: {
      id: session.user.id,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
    },
  });

  const existing = await prisma.animationStyle.findMany({
    where: { ownerUserId: session.user.id },
  });
  const existingIds = new Set(existing.map((style) => style.id));
  const toCreate = ANIMATION_STYLES_CATALOG.filter(
    (style) => !existingIds.has(style.id),
  );
  if (toCreate.length > 0) {
    await prisma.animationStyle.createMany({
      data: toCreate.map((style) => ({
        id: style.id,
        ownerUserId: session.user.id,
        internalStyleRef: style.internal_style_ref,
        brandedName: style.branded_name,
        defaultCategories: style.default_categories,
        description: style.description,
        mjStyleModifier: style.mj_style_modifier ?? null,
        referenceImageUrl: style.reference_image_url ?? null,
      })),
      skipDuplicates: true,
    });
  }

  await Promise.all(
    ANIMATION_STYLES_CATALOG.map((style) =>
      prisma.animationStyle.updateMany({
        where: {
          id: style.id,
          ownerUserId: session.user.id,
          OR: [{ referenceImageUrl: null }, { referenceImageUrl: "" }],
        },
        data: {
          ...(style.reference_image_url
            ? { referenceImageUrl: style.reference_image_url }
            : {}),
        },
      }),
    ),
  );

  await Promise.all(
    ANIMATION_STYLES_CATALOG.map((style) =>
      prisma.animationStyle.updateMany({
        where: {
          id: style.id,
          ownerUserId: session.user.id,
          OR: [{ promptInput: null }, { promptInput: "" }],
        },
        data: style.description ? { promptInput: style.description } : {},
      }),
    ),
  );

  await Promise.all(
    ANIMATION_STYLES_CATALOG.map((style) =>
      prisma.animationStyle.updateMany({
        where: {
          id: style.id,
          ownerUserId: session.user.id,
          OR: [{ stylePrompt: null }, { stylePrompt: "" }],
        },
        data: style.description ? { stylePrompt: style.description } : {},
      }),
    ),
  );

  const styles = await prisma.animationStyle.findMany({
    where: { ownerUserId: session.user.id },
    include: { variants: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(styles);
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const brandedName =
    typeof body?.brandedName === "string" ? body.brandedName.trim() : "";
  const description =
    typeof body?.description === "string" ? body.description.trim() : "";
  if (!brandedName || !description) {
    return NextResponse.json(
      { error: "Name and description are required" },
      { status: 400 },
    );
  }

  const style = await prisma.animationStyle.create({
    data: {
      ownerUserId: session.user.id,
      internalStyleRef: "",
      brandedName,
      defaultCategories: [],
      description,
      mjStyleModifier: null,
    },
  });

  return NextResponse.json(style);
}
