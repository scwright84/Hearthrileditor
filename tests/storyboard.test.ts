import { describe, expect, it } from "vitest";
import { validateStoryboardScenes } from "@/lib/storyboard";

describe("validateStoryboardScenes", () => {
  it("accepts valid storyboard JSON", () => {
    const scenes = validateStoryboardScenes([
      {
        scene_id: "scene-1",
        start_ms: 0,
        end_ms: 5200,
        transcript_span_text: "Hello world",
        focal_point: "Narrator",
        prompt_text:
          "Wide shot of a sunrise over rail tracks, cinematic light --sref 800",
        style_preset_id: "style-1",
        character_ref_id: null,
        status: "draft",
      },
    ]);

    expect(scenes[0].scene_id).toBe("scene-1");
  });
});
