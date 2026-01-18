import { z } from "zod";
import { openai } from "@/lib/openai";

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
export type StoryboardRow = { A: string; B: string; C: string; D: string };

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

const CAMERA_KEYWORDS = [
  "wide",
  "medium",
  "close",
  "close-up",
  "closeup",
  "macro",
  "overhead",
  "top-down",
  "over-the-shoulder",
  "ots",
  "establishing",
  "insert",
  "two-shot",
  "profile",
];

const MOTION_KEYWORDS = [
  "static",
  "locked-off",
  "still",
  "slow dolly",
  "dolly",
  "pan",
  "slow pan",
  "tilt",
  "tracking",
  "track",
  "push-in",
  "push in",
  "pull-back",
  "pull back",
  "handheld",
];

const TIME_OF_DAY_KEYWORDS = [
  "morning",
  "midday",
  "afternoon",
  "sunset",
  "night",
  "dawn",
  "dusk",
];

const FORBIDDEN_PHRASES = ["same", "returns", "cut back", "as before"];

const normalizeWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const defaultTimeOfDay = "morning";
const defaultCamera = "wide";
const defaultMotion = "static";

const removeForbiddenPhrases = (text: string) => {
  let next = text;
  FORBIDDEN_PHRASES.forEach((phrase) => {
    const pattern = new RegExp(`\\b${phrase}\\b`, "gi");
    next = next.replace(pattern, "");
  });
  return normalizeWhitespace(next);
};

const normalizeTimestampInput = (timestamp: unknown): string | number => {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    return timestamp;
  }
  if (typeof timestamp === "string") {
    return timestamp;
  }
  if (timestamp && typeof timestamp === "object") {
    const candidate =
      (timestamp as { start?: string | number }).start ??
      (timestamp as { t?: string | number }).t ??
      (timestamp as { end?: string | number }).end;
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string") {
      return candidate;
    }
  }
  throw new Error(`Invalid timestamp: ${String(timestamp)}`);
};

