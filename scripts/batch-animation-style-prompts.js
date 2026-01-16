const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const loadEnvFile = () => {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const [key, ...rest] = trimmed.split("=");
    if (!key || process.env[key] !== undefined) return;
    const value = rest.join("=").replace(/^"|"$/g, "");
    process.env[key] = value;
  });
};

const mimeForPath = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
};

const getImageDataUrl = async (url) => {
  if (url.startsWith("/")) {
    const localPath = path.join(process.cwd(), "public", url);
    const buffer = fs.readFileSync(localPath);
    const contentType = mimeForPath(localPath);
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  }
  if (url.includes("ngrok-free.dev") || url.includes("ngrok-free.app")) {
    try {
      const parsed = new URL(url);
      const localPath = path.join(process.cwd(), "public", parsed.pathname);
      const buffer = fs.readFileSync(localPath);
      const contentType = mimeForPath(localPath);
      return `data:${contentType};base64,${buffer.toString("base64")}`;
    } catch {
      // fall back to fetch
    }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } finally {
    clearTimeout(timeout);
  }
};

const buildMessages = ({ imageUrl, description }) => [
  {
    role: "system",
    content:
      "You describe animation style reference images for prompt injection. Return JSON only with fields: stylePromptSentence.",
  },
  {
    role: "user",
    content: [
      {
        type: "text",
        text:
          "Analyze the style reference image and produce a concise 1-2 sentence style prompt that captures palette, lighting, texture, brushwork, shapes, and camera feel. Avoid brand names and avoid mentioning the image.",
      },
      ...(description
        ? [
            {
              type: "text",
              text: `Additional notes: ${description}`,
            },
          ]
        : []),
      {
        type: "image_url",
        image_url: { url: imageUrl },
      },
    ],
  },
];

async function main() {
  loadEnvFile();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const openai = new OpenAI({ apiKey });
  const styles = await prisma.animationStyle.findMany({
    where: { referenceImageUrl: { not: null } },
    orderBy: { brandedName: "asc" },
  });

  for (const style of styles) {
    if (!style.referenceImageUrl) continue;
    if (style.stylePrompt && style.stylePrompt.trim().length > 0) {
      console.log(`${style.brandedName}: prompt already set, skipping.`);
      continue;
    }

    console.log(`Generating prompt for ${style.brandedName}...`);
    try {
      const dataUrl = await getImageDataUrl(style.referenceImageUrl);
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: buildMessages({
          imageUrl: dataUrl,
          description: style.description ?? "",
        }),
      });

      const raw = response.choices[0]?.message?.content?.trim() ?? "";
      let stylePrompt = "";
      try {
        const parsed = JSON.parse(raw);
        stylePrompt = (parsed.stylePromptSentence || "").trim();
      } catch {
        stylePrompt = raw;
      }

      if (!stylePrompt) {
        console.warn(`${style.brandedName}: empty prompt returned.`);
        continue;
      }

      await prisma.animationStyle.update({
        where: { id: style.id },
        data: { stylePrompt },
      });
      console.log(`${style.brandedName}: saved prompt.`);
    } catch (error) {
      console.error(`${style.brandedName}: failed`, error);
    }

    await sleep(500);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
