const BASE_PROMPT =
  "Character reference portrait of {NAME}, family-friendly, stylized illustration, non-photorealistic, animation-ready, medium close-up, centered composition, front-facing, neutral relaxed posture, soft approachable expression, expressive eyes, simple neutral outfit, plain minimal studio background, clean silhouette, consistent proportions, soft studio lighting, sharp focus, high detail, no text, no watermark";

const extractTraitList = (traits?: string | null) => {
  if (!traits) return [];
  const cleaned = traits.replace(/\.+$/, "").trim();
  if (!cleaned) return [];
  return cleaned
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 3);
};

export const buildOmniPrompt = (
  name: string,
  traits?: string | null,
): string => {
  const safeName = name.trim();
  const traitList = extractTraitList(traits);
  if (traitList.length > 0) {
    return BASE_PROMPT.replace("{NAME}", `${safeName}, ${traitList.join(", ")}`);
  }
  return BASE_PROMPT.replace("{NAME}", safeName);
};
