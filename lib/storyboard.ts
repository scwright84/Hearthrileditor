import { z } from "zod";

export const sceneSchema = z.object({
  scene_id: z.string(),
  start_ms: z.number().int().nonnegative(),
  end_ms: z.number().int().positive(),
  transcript_span_text: z.string(),
  focal_point: z.string(),
  prompt_text: z.string(),
  style_preset_id: z.string(),
  character_ref_id: z.string().nullable().optional(),
  status: z.enum(["draft", "generating", "ready", "error"]),
});

export const storyboardSchema = z.array(sceneSchema);

export type StoryboardScene = z.infer<typeof sceneSchema>;

export function validateStoryboardScenes(input: unknown): StoryboardScene[] {
  return storyboardSchema.parse(input);
}

export function buildDefaultScenesFromTranscript(
  transcriptRows: { tSec: number; text: string }[],
  options: {
    durationSec: number;
    sceneLengthSec?: number;
    stylePresetId: string;
    styleSuffixTag: string;
  },
): StoryboardScene[] {
  const sceneLengthSec = options.sceneLengthSec ?? 5.2;
  const totalScenes = Math.max(1, Math.ceil(options.durationSec / sceneLengthSec));
  const scenes: StoryboardScene[] = [];

  for (let index = 0; index < totalScenes; index += 1) {
    const startSec = index * sceneLengthSec;
    const endSec = Math.min(options.durationSec, (index + 1) * sceneLengthSec);
    const spanText = transcriptRows
      .filter((row) => row.tSec >= Math.floor(startSec) && row.tSec < Math.ceil(endSec))
      .map((row) => row.text)
      .join(" ")
      .trim();

    scenes.push({
      scene_id: `scene-${index + 1}`,
      start_ms: Math.round(startSec * 1000),
      end_ms: Math.round(endSec * 1000),
      transcript_span_text: spanText,
      focal_point: "Narrator",
      prompt_text:
        `Wide establishing shot of a warm workshop, cinematic light, highly detailed ${options.styleSuffixTag}`,
      style_preset_id: options.stylePresetId,
      character_ref_id: null,
      status: "draft",
    });
  }

  for (let extraIndex = 0; extraIndex < 3; extraIndex += 1) {
    scenes.push({
      scene_id: `extra-${extraIndex + 1}`,
      start_ms: Math.round(options.durationSec * 1000),
      end_ms: Math.round((options.durationSec + sceneLengthSec) * 1000),
      transcript_span_text: "",
      focal_point: "Narrator",
      prompt_text:
        `Slow dolly shot through a quiet station hall, ambient glow, cinematic framing ${options.styleSuffixTag}`,
      style_preset_id: options.stylePresetId,
      character_ref_id: null,
      status: "draft",
    });
  }

  return scenes;
}
