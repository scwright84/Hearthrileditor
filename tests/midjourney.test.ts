import { describe, expect, it } from "vitest";
import { MockMidjourneyProvider } from "@/lib/midjourney";

describe("MockMidjourneyProvider", () => {
  it("returns four image URLs", async () => {
    const provider = new MockMidjourneyProvider();
    const result = await provider.generateGrid({ prompt: "Test prompt" });
    expect(result.images).toHaveLength(4);
  });

  it("returns a short animation clip", async () => {
    const provider = new MockMidjourneyProvider();
    const result = await provider.animate({
      imageUrl: "https://placehold.co/640x360",
      motion: "low",
    });
    expect(result.durationSec).toBeGreaterThan(0);
    expect(result.videoUrl).toContain("http");
  });
});
