import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { openai } from "@/lib/openai";
import { toPublicAssetUrl } from "@/lib/publicAssetUrl";
import fs from "fs/promises";
import path from "path";

const mimeForPath = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
};

const readImageBuffer = async (url: string) => {
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
      // fall back to local path
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
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const style = await prisma.animationStyle.findFirst({
    where: { id, ownerUserId: session.user.id },
  });
  if (!style) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const promptInput =
    typeof body?.promptInput === "string" ? body.promptInput.trim() : "";
  const referenceUrl = style.referenceImageUrl
    ? toPublicAssetUrl(style.referenceImageUrl) ?? style.referenceImageUrl
    : null;
  if (!referenceUrl && !promptInput) {
    return NextResponse.json(
      { error: "Provide a reference image or style notes." },
      { status: 400 },
    );
  }

  const messages: {
    role: "system" | "user";
    content:
      | string
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }[];
  }[] = [
    {
      role: "system",
      content:
        "You describe animation style reference images for prompt injection. Return JSON only with fields: stylePromptSentence. The sentence must add nuance beyond the notes, mention palette, lighting, texture, shapes, and camera feel, and end with: no text, no watermark.",
    },
  ];

  if (referenceUrl) {
    const { buffer, contentType } = await readImageBuffer(referenceUrl);
    const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Analyze the style reference image and produce a concise 1-2 sentence style prompt that captures palette, lighting, texture, brushwork, shapes, and camera feel. Avoid brand names and avoid mentioning the image. Do not copy the notes verbatim; add fresh descriptive detail. End with: no text, no watermark.",
        },
        ...(promptInput
          ? [
              {
                type: "text" as const,
                text: `Additional notes: ${promptInput}`,
              },
            ]
          : []),
        {
          type: "image_url",
          image_url: { url: dataUrl },
        },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: `Create a concise 1-2 sentence animation style prompt from these notes. Avoid brand names and avoid mentioning any image. Do not copy the notes verbatim; add fresh descriptive detail. End with: no text, no watermark. Notes: ${promptInput}`,
    });
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  let stylePromptSentence = "";
  try {
    const parsed = JSON.parse(raw) as { stylePromptSentence?: string };
    stylePromptSentence = parsed.stylePromptSentence?.trim() ?? "";
  } catch {
    stylePromptSentence = raw;
  }

  if (!stylePromptSentence) {
    return NextResponse.json(
      { error: "Failed to generate style prompt" },
      { status: 500 },
    );
  }

  if (!stylePromptSentence.toLowerCase().includes("no text")) {
    stylePromptSentence = `${stylePromptSentence.replace(/\.*$/, "")}, no text, no watermark.`;
  }

  const updated = await prisma.animationStyle.update({
    where: { id: style.id },
    data: { stylePrompt: stylePromptSentence, promptInput },
  });

  return NextResponse.json(updated);
}
