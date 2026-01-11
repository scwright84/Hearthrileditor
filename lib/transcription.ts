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

type SegmentToken = { start: number; end: number; text: string };

export function quantizeSegmentsToRows(
  segments: SegmentToken[],
): TranscriptRowInput[] {
  const buckets = new Map<number, string[]>();
  for (const segment of segments) {
    const start = Math.floor(segment.start);
    const end = Math.floor(segment.end);
    for (let second = start; second <= end; second += 1) {
      const existing = buckets.get(second) ?? [];
      existing.push(segment.text);
      buckets.set(second, existing);
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([tSec, texts]) => ({
      tSec,
      text: texts.join(" ").replace(/\s+/g, " ").trim(),
    }))
    .filter((row) => row.text.length > 0);
}
