type LumaGeneration = {
  id: string;
  state?: string;
  assets?: {
    image?: string;
    video?: string;
  };
  failure_reason?: string;
};

type LumaImagePayload = {
  prompt: string;
  model?: string;
  aspect_ratio?: string;
  style_ref?: { url: string; weight?: number }[];
  character_ref?: Record<string, { images: string[] }>;
  image_ref?: { url: string; weight?: number }[];
};

type LumaVideoPayload = {
  prompt?: string;
  model: string;
  resolution: string;
  duration: string;
  aspect_ratio?: string;
  keyframes: {
    frame0: {
      type: "image";
      url: string;
    };
  };
};

const LUMA_BASE_URL = "https://api.lumalabs.ai/dream-machine/v1";

const createLimiter = (limit: number) => {
  let active = 0;
  const queue: Array<() => void> = [];
  return async <T>(fn: () => Promise<T>) => {
    if (active >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      const next = queue.shift();
      if (next) next();
    }
  };
};

const lumaLimit = createLimiter(
  Number(process.env.LUMA_CONCURRENCY_LIMIT ?? 3),
);

export const getOmniVariantCount = () => 1;

export const getStyleVariantCount = () => {
  const raw = Number(process.env.LUMA_STYLE_VARIANTS ?? 3);
  if (!Number.isFinite(raw)) return 3;
  return Math.min(4, Math.max(1, Math.round(raw)));
};

const assertLumaApiKey = () => {
  if (!process.env.LUMA_API_KEY) {
    throw new Error("LUMA_API_KEY is required to call Luma Dream Machine.");
  }
};

const lumaFetch = async <T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> => {
  assertLumaApiKey();
  const method = options.method ?? "GET";
  const timeoutMs = method === "POST" ? 90000 : 20000;
  const maxRetries = method === "POST" ? 2 : 0;
  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${LUMA_BASE_URL}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${process.env.LUMA_API_KEY}`,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Luma API error (${response.status}): ${text || "Unknown"}`,
        );
      }
      return response.json() as Promise<T>;
    } catch (error) {
      const isAbort =
        error instanceof Error &&
        (error.name === "AbortError" || error.message.includes("aborted"));
      if (isAbort && attempt < maxRetries) {
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
};

export const mapLumaStateToJobStatus = (state?: string) => {
  if (!state) return "queued";
  const normalized = state.toLowerCase();
  if (
    normalized === "completed" ||
    normalized === "succeeded" ||
    normalized === "success" ||
    normalized === "finished"
  ) {
    return "ready";
  }
  if (normalized === "failed" || normalized === "error") return "error";
  if (
    normalized === "dreaming" ||
    normalized === "running" ||
    normalized === "processing" ||
    normalized === "in_progress" ||
    normalized === "starting"
  ) {
    return "running";
  }
  if (normalized === "queued" || normalized === "pending" || normalized === "submitted") {
    return "queued";
  }
  return "queued";
};

export const createImageGeneration = async (payload: LumaImagePayload) =>
  lumaLimit(() => lumaFetch<LumaGeneration>("/generations/image", {
    method: "POST",
    body: payload,
  }));

export const createVideoGeneration = async (payload: LumaVideoPayload) =>
  lumaLimit(() => lumaFetch<LumaGeneration>("/generations", {
    method: "POST",
    body: payload,
  }));

export const getGeneration = async (id: string) =>
  lumaFetch<LumaGeneration>(`/generations/${id}`);
