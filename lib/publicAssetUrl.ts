export function toPublicAssetUrl(input: string): string | null {
  if (!input) return null;
  if (/^https?:\/\//i.test(input)) return input;
  const base = process.env.PUBLIC_ASSET_BASE_URL?.replace(/\/+$/, "");
  if (!base) return null;
  if (input.startsWith("/")) return `${base}${input}`;
  return null;
}
