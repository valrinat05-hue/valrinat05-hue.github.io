import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import type { ColorAdjustments } from "@/components/editor/ManualEditingPanel";

let ffmpegInstance: FFmpeg | null = null;

/** Translate 0-100 sliders → ffmpeg video filter string (or null if neutral) */
export function colorAdjustmentsToFFmpegFilter(adj: ColorAdjustments): string | null {
  const brightness = (adj.brightness - 50) / 50;       // -1 to 1
  const contrast   = adj.contrast / 50;                 // 0 to 2  (1 = neutral)
  const saturation = Math.min((adj.saturation / 50) * 1.5, 3); // 0 to 3
  const gamma = adj.exposure <= 50
    ? 1 + (50 - adj.exposure) / 150
    : 1 - (adj.exposure - 50) / 200;

  const neutral =
    Math.abs(brightness) < 0.02 &&
    Math.abs(contrast - 1) < 0.02 &&
    Math.abs(saturation - 1) < 0.02 &&
    Math.abs(gamma - 1) < 0.02 &&
    Math.abs(adj.temperature - 50) < 3;

  if (neutral) return null;

  const filters: string[] = [
    `eq=brightness=${brightness.toFixed(3)}:contrast=${contrast.toFixed(3)}:saturation=${saturation.toFixed(3)}:gamma=${gamma.toFixed(3)}`,
  ];

  const tempOffset = (adj.temperature - 50) / 50; // -1 to 1
  if (Math.abs(tempOffset) > 0.05) {
    const r = (tempOffset * 0.15).toFixed(3);
    const b = (-tempOffset * 0.15).toFixed(3);
    filters.push(`colorbalance=rs=${r}:gs=0:bs=${b}:rm=${r}:gm=0:bm=${b}:rh=${r}:gh=0:bh=${b}`);
  }

  return filters.join(",");
}

async function getFFmpeg(onProgress?: (ratio: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance;

  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    onProgress?.(Math.min(progress, 1));
  });

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

export interface MergeInput {
  url: string;
  index: number;
}

export interface SmartMergeInput {
  url: string;
  index: number;
  trimStartSec?: number;
  trimEndSec?: number | null;
  playbackSpeed?: number;
}

export async function mergeVideos(
  inputs: MergeInput[],
  onProgress?: (percent: number) => void,
  colorAdjustments?: ColorAdjustments
): Promise<string> {
  if (inputs.length === 0) throw new Error("No videos to merge");
  if (inputs.length === 1 && !colorAdjustments) {
    onProgress?.(100);
    return inputs[0].url;
  }

  return smartMergeVideos(
    inputs.map(i => ({ ...i, trimStartSec: 0, trimEndSec: null, playbackSpeed: 1.0 })),
    onProgress,
    colorAdjustments
  );
}

/**
 * Smart merge: trims clips per AI plan, concatenates, then bakes color grading into output.
 */
