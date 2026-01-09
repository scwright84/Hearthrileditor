import { describe, expect, it } from "vitest";
import { quantizeWordsToRows } from "@/lib/transcription";

describe("quantizeWordsToRows", () => {
  it("groups words by floor start time into 1-second buckets", () => {
    const rows = quantizeWordsToRows([
      { start: 0.1, end: 0.2, word: "Hello" },
      { start: 0.9, end: 1.1, word: "world" },
      { start: 1.2, end: 1.4, word: "again" },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].tSec).toBe(0);
    expect(rows[0].text).toBe("Hello world");
    expect(rows[1].tSec).toBe(1);
    expect(rows[1].text).toBe("again");
  });
});
