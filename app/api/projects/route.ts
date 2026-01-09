import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function getDefaultStylePresetId() {
  const existing = await prisma.stylePreset.findFirst();
  if (existing) return existing.id;
  const created = await prisma.stylePreset.create({
    data: {
      name: "Cinematic Warmth",
      suffixTag: "--sref 800",
      defaultParams: { aspect: "16:9", stylize: 120 },
    },
  });
  return created.id;
}

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const title = String(body?.title || "Untitled Project");
  const stylePresetId = await getDefaultStylePresetId();

  const project = await prisma.project.create({
    data: {
      title,
      userId: session.user.id,
      stylePresetId,
    },
  });

  return NextResponse.json(project);
}
