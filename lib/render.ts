import fs from "fs/promises";
import path from "path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type SceneInput = {
  startMs: number;
  endMs: number;
  imageUrl?: string | null;
  clipUrl?: string | null;
};

type AudioInput = {
  url: string;
  trimStartSec?: number | null;
  trimEndSec?: number | null;
  fadeInSec?: number | null;
  fadeOutSec?: number | null;
};

async function downloadToTemp(url: string, suffix: string) {
  if (url.startsWith("/")) {
    return path.join(process.cwd(), "public", url);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const tmpDir = path.join(process.cwd(), "tmp");
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpPath = path.join(tmpDir, `${Date.now()}-${suffix}`);
  await fs.writeFile(tmpPath, buffer);
  return tmpPath;
}

export async function renderProjectVideo(params: {
  scenes: SceneInput[];
  audio: AudioInput;
  outputPath: string;
}) {
  const inputs: string[] = [];
  const filters: string[] = [];
  let filterIndex = 0;
  const totalDuration = params.scenes.reduce(
    (sum, scene) => sum + Math.max(1, (scene.endMs - scene.startMs) / 1000),
    0,
  );

  for (const [index, scene] of params.scenes.entries()) {
    const durationSec = Math.max(1, (scene.endMs - scene.startMs) / 1000);
    if (scene.clipUrl) {
      const clipPath = await downloadToTemp(scene.clipUrl, `clip-${index}.mp4`);
      inputs.push("-i", clipPath);
      filters.push(
        `[${filterIndex}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=duration=${durationSec}[v${index}]`,
      );
    } else {
      const imagePath = scene.imageUrl
        ? await downloadToTemp(scene.imageUrl, `image-${index}.png`)
        : null;
      if (imagePath) {
        inputs.push("-loop", "1", "-t", `${durationSec}`, "-i", imagePath);
        filters.push(
          `[${filterIndex}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v${index}]`,
        );
      } else {
        inputs.push(
          "-f",
          "lavfi",
          "-t",
          `${durationSec}`,
          "-i",
          "color=c=black:s=1280x720",
        );
        filters.push(`[${filterIndex}:v]setsar=1[v${index}]`);
      }
    }
    filterIndex += 1;
  }

  const concatInputs = params.scenes
    .map((_, index) => `[v${index}]`)
    .join("");
  filters.push(`${concatInputs}concat=n=${params.scenes.length}:v=1:a=0[outv]`);

  const tempVideo = params.outputPath.replace(/\.mp4$/, ".video.mp4");
  await execFileAsync("ffmpeg", [
    "-y",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[outv]",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    tempVideo,
  ]);

  const audioPath = await downloadToTemp(params.audio.url, "audio.mp3");
  const trimStart = params.audio.trimStartSec ?? 0;
  const trimEnd = params.audio.trimEndSec;
  const fadeIn = params.audio.fadeInSec ?? 0;
  const fadeOut = params.audio.fadeOutSec ?? 0;
  const audioFilters: string[] = [];
  if (fadeIn > 0) {
    audioFilters.push(`afade=t=in:st=0:d=${fadeIn}`);
  }
  if (fadeOut > 0) {
    audioFilters.push(
      `afade=t=out:st=${Math.max(0, totalDuration - fadeOut)}:d=${fadeOut}`,
    );
  }
  const audioArgs = [
    "-y",
    "-i",
    tempVideo,
    "-ss",
    `${trimStart}`,
    ...(trimEnd ? ["-to", `${trimEnd}`] : []),
    "-i",
    audioPath,
    ...(audioFilters.length ? ["-af", audioFilters.join(",")] : []),
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-shortest",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    params.outputPath,
  ];

  await execFileAsync("ffmpeg", audioArgs);
  await fs.unlink(tempVideo).catch(() => undefined);
}
