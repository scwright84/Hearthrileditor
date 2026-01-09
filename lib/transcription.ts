type WordToken = { start: number; end: number; word: string };

export type TranscriptRowInput = {
  tSec: number;
  text: string;
  words?: WordToken[];
};

export function quantizeWordsToRows(words: WordToken[]): TranscriptRowInput[] {
  const buckets = new Map<number, WordToken[]>();
  for (const token of words) {
    const second = Math.floor(token.start);
    const existing = buckets.get(second) ?? [];
    existing.push(token);
    buckets.set(second, existing);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([tSec, tokens]) => ({
      tSec,
      text: tokens.map((token) => token.word).join(" ").trim(),
      words: tokens,
    }));
}
