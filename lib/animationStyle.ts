const BLOCKED_STYLE_TERMS = [
  "pixar",
  "dreamworks",
  "disney",
  "illumination",
  "studio ghibli",
  "ghibli",
  "laika",
  "sony animation",
  "blue sky",
  "cartoon network",
  "nickelodeon",
];

export const sanitizeAnimationStyleDescriptors = (input?: string | null) => {
  if (!input) return "";
  let output = input;
  for (const term of BLOCKED_STYLE_TERMS) {
    const pattern = new RegExp(`\\b${term}\\b`, "gi");
    output = output.replace(pattern, "");
  }
  return output.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
};

export const buildAnimationStylePrompt = (
  description?: string | null,
  mjStyleModifier?: string | null,
) => {
  const combined = [description, mjStyleModifier].filter(Boolean).join(", ");
  return sanitizeAnimationStyleDescriptors(combined);
};
