type OmniRef = {
  id: string;
  stylePresetId: string;
  status: "pending" | "generating" | "ready" | "error";
  imageUrl?: string | null;
  errorMessage?: string | null;
};

type Character = {
  id: string;
  name: string;
  imageUrls?: unknown;
  omniRefs?: OmniRef[];
};

export function getCharacterHeadshotUrl(character: Character): string | null {
  const urls = getCharacterHeadshotUrls(character);
  return urls[0] ?? null;
}

export function getCharacterHeadshotUrls(character: Character): string[] {
  const urls = Array.isArray(character.imageUrls) ? character.imageUrls : [];
  return urls.filter((url): url is string => typeof url === "string");
}

export function getOmniRefForStyle(
  character: Character,
  stylePresetId?: string | null,
) {
  if (!stylePresetId) return null;
  return character.omniRefs?.find((ref) => ref.stylePresetId === stylePresetId) ?? null;
}

export function characterStatusForStyle(
  character: Character,
  stylePresetId?: string | null,
) {
  const omniRef = getOmniRefForStyle(character, stylePresetId);
  if (!stylePresetId) return "needs-style";
  if (!getCharacterHeadshotUrl(character)) return "missing-headshot";
  if (!omniRef) return "needs-omni";
  if (omniRef.status === "generating") return "generating";
  if (omniRef.status === "error") return "error";
  if (omniRef.status === "ready") return "ready";
  return "needs-omni";
}
