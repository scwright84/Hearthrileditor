import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { openai } from "@/lib/openai";
import { getCharacterHeadshotUrl } from "@/lib/characters";
import { buildOmniPrompt } from "@/lib/omniPrompt";
import fs from "fs/promises";
import path from "path";

const mimeForPath = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
};

const readHeadshotBuffer = async (url: string) => {
  if (url.startsWith("http")) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const contentType =
          response.headers.get("content-type") ?? "image/jpeg";
        return { buffer: Buffer.from(arrayBuffer), contentType };
      }
    } catch {
      // Fall through to local path fallback.
    }
    const parsed = new URL(url);
    const localPath = path.join(process.cwd(), "public", parsed.pathname);
    const buffer = await fs.readFile(localPath);
    return { buffer, contentType: mimeForPath(localPath) };
  }

  const localPath = path.join(
    process.cwd(),
    "public",
    url.startsWith("/") ? url : `/${url}`,
  );
  const buffer = await fs.readFile(localPath);
  return { buffer, contentType: mimeForPath(localPath) };
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const character = await prisma.characterReference.findFirst({
    where: { id, project: { userId: session.user.id } },
    include: { project: { include: { stylePack: { include: { styleRefs: true } } } } },
  });
  if (!character) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const headshotUrl = getCharacterHeadshotUrl(character);
  if (!headshotUrl) {
    return NextResponse.json({ error: "Headshot required" }, { status: 400 });
  }

  let dataUrl: string | null = null;
  try {
    const { buffer, contentType } = await readHeadshotBuffer(headshotUrl);
    const base64 = buffer.toString("base64");
    dataUrl = `data:${contentType};base64,${base64}`;
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to read headshot image" },
      { status: 400 },
    );
  }

  const styleRefs = character.project.stylePack?.styleRefs ?? [];
  const styleImages = await Promise.all(
    styleRefs.slice(0, 3).map(async (ref) => {
      try {
        const { buffer, contentType } = await readHeadshotBuffer(ref.imageUrl);
        const base64 = buffer.toString("base64");
        return `data:${contentType};base64,${base64}`;
      } catch {
        return null;
      }
    }),
  );
  const styleDataUrls = styleImages.filter(
    (url): url is string => Boolean(url),
  );

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "You extract up to three short, comma-separated traits for a family-friendly, stylized animation character prompt. Focus on distinctive facial features and overall vibe. Avoid exact replication, brand names, and full sentences. Output traits only, no extra words.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Look at the headshot and the style references. Return up to three short, comma-separated traits that capture likeness for a family-friendly stylized animation character (e.g., 'young child, curly brown hair, warm smile').",
          },
          {
            type: "image_url",
            image_url: { url: dataUrl },
          },
          ...styleDataUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url },
          })),
        ],
      },
    ],
  });

  const traits = response.choices[0]?.message?.content?.trim();
  if (!traits) {
    return NextResponse.json(
      { error: "Failed to generate prompt" },
      { status: 500 },
    );
  }

  const descriptionPrompt = buildOmniPrompt(character.name, traits);
  const updated = await prisma.characterReference.update({
    where: { id: character.id },
    data: { descriptionPrompt },
  });

  return NextResponse.json({ descriptionPrompt: updated.descriptionPrompt });
}
