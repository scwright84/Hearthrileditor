import { randomUUID } from "crypto";

export type MidjourneyGridInput = {
  prompt: string;
};

export type MidjourneyAnimateInput = {
  imageUrl: string;
  motion: "low" | "high";
};

export interface MidjourneyProvider {
  generateGrid(input: MidjourneyGridInput): Promise<{
    jobId: string;
    images: string[];
  }>;
  animate(input: MidjourneyAnimateInput): Promise<{
    jobId: string;
    videoUrl: string;
    durationSec: number;
  }>;
  generateOmniRef(input: {
    headshotUrl: string;
    characterName: string;
    styleTag: string;
    stylePresetId: string;
  }): Promise<{ jobId: string; imageUrl: string; promptText: string }>;
}

export class MockMidjourneyProvider implements MidjourneyProvider {
  async generateGrid(input: MidjourneyGridInput) {
    const jobId = `mock-${randomUUID()}`;
    const encoded = encodeURIComponent(input.prompt.slice(0, 40));
    const images = Array.from({ length: 4 }).map(
      (_, index) =>
        `https://placehold.co/640x360?text=Scene+${index + 1}%0A${encoded}`,
    );
    return { jobId, images };
  }

  async animate(input: MidjourneyAnimateInput) {
    const jobId = `mock-${randomUUID()}`;
    return {
      jobId,
      videoUrl:
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
      durationSec: 5,
    };
  }

  async generateOmniRef(input: {
    headshotUrl: string;
    characterName: string;
    styleTag: string;
    stylePresetId: string;
  }) {
    const jobId = `mock-${randomUUID()}`;
    const encoded = encodeURIComponent(input.characterName);
    return {
      jobId,
      imageUrl: `https://placehold.co/512x512?text=Omni+${encoded}`,
      promptText: `cinematic character reference portrait, clear face, consistent outfit, neutral background, soft studio lighting, sharp focus, no text, no watermark, mid-shot ${input.styleTag}`,
    };
  }
}

export class DiscordAutomationProvider implements MidjourneyProvider {
  async generateGrid(): Promise<{ jobId: string; images: string[] }> {
    throw new Error(
      "DiscordAutomationProvider is a stub. Implement Discord bot automation to send /imagine, wait for grid, then fetch U1..U4 images.",
    );
  }

  async animate(): Promise<{
    jobId: string;
    videoUrl: string;
    durationSec: number;
  }> {
    throw new Error(
      "DiscordAutomationProvider is a stub. Implement: select image from grid, send Animate High/Low, then capture video URL.",
    );
  }

  async generateOmniRef(): Promise<{
    jobId: string;
    imageUrl: string;
    promptText: string;
  }> {
    throw new Error(
      "DiscordAutomationProvider is a stub. Implement: send /imagine with omni ref prompt, then capture single image URL.",
    );
  }
}

export class ThirdPartyMidjourneyProvider implements MidjourneyProvider {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.MJ_THIRD_PARTY_API_URL || "";
    this.apiKey = process.env.MJ_THIRD_PARTY_API_KEY || "";
  }

  async generateGrid(input: MidjourneyGridInput) {
    const response = await fetch(`${this.baseUrl}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ prompt: input.prompt }),
    });
    if (!response.ok) {
      throw new Error("Third-party Midjourney provider failed");
    }
    return response.json();
  }

  async animate(input: MidjourneyAnimateInput) {
    const response = await fetch(`${this.baseUrl}/animate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error("Third-party Midjourney provider failed");
    }
    return response.json();
  }

  async generateOmniRef(input: {
    headshotUrl: string;
    characterName: string;
    styleTag: string;
    stylePresetId: string;
  }) {
    const response = await fetch(`${this.baseUrl}/omni-ref`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error("Third-party Midjourney provider failed");
    }
    return response.json();
  }
}

export function getMidjourneyProvider(): MidjourneyProvider {
  const provider = process.env.MJ_PROVIDER ?? "mock";
  if (provider === "discord") {
    return new DiscordAutomationProvider();
  }
  if (provider === "third-party") {
    return new ThirdPartyMidjourneyProvider();
  }
  return new MockMidjourneyProvider();
}
