import { buildAnimationStylePrompt } from "./animationStyle";

const BASE_PROMPT_PERSON =
  "Family-friendly stylized character, animation-ready, medium close-up, centered composition, front-facing, neutral relaxed posture, plain studio background, clean silhouette, soft studio lighting, no text, no watermark.";
const BASE_PROMPT_NONPERSON =
  "Family-friendly stylized character, animation-ready, medium close-up, centered composition, front-facing, neutral relaxed posture, plain studio background, clean silhouette, soft studio lighting, no text, no watermark.";

const extractTraitList = (traits?: string | null) => {
  if (!traits) return [];
  const cleaned = traits.replace(/\.+$/, "").trim();
  if (!cleaned) return [];
  return cleaned
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 6);
};

export const buildOmniPrompt = (
  name: string,
  description?: string | null,
  animationStyleDescription?: string | null,
  mjStyleModifier?: string | null,
  subjectType?: string | null,
): string => {
  const safeName = name.trim();
  const styleNotes = buildAnimationStylePrompt(
    animationStyleDescription,
    mjStyleModifier,
  );
  const styleSentence = styleNotes
    ? `Animation style: ${styleNotes}.`
    : "";
  const base =
    subjectType && subjectType.toLowerCase() === "person"
      ? BASE_PROMPT_PERSON
      : BASE_PROMPT_NONPERSON;
  const cleanDescription = description?.trim();
  if (cleanDescription) {
    const sentence = cleanDescription.endsWith(".")
      ? cleanDescription
      : `${cleanDescription}.`;
    return `Stylized character reference portrait of ${safeName}. ${sentence} ${styleSentence} ${base}`.trim();
  }
  const traitList = extractTraitList(description);
  if (traitList.length > 0) {
    return `Stylized character reference portrait of ${safeName}. This character has ${traitList.join(
      ", ",
    )}. ${styleSentence} ${base}`.trim();
  }
  return `Stylized character reference portrait of ${safeName}. ${styleSentence} ${base}`.trim();
};