const timestampToSeconds = (timestamp: string | number) => {
  const input = normalizeTimestampInput(timestamp);
  if (typeof input === "number") {
    return input;
  }
  const trimmed = input.trim();
  const direct = Number(trimmed);
  if (!Number.isNaN(direct) && Number.isFinite(direct)) {
    return direct;
  }
  const match = trimmed.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid timestamp: ${trimmed}`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
};

export const secondsToTimestamp = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

const fillTranscriptGaps = (
  rows: Array<{ t: string; text: string }>,
): Array<{ t: string; text: string }> => {
  if (!rows.length) return [];
  const sorted = rows
    .map((row) => ({ t: row.t.trim(), text: normalizeWhitespace(row.text ?? "") }))
    .filter((row) => row.t)
    .sort((a, b) => timestampToSeconds(a.t) - timestampToSeconds(b.t));
  if (!sorted.length) return [];
  const map = new Map<number, string>();
  sorted.forEach((row) => {
    const sec = timestampToSeconds(row.t);
    const existing = map.get(sec);
    map.set(sec, existing ? normalizeWhitespace(`${existing} ${row.text}`) : row.text);
  });
  const startSec = timestampToSeconds(sorted[0].t);
  const endSec = timestampToSeconds(sorted[sorted.length - 1].t);
  const filled: Array<{ t: string; text: string }> = [];
  for (let sec = startSec; sec <= endSec; sec += 1) {
    filled.push({
      t: secondsToTimestamp(sec),
      text: map.get(sec) ?? "",
    });
  }
  return filled;
};

export function parseTranscript(
  input: string | Array<{ t?: string; text?: string; tSec?: number }>,
): Array<{ t: string; text: string }> {
  if (Array.isArray(input)) {
    const normalized = input
      .map((row) => {
        const t =
          row.t?.trim() ??
          (typeof row.tSec === "number" && Number.isFinite(row.tSec)
            ? secondsToTimestamp(row.tSec)
            : "");
        return {
          t,
          text: normalizeWhitespace(row.text ?? ""),
        };
      })
      .filter((row) => row.t);
    return fillTranscriptGaps(normalized);
  }

  const parsed = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[?(\d{2}:\d{2}:\d{2})\]?\s*(.*)$/i);
      if (!match) return null;
      return {
        t: match[1],
        text: normalizeWhitespace(match[2] ?? ""),
      };
    })
    .filter(Boolean) as Array<{ t: string; text: string }>;
  return fillTranscriptGaps(parsed);
}

type StoryboardClip = {
  start: string;
  end: string;
  verbatim_transcript: string;
  focal_point: string;
  luma_prompt: string;
};

type StoryboardOutput = {
  clips: StoryboardClip[];
};

const safeParseJson = (raw: string) => {
  try {
    return JSON.parse(raw) as StoryboardOutput;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Failed to parse JSON output.");
    }
    return JSON.parse(match[0]) as StoryboardOutput;
  }
};

const containsAny = (haystack: string, keywords: string[]) => {
  const lower = haystack.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
};

const collectTranscriptRange = (
  transcript: Array<{ t: string; text: string }>,
  startSec: number,
  endSec: number,
) => {
  return transcript
    .filter((row) => {
      const sec = timestampToSeconds(row.t);
      return sec >= startSec && sec < endSec;
    })
    .map((row) => row.text)
    .join(" ")
    .trim();
};

const buildClipPlan = (transcript: Array<{ t: string; text: string }>) => {
  if (!transcript.length) return [];
  const rows = transcript
    .map((row) => ({
      sec: timestampToSeconds(row.t),
      text: row.text,
    }))
    .sort((a, b) => a.sec - b.sec);
  const seconds = rows.map((row) => row.sec);
  const planSeconds: number[][] = [];
  let current: number[] = [];
  let lastPunctIndex = -1;

  rows.forEach((row, idx) => {
    current.push(row.sec);
    const endsWithPunct = /[.!?]$/.test(row.text.trim());
    if (endsWithPunct) {
      lastPunctIndex = current.length - 1;
    }
    if (current.length >= 2 && lastPunctIndex === current.length - 1) {
      planSeconds.push([...current]);
      current = [];
      lastPunctIndex = -1;
      return;
    }
    if (current.length >= 5) {
      if (lastPunctIndex >= 1 && lastPunctIndex <= 4) {
        const head = current.slice(0, lastPunctIndex + 1);
        const tail = current.slice(lastPunctIndex + 1);
        planSeconds.push(head);
        current = [...tail];
        lastPunctIndex = /[.!?]$/.test(
          rows[idx - tail.length + 1]?.text?.trim() ?? "",
        )
          ? current.length - 1
          : -1;
      } else {
        planSeconds.push([...current]);
        current = [];
        lastPunctIndex = -1;
      }
    }
  });

  if (current.length) {
    planSeconds.push([...current]);
  }

  if (planSeconds.length >= 2) {
    const last = planSeconds[planSeconds.length - 1];
    const prev = planSeconds[planSeconds.length - 2];
    if (last.length === 1) {
      if (prev.length >= 3) {
        const shifted = prev.pop();
        if (shifted !== undefined) {
          last.unshift(shifted);
        }
      } else {
        planSeconds[planSeconds.length - 2] = prev.concat(last);
        planSeconds.pop();
      }
    }
  }

  return planSeconds.map((secs) => {
    const clipStart = secs[0];
    const clipEnd = secs[secs.length - 1] + 1;
    const verbatim = normalizeWhitespace(
      collectTranscriptRange(transcript, clipStart, clipEnd),
    );
    return {
      start: secondsToTimestamp(clipStart),
      end: secondsToTimestamp(clipEnd),
      verbatim,
    };
  });
};

const ensurePromptCompliance = (params: {
  prompt: string;
  setting: string;
  animationStyle: string;
  verbatim: string;
  focalPoint: string;
}) => {
  let next = normalizeWhitespace(params.prompt || "");
  if (!next) {
    next = `${defaultCamera} ${defaultMotion}`;
  }
  if (!containsAny(next, CAMERA_KEYWORDS)) {
    next = `${defaultCamera} ${next}`;
  }
  if (!containsAny(next, MOTION_KEYWORDS)) {
    next = `${defaultMotion} ${next}`;
  }
  if (!containsAny(next, TIME_OF_DAY_KEYWORDS)) {
    next = `${next} ${defaultTimeOfDay}`;
  }
  if (params.setting.trim().length > 0) {
    const lower = next.toLowerCase();
    const tokens = params.setting
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 4);
    const hasSettingToken =
      tokens.length === 0 || tokens.some((token) => lower.includes(token));
    if (!hasSettingToken) {
      next = `${next} ${params.setting}`;
    }
  }
  if (params.animationStyle.trim().length > 0) {
    const styleLower = params.animationStyle.toLowerCase();
    if (!next.toLowerCase().includes(styleLower)) {
      next = `${next} ${params.animationStyle}`;
    }
  }
  if (params.focalPoint && params.focalPoint !== "Other") {
    const focalLower = params.focalPoint.toLowerCase();
    if (!next.toLowerCase().includes(focalLower)) {
      next = `${next} featuring ${params.focalPoint}`;
    }
  }
  if (params.verbatim.trim().length > 0) {
    next = `${next} ${params.verbatim}`;
  }
  next = removeForbiddenPhrases(next);
  return normalizeWhitespace(next);
};

const validateStoryboard = (params: {
  transcript: Array<{ t: string; text: string }>;
  focalPoints: string[];
  setting: string;
  output: StoryboardOutput;
}) => {
  const errors: string[] = [];
  const transcriptSeconds = params.transcript.map((row) =>
    timestampToSeconds(row.t),
  );
  const transcriptMap = new Map(
    params.transcript.map((row) => [timestampToSeconds(row.t), row.text]),
  );

  if (!params.output?.clips?.length) {
    errors.push("No clips returned.");
    return errors;
  }

  const allowedFocalPoints = new Set(
    params.focalPoints.concat("Other").map((item) => item.trim()),
  );
  const coverage = new Map<number, number>();
  transcriptSeconds.forEach((sec) => coverage.set(sec, 0));
  const maxTranscriptSec =
    transcriptSeconds.length > 0 ? transcriptSeconds.at(-1)! : 0;

  params.output.clips.forEach((clip, index) => {
    const startSec = timestampToSeconds(clip.start);
    const endSec = timestampToSeconds(clip.end);
    const duration = endSec - startSec;
    if (duration < 2 || duration > 5) {
      errors.push(`Clip ${index} duration ${duration}s is outside 2–5s.`);
    }
    if (!transcriptMap.has(startSec)) {
      errors.push(`Clip ${index} start ${clip.start} not in transcript.`);
    }
    if (!(transcriptMap.has(endSec) || endSec === maxTranscriptSec + 1)) {
      errors.push(`Clip ${index} end ${clip.end} not aligned to transcript.`);
    }

    const lines = [];
    for (let sec = startSec; sec < endSec; sec += 1) {
      if (!transcriptMap.has(sec)) {
        errors.push(`Clip ${index} references missing transcript second ${sec}.`);
        continue;
      }
      lines.push(transcriptMap.get(sec) ?? "");
      coverage.set(sec, (coverage.get(sec) ?? 0) + 1);
    }
    const expected = normalizeWhitespace(
      collectTranscriptRange(params.transcript, startSec, endSec) ||
        lines.join(" "),
    );
    const provided = normalizeWhitespace(clip.verbatim_transcript ?? "");
    if (expected !== provided) {
      errors.push(`Clip ${index} verbatim transcript mismatch.`);
    }

    if (!allowedFocalPoints.has(clip.focal_point)) {
      errors.push(`Clip ${index} focal point "${clip.focal_point}" not allowed.`);
    }

    const prompt = clip.luma_prompt ?? "";
    if (!containsAny(prompt, CAMERA_KEYWORDS)) {
      errors.push(`Clip ${index} missing camera framing keyword.`);
    }
    if (!containsAny(prompt, MOTION_KEYWORDS)) {
      errors.push(`Clip ${index} missing motion keyword.`);
    }
    if (!containsAny(prompt, TIME_OF_DAY_KEYWORDS)) {
      errors.push(`Clip ${index} missing time-of-day keyword.`);
    }
    if (params.setting.trim().length > 0) {
      const promptLower = prompt.toLowerCase();
      const tokens = params.setting
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((token) => token.length >= 4);
      const hasSettingToken =
        tokens.length === 0 ||
        tokens.some((token) => promptLower.includes(token));
      if (!hasSettingToken) {
        errors.push(`Clip ${index} missing setting reference.`);
      }
    }
    const lowerPrompt = prompt.toLowerCase();
    FORBIDDEN_PHRASES.forEach((phrase) => {
      if (lowerPrompt.includes(phrase)) {
        errors.push(`Clip ${index} includes forbidden phrase "${phrase}".`);
      }
    });
  });

  transcriptSeconds.forEach((sec) => {
    const count = coverage.get(sec) ?? 0;
    if (count !== 1) {
      errors.push(`Second ${secondsToTimestamp(sec)} covered ${count} times.`);
    }
  });

  return errors;
};

const buildMessages = (payload: {
  transcript: Array<{ t: string; text: string }>;
  focalPoints: string[];
  animationStyle: string;
  setting: string;
  clipPlan?: Array<{ start: string; end: string; verbatim: string }>;
  previousJson?: StoryboardOutput;
  validationErrors?: string[];
}) => {
  const transcriptText = payload.transcript
    .map((row) => `[${row.t}] ${row.text}`)
    .join("\n");
  const allowedTimestamps = payload.transcript.map((row) => row.t);
  const lastTimestamp = allowedTimestamps.at(-1);
  const lastTimestampPlusOne = lastTimestamp
    ? secondsToTimestamp(timestampToSeconds(lastTimestamp) + 1)
    : null;
  const focalPoints = payload.focalPoints.join(", ");
  const baseInstructions = [
    "You are a storyboard generator. Output JSON ONLY in the schema:",
    "{ clips: [ { start, end, verbatim_transcript, focal_point, luma_prompt } ] }",
    "",
    "Rules:",
    "- Cover every transcript second exactly once, no gaps, no overlaps.",
    "- Clip durations must be 2–5 seconds inclusive.",
    "- Clip boundaries align to 1-second timestamps.",
    "- verbatim_transcript must be the exact concatenation of transcript lines with single spaces.",
    "- Do NOT add or remove words, punctuation, or casing from transcript lines.",
    "- focal_point must be one of allowed focal points or \"Other\".",
    "- luma_prompt must include camera framing, motion, setting, time-of-day.",
    "- Use explicit camera framing (wide/medium/close/OTS/top-down/establishing).",
    "- Use explicit motion (static/slow dolly/pan/tilt/tracking/handheld).",
    "- Include the setting phrase verbatim if provided.",
    "- Include a time-of-day keyword: morning, midday, afternoon, sunset, night, dawn, or dusk.",
    "- Each prompt must be standalone and contain no references to prior shots.",
    "- No MJ parameters or --sref.",
    "- Use ONLY the allowed timestamps for clip start/end. End can be last timestamp + 1 second.",
  ];

  const userParts = [
    `Allowed focal points: ${focalPoints || "Other"}`,
    `Animation style: ${payload.animationStyle}`,
    `Setting: ${payload.setting}`,
    `Allowed timestamps: ${allowedTimestamps.join(", ")}`,
    lastTimestampPlusOne
      ? `Allowed end timestamp (last + 1s): ${lastTimestampPlusOne}`
      : null,
    payload.clipPlan?.length
      ? `Clip plan (do not change start/end/verbatim): ${JSON.stringify(
          payload.clipPlan,
        )}`
      : null,
    "",
    "Transcript:",
    transcriptText,
  ].filter(Boolean);

  if (payload.previousJson && payload.validationErrors?.length) {
    userParts.unshift(
      "Fix the previous JSON output. Only change what is required to satisfy constraints.",
      `Validation errors:\n- ${payload.validationErrors.join("\n- ")}`,
      "",
      `Previous JSON:\n${JSON.stringify(payload.previousJson)}`,
      "",
    );
  }

  return [
    { role: "system" as const, content: baseInstructions.join("\n") },
    { role: "user" as const, content: userParts.join("\n") },
  ];
};

export async function generateStoryboardClips(input: {
  transcript: Array<{ t: string; text: string }>;
  focalPoints: string[];
  animationStyle: string;
  setting: string;
  maxRepairPasses?: number;
}): Promise<{ rows: StoryboardRow[]; clips: StoryboardClip[] }> {
  const transcript = parseTranscript(input.transcript);
  const clipPlan = buildClipPlan(transcript);
  const maxRepairPasses = input.maxRepairPasses ?? 2;
  let attempt = 0;
  let previous: StoryboardOutput | undefined;
  let errors: string[] = [];

  while (attempt <= maxRepairPasses) {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_STORYBOARD_MODEL ?? "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: buildMessages({
        transcript,
        focalPoints: input.focalPoints,
        animationStyle: input.animationStyle,
        setting: input.setting,
        clipPlan,
        previousJson: previous,
        validationErrors: errors.length ? errors : undefined,
      }),
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = safeParseJson(content);
    const allowedFocalPoints = new Set(
      input.focalPoints.concat("Other").map((item) => item.trim()),
    );
    const normalizedClips = clipPlan.map((planClip, index) => {
      const candidate = parsed.clips?.[index];
      const focal =
        candidate?.focal_point && allowedFocalPoints.has(candidate.focal_point)
          ? candidate.focal_point
          : "Other";
      const fallbackPrompt = ensurePromptCompliance({
        prompt: candidate?.luma_prompt ?? "",
        setting: input.setting,
        animationStyle: input.animationStyle,
        verbatim: planClip.verbatim,
        focalPoint: focal,
      });
      return {
        start: planClip.start,
        end: planClip.end,
        verbatim_transcript: planClip.verbatim,
        focal_point: focal,
        luma_prompt: fallbackPrompt,
      };
    });
    const normalizedOutput: StoryboardOutput = { clips: normalizedClips };
    errors = validateStoryboard({
      transcript,
      focalPoints: input.focalPoints,
      setting: input.setting,
      output: normalizedOutput,
    });

    if (errors.length === 0) {
      const rows = normalizedOutput.clips.map((clip) => ({
        A: clip.start,
        B: normalizeWhitespace(clip.verbatim_transcript),
        C: clip.focal_point,
        D: clip.luma_prompt.trim(),
      }));
      return { rows, clips: normalizedOutput.clips };
    }

    previous = normalizedOutput;
    attempt += 1;
  }

  throw new Error(
    `Failed to generate a valid storyboard after ${maxRepairPasses + 1} attempts:\n${errors.join("\n")}`,
  );
}

export async function generateStoryboard(input: {
  transcript: Array<{ t: string; text: string }>;
  focalPoints: string[];
  animationStyle: string;
  setting: string;
  maxRepairPasses?: number;
}): Promise<StoryboardRow[]> {
  const result = await generateStoryboardClips(input);
  return result.rows;
}
