const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

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

const getIdFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? parts[0] : null;
  } catch {
    return null;
  }
};

async function main() {
  loadEnvFile();
  const sourceDir = process.argv[2];
  if (!sourceDir) {
    throw new Error("Usage: node scripts/import-animation-style-images.js <folder>");
  }
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Folder not found: ${sourceDir}`);
  }

  const files = fs.readdirSync(sourceDir);
  const styles = await prisma.animationStyle.findMany({
    where: { referenceImageUrl: { contains: "cdn.midjourney.com" } },
  });

  const targetDir = path.join(process.cwd(), "public", "uploads", "animation-styles");
  fs.mkdirSync(targetDir, { recursive: true });

  for (const style of styles) {
    const sourceUrl = style.referenceImageUrl;
    const id = sourceUrl ? getIdFromUrl(sourceUrl) : null;
    if (!id) {
      console.warn(`${style.brandedName}: missing source id`);
      continue;
    }

    const match = files.find((file) => file.includes(id));
    if (!match) {
      console.warn(`${style.brandedName}: no local file for ${id}`);
      continue;
    }

    const ext = path.extname(match) || ".png";
    const targetFilename = `${style.id}${ext}`;
    const targetPath = path.join(targetDir, targetFilename);
    fs.copyFileSync(path.join(sourceDir, match), targetPath);

    await prisma.animationStyle.update({
      where: { id: style.id },
      data: { referenceImageUrl: `/uploads/animation-styles/${targetFilename}` },
    });

    console.log(`${style.brandedName}: imported ${match}`);
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
