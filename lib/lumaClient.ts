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

export const getOmniVariantCount = () => {
  const raw = Number(process.env.LUMA_OMNI_VARIANTS ?? 4);
  if (!Number.isFinite(raw)) return 4;
  return Math.min(4, Math.max(2, Math.round(raw)));
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
  const response = await fetch(`${LUMA_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${process.env.LUMA_API_KEY}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Luma API error (${response.status}): ${text || "Unknown"}`);
  }
  return response.json() as Promise<T>;
};

export const mapLumaStateToJobStatus = (state?: string) => {
  if (!state) return "queued";
  const normalized = state.toLowerCase();
  if (normalized === "completed") return "ready";
  if (normalized === "failed") return "error";
  if (normalized === "dreaming" || normalized === "running") return "running";
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
