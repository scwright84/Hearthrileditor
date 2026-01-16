import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { openai } from "@/lib/openai";
import { getCharacterHeadshotUrl } from "@/lib/characters";
import { buildOmniPrompt } from "@/lib/omniPrompt";
import fs from "fs/promises";
import path from "path";

const USE_STYLE_PACK_REFS = process.env.USE_STYLE_PACK_REFS === "true";

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
    include: {
      project: {
        include: {
          stylePack: { include: { styleRefs: true } },
          animationStyle: true,
        },
      },
    },
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

  let styleRefDataUrl: string | null = null;
  const animationStyleUrl = character.project.animationStyle?.referenceImageUrl;
  if (animationStyleUrl) {
    try {
      const { buffer, contentType } = await readHeadshotBuffer(animationStyleUrl);
      const base64 = buffer.toString("base64");
      styleRefDataUrl = `data:${contentType};base64,${base64}`;
    } catch {
      styleRefDataUrl = null;
    }
  }

  const styleDataUrls = USE_STYLE_PACK_REFS
    ? (
        await Promise.all(
          (character.project.stylePack?.styleRefs ?? [])
            .slice(0, 3)
            .map(async (ref) => {
              try {
                const { buffer, contentType } = await readHeadshotBuffer(
                  ref.imageUrl,
                );
                const base64 = buffer.toString("base64");
                return `data:${contentType};base64,${base64}`;
              } catch {
                return null;
              }
            }),
        )
      ).filter((url): url is string => Boolean(url))
    : [];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Return JSON only. Required fields: subjectType (human|dog|cat|other), finalPrompt (a single prompt string). Optional fields: styleDescriptors (array of 4-8 short style adjectives from the style reference), genderPresentation (female|male|unspecified, only for humans), ancestry (black|white|east asian|south asian|latino|middle eastern|native|mixed|other), skinToneScale (very light|light|medium|medium-dark|dark|very dark for humans, or fur color for animals), ageOrLifeStage, breedLikely, eyeColor, eyeShape, eyeSize, eyebrowShape, noseShape, noseSize, mouthShape, mouthSize, lipShape, faceShape, cheekFullness, chinShape, headProportion, hairOrFurTexture, hairStyleOrFurLength, earShape, muzzleShape, expression, distinctiveMarks. finalPrompt must be 1-2 sentences, highly specific to the subject (age, ancestry/skin tone, eyes, nose, mouth/lips, face shape, hair/fur, expression) and include a style clause using concrete adjectives (not 'match style'). End with composition constraints: character reference, medium close-up, front-facing, centered, plain studio background, clean silhouette, soft studio lighting, no text, no watermark. No brand names, no mention of images/photos.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: USE_STYLE_PACK_REFS
              ? "Create a character reference prompt for Luma/Midjourney using the headshot and style references. The prompt must be specific to the subject's likeness (age/life stage, ancestry/skin tone, eyes, nose, mouth/lips, face shape, hair/fur, expression). Extract 4-8 concrete style adjectives from the style reference image and include them. Return JSON."
              : "Create a character reference prompt for Luma/Midjourney using the headshot and the animation style reference image. The prompt must be specific to the subject's likeness (age/life stage, ancestry/skin tone, eyes, nose, mouth/lips, face shape, hair/fur, expression). Extract 4-8 concrete style adjectives from the style reference image and include them. Return JSON.",
          },
          ...(styleRefDataUrl
            ? [
                {
                  type: "image_url" as const,
                  image_url: { url: styleRefDataUrl },
                },
              ]
            : []),
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

  const rawTraits = response.choices[0]?.message?.content?.trim() ?? "";
  const extractJsonBlock = (input: string) => {
    const fenced = input.match(/```json\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();
    return input;
  };
  let descriptionSentence = "";
  let finalPrompt: string | null = null;
  let styleDescriptors: string[] = [];
  let subjectType: string | null = null;
  let traits: Record<string, string> = {};
  try {
    const parsed = JSON.parse(extractJsonBlock(rawTraits)) as Record<
      string,
      string | undefined
    >;
    const normalizedType = parsed.subjectType?.trim()?.toLowerCase() ?? null;
    subjectType =
      normalizedType === "human" ? "person" : normalizedType ?? null;
    finalPrompt = parsed.finalPrompt?.trim() ?? null;
    if (Array.isArray(parsed.styleDescriptors)) {
      styleDescriptors = parsed.styleDescriptors
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .slice(0, 8);
    }
    traits = Object.fromEntries(
      Object.entries(parsed)
        .filter(
          ([key, value]) =>
            key !== "subjectType" && key !== "finalPrompt" && Boolean(value),
        )
        .map(([key, value]) => [key, String(value).trim()]),
    );
  } catch {
    descriptionSentence = extractJsonBlock(rawTraits);
  }

  const buildStructuredDescription = () => {
    const subject = subjectType?.toLowerCase();
    if (subject === "person") {
      const gender = traits.genderPresentation ?? null;
      const age = traits.ageOrLifeStage ? `${traits.ageOrLifeStage}` : "person";
      const ancestry = traits.ancestry ? `${traits.ancestry}` : null;
      const skin = traits.skinToneScale
        ? `${traits.skinToneScale} skin tone`
        : traits.skinToneOrFurColor
          ? `${traits.skinToneOrFurColor} skin tone`
          : null;
      const eyes = traits.eyeColor || traits.eyeShape || traits.eyeSize
        ? [traits.eyeSize, traits.eyeShape, traits.eyeColor]
            .filter(Boolean)
            .join(" ")
        : null;
      const brows = traits.eyebrowShape ? `${traits.eyebrowShape} eyebrows` : null;
      const nose = [traits.noseSize, traits.noseShape]
        .filter(Boolean)
        .join(" ");
      const mouth = [traits.mouthShape, traits.lipShape]
        .filter(Boolean)
        .join(" ");
      const face = traits.faceShape ? `${traits.faceShape} face` : null;
      const cheeks = traits.cheekFullness ? `${traits.cheekFullness} cheeks` : null;
      const chin = traits.chinShape ? `${traits.chinShape} chin` : null;
      const head = traits.headProportion
        ? `${traits.headProportion} head proportion`
        : null;
      const hair = [
        traits.hairOrFurTexture,
        traits.hairStyleOrFurLength,
      ]
        .filter(Boolean)
        .join(" ");
      const expression = traits.expression ? `${traits.expression} expression` : null;
      const marks = traits.distinctiveMarks ? traits.distinctiveMarks : null;

      const lead = [age, gender, ancestry, skin]
        .filter(Boolean)
        .join(", ");
      const features = [
        eyes ? `${eyes} eyes` : null,
        brows,
        nose ? `${nose} nose` : null,
        mouth ? `${mouth} mouth` : null,
        face,
        cheeks,
        chin,
        head,
        hair ? `${hair} hair` : null,
        expression,
        marks,
      ]
        .filter(Boolean)
        .join(", ");

      if (!lead && !features) return "";
      if (!features) return `A ${lead}.`;
      if (!lead) return `A person with ${features}.`;
      return `A ${lead} with ${features}.`;
    }

    const lifeStage = traits.ageOrLifeStage ?? "animal";
    const breed = traits.breedLikely ? `${traits.breedLikely}` : null;
    const coat = traits.skinToneScale
      ? `${traits.skinToneScale} coat`
      : traits.skinToneOrFurColor
        ? `${traits.skinToneOrFurColor} coat`
        : null;
    const fur = traits.hairOrFurTexture ? `${traits.hairOrFurTexture} fur` : null;
    const furLength = traits.hairStyleOrFurLength
      ? `${traits.hairStyleOrFurLength} fur`
      : null;
    const eyes = traits.eyeColor || traits.eyeShape || traits.eyeSize
      ? [traits.eyeSize, traits.eyeShape, traits.eyeColor]
          .filter(Boolean)
          .join(" ")
      : null;
    const nose = [traits.noseSize, traits.noseShape].filter(Boolean).join(" ");
    const muzzle = traits.muzzleShape ? `${traits.muzzleShape} muzzle` : null;
    const ears = traits.earShape ? `${traits.earShape} ears` : null;
    const head = traits.faceShape ? `${traits.faceShape} head shape` : null;
    const expression = traits.expression ? `${traits.expression} expression` : null;
    const marks = traits.distinctiveMarks ? traits.distinctiveMarks : null;

    const lead = [lifeStage, breed].filter(Boolean).join(" ");
    const features = [
      coat,
      fur,
      furLength,
      eyes ? `${eyes} eyes` : null,
      nose ? `${nose} nose` : null,
      muzzle,
      ears,
      head,
      expression,
      marks,
    ]
      .filter(Boolean)
      .join(", ");

    if (!features) return lead ? `A ${lead}.` : "";
    return lead ? `A ${lead} with ${features}.` : `An animal with ${features}.`;
  };

  if (!descriptionSentence) {
    descriptionSentence = buildStructuredDescription();
  }

  const looksSentence = (value: string) => {
    const words = value.split(/\s+/).filter(Boolean);
    const hasPunctuation = /[.!?]/.test(value);
    return words.length >= 10 && hasPunctuation;
  };

  if (!descriptionSentence) {
    return NextResponse.json(
      { error: "Failed to generate prompt" },
      { status: 500 },
    );
  }

  if (!looksSentence(descriptionSentence)) {
    const rewrite = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "Rewrite the input into 1-2 natural language sentences that describe the subject's visual traits. Include age/life stage and facial structure details. No brand names, no mention of images or photos.",
        },
        {
          role: "user",
          content: `Rewrite as natural description sentence(s): ${descriptionSentence}`,
        },
      ],
    });
    const rewritten = rewrite.choices[0]?.message?.content?.trim();
    if (rewritten) {
      descriptionSentence = rewritten;
    }
  }

  const fallbackStyle =
    styleDescriptors.length > 0
      ? styleDescriptors.join(", ")
      : character.project.animationStyle?.stylePrompt ??
        character.project.animationStyle?.description ??
        null;

  const descriptionPrompt = finalPrompt
    ? finalPrompt
    : buildOmniPrompt(
        character.name,
        descriptionSentence,
        fallbackStyle,
        character.project.animationStyle?.mjStyleModifier ?? null,
        subjectType,
      );
  const updated = await prisma.characterReference.update({
    where: { id: character.id },
    data: { descriptionPrompt },
  });

  return NextResponse.json({ descriptionPrompt: updated.descriptionPrompt });
}
