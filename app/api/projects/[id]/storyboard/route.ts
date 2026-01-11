import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishProjectEvent } from "@/lib/events";
import { openai } from "@/lib/openai";
import {
  buildDefaultScenesFromTranscript,
  validateStoryboardScenes,
} from "@/lib/storyboard";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    include: {
      transcript: { orderBy: { tSec: "asc" } },
      stylePreset: true,
      characters: {
        include: {
          omniRefs: true,
        },
      },
      audioAsset: true,
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (project.transcript.length === 0) {
    return NextResponse.json({ error: "Transcript missing" }, { status: 400 });
  }

  if (!project.stylePresetId) {
    return NextResponse.json(
      { error: "Style preset required" },
      { status: 400 },
    );
  }

  const missingOmni = project.characters.filter((character) => {
    const omni = character.omniRefs.find(
      (ref) => ref.stylePresetId === project.stylePresetId,
    );
    return !omni || omni.status !== "ready";
  });
  if (missingOmni.length > 0) {
    return NextResponse.json(
      { error: "Omni refs required for all characters" },
      { status: 400 },
    );
  }

  publishProjectEvent(project.id, { message: "Storyboard generating" });

  const durationSec =
    project.audioAsset?.durationSec ??
    (project.transcript.at(-1)?.tSec ?? 0) + 1;
  const stylePresetId = project.stylePreset?.id ?? project.stylePresetId ?? "";
  const styleSuffixTag = project.stylePreset?.suffixTag ?? "--sref 800";

  let scenes = buildDefaultScenesFromTranscript(project.transcript, {
    durationSec,
    stylePresetId,
    styleSuffixTag,
  });

  if (process.env.OPENAI_API_KEY) {
    const transcriptText = project.transcript
      .map((row) => `[${row.tSec}s] ${row.text}`)
      .join("\n");
    const characters = project.characters.map((char) => char.name).join(", ");
    const styleTag = styleSuffixTag;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a storyboard generator. Return STRICT JSON with key 'scenes' only.",
        },
        {
          role: "user",
          content: [
            "Generate storyboard scenes with these rules:",
            "- default scene length 5.2s",
            "- one character maximum per scene",
            "- prompt begins with camera direction",
            "- prompt is self-contained",
            `- prompt ends with style tag ${styleTag}`,
            "- add extra scenes extra-1..extra-3 at the end",
            "",
            "Return JSON with:",
            "{ scenes: [ { scene_id, start_ms, end_ms, transcript_span_text, focal_point, prompt_text, style_preset_id, character_ref_id, status } ] }",
            "",
            `Style preset id: ${stylePresetId}`,
            `Characters: ${characters || "Narrator"}`,
            "Transcript:",
            transcriptText,
          ].join("\n"),
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(content);
      scenes = validateStoryboardScenes(parsed.scenes);
    } catch (error) {
      console.error("Storyboard JSON parse failed", error);
    }
  }

  await prisma.$transaction([
    prisma.scene.deleteMany({ where: { projectId: project.id } }),
    prisma.scene.createMany({
      data: scenes.map((scene, index) => ({
        projectId: project.id,
        index,
        startMs: scene.start_ms,
        endMs: scene.end_ms,
        transcriptSpanText: scene.transcript_span_text,
        focalPoint: scene.focal_point,
        promptText: scene.prompt_text,
        stylePresetId: scene.style_preset_id,
        characterRefId: scene.character_ref_id ?? undefined,
        status: scene.status,
      })),
    }),
  ]);

  publishProjectEvent(project.id, { message: "Storyboard ready" });

  return NextResponse.json({ ok: true });
}