export async function smartMergeVideos(
  inputs: SmartMergeInput[],
  onProgress?: (percent: number) => void,
  colorAdjustments?: ColorAdjustments
): Promise<string> {
  const colorFilter = colorAdjustments ? colorAdjustmentsToFFmpegFilter(colorAdjustments) : null;

  if (inputs.length === 0) throw new Error("No videos to merge");

  // Fast path: single clip, no trimming, no color grading needed
  if (inputs.length === 1 && !inputs[0].trimStartSec && !inputs[0].trimEndSec && !colorFilter) {
    onProgress?.(100);
    return inputs[0].url;
  }

  onProgress?.(5);

  // Map ffmpeg encode progress to the 50–75% window
  const ffmpeg = await getFFmpeg((ratio) => {
    onProgress?.(50 + ratio * 25);
  });

  onProgress?.(10);

  // Download all source videos in parallel
  const downloadPromises = inputs.map(async (input, i) => {
    const resp = await fetch(input.url);
    if (!resp.ok) throw new Error(`Failed to download video ${i + 1}: ${resp.statusText}`);
    const arrayBuf = await resp.arrayBuffer();
    onProgress?.(10 + (15 * (i + 1)) / inputs.length);
    return new Uint8Array(arrayBuf);
  });

  const buffers = await Promise.all(downloadPromises);

  // Process each clip: seek + trim + optional speed change
  const processedFiles: string[] = [];

  for (let i = 0; i < buffers.length; i++) {
    const inputFile = `input${i}.mp4`;
    const outputFile = `trimmed${i}.mp4`;
    await ffmpeg.writeFile(inputFile, buffers[i]);

    const input = inputs[i];
    const speed = input.playbackSpeed || 1.0;
    const hasSpeedChange = speed !== 1.0 && speed > 0.25 && speed <= 4.0;
    const hasTrim = (input.trimStartSec && input.trimStartSec > 0) ||
                    (input.trimEndSec && input.trimEndSec > 0);

    // Place -ss BEFORE -i for fast input-seek
    const args: string[] = [];
    if (input.trimStartSec && input.trimStartSec > 0) {
      args.push("-ss", String(input.trimStartSec));
    }
    if (input.trimEndSec && input.trimEndSec > 0) {
      const dur = input.trimEndSec - (input.trimStartSec || 0);
      if (dur > 0) args.push("-t", String(dur));
    }
    args.push("-i", inputFile);

    if (hasSpeedChange) {
      const pts = (1 / speed).toFixed(4);
      args.push("-filter:v", `setpts=${pts}*PTS`);
      args.push("-filter:a", `atempo=${speed}`);
      args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "26");
      args.push("-c:a", "aac", "-b:a", "128k");
      args.push("-movflags", "+faststart", outputFile);
    } else if (hasTrim) {
      args.push("-c", "copy", "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", outputFile);
    } else {
      args.push("-c", "copy", "-movflags", "+faststart", outputFile);
    }

    await ffmpeg.exec(args);
    processedFiles.push(outputFile);
    onProgress?.(25 + (25 * (i + 1)) / inputs.length);
  }

  // Assemble: concat multiple clips or use single processed file directly
  let assembledFile: string;
  if (processedFiles.length === 1) {
    assembledFile = processedFiles[0];
    onProgress?.(75);
  } else {
    const concatList = processedFiles.map(f => `file '${f}'`).join("\n");
    await ffmpeg.writeFile("list.txt", concatList);
    await ffmpeg.exec([
      "-f", "concat", "-safe", "0", "-i", "list.txt",
      "-c", "copy", "-movflags", "+faststart", "assembled.mp4",
    ]);
    await ffmpeg.deleteFile("list.txt").catch(() => {});
    assembledFile = "assembled.mp4";
    onProgress?.(80);
  }

  // Bake color grading into the final output if adjustments are non-neutral
  let finalFile: string;
  if (colorFilter) {
    await ffmpeg.exec([
      "-i", assembledFile,
      "-vf", colorFilter,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
      "-c:a", "copy",
      "-movflags", "+faststart",
      "graded.mp4",
    ]);
    finalFile = "graded.mp4";
    onProgress?.(90);
  } else {
    finalFile = assembledFile;
    onProgress?.(88);
  }

  const outputData = await ffmpeg.readFile(finalFile);
  const uint8 = outputData instanceof Uint8Array ? outputData : new TextEncoder().encode(outputData as string);
  const blob = new Blob([new Uint8Array(uint8)], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);

  // Cleanup all temp files (ignore errors for files that may not exist)
  for (let i = 0; i < inputs.length; i++) {
    await ffmpeg.deleteFile(`input${i}.mp4`).catch(() => {});
    await ffmpeg.deleteFile(`trimmed${i}.mp4`).catch(() => {});
  }
  await ffmpeg.deleteFile("assembled.mp4").catch(() => {});
  await ffmpeg.deleteFile("graded.mp4").catch(() => {});

  onProgress?.(100);
  return url;
}
