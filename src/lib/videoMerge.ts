import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;

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

/**
 * Merges multiple video files into one using ffmpeg.wasm.
 * Returns an object URL for the merged video.
 */
export async function mergeVideos(
  inputs: MergeInput[],
  onProgress?: (percent: number) => void
): Promise<string> {
  if (inputs.length === 0) throw new Error("No videos to merge");
  if (inputs.length === 1) {
    onProgress?.(100);
    return inputs[0].url;
  }

  return smartMergeVideos(
    inputs.map(i => ({ ...i, trimStartSec: 0, trimEndSec: null, playbackSpeed: 1.0 })),
    onProgress
  );
}

/**
 * Smart merge: trims clips according to AI plan, then concatenates.
 */
export async function smartMergeVideos(
  inputs: SmartMergeInput[],
  onProgress?: (percent: number) => void
): Promise<string> {
  if (inputs.length === 0) throw new Error("No videos to merge");

  if (inputs.length === 1 && !inputs[0].trimStartSec && !inputs[0].trimEndSec) {
    onProgress?.(100);
    return inputs[0].url;
  }

  onProgress?.(5);

  const ffmpeg = await getFFmpeg((ratio) => {
    onProgress?.(20 + ratio * 60);
  });

  onProgress?.(10);

  // Download all videos in parallel
  const downloadPromises = inputs.map(async (input, i) => {
    const resp = await fetch(input.url);
    if (!resp.ok) throw new Error(`Failed to download video ${i + 1}: ${resp.statusText}`);
    const arrayBuf = await resp.arrayBuffer();
    onProgress?.(10 + (10 * (i + 1)) / inputs.length);
    return new Uint8Array(arrayBuf);
  });

  const buffers = await Promise.all(downloadPromises);

  // Process each clip: trim and adjust speed
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

    // Fast path: place -ss BEFORE -i for input-seek (much faster than output-seek).
    const args: string[] = [];
    if (input.trimStartSec && input.trimStartSec > 0) {
      args.push("-ss", String(input.trimStartSec));
    }
    if (input.trimEndSec && input.trimEndSec > 0) {
      // -to with input-seek is relative to start, so subtract trimStart
      const dur = input.trimEndSec - (input.trimStartSec || 0);
      if (dur > 0) args.push("-t", String(dur));
    }
    args.push("-i", inputFile);

    if (hasSpeedChange) {
      const pts = (1 / speed).toFixed(4);
      args.push("-filter:v", `setpts=${pts}*PTS`);
      // atempo only if audio stream may exist; ignore failure gracefully
      args.push("-filter:a", `atempo=${speed}`);
      // Ultrafast encode — drastically faster than default x264 settings
      args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "26");
      args.push("-c:a", "aac", "-b:a", "128k");
      args.push("-movflags", "+faststart", outputFile);
    } else if (hasTrim) {
      // Trim only — stream copy is near-instant
      args.push("-c", "copy", "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", outputFile);
    } else {
      args.push("-c", "copy", "-movflags", "+faststart", outputFile);
    }

    await ffmpeg.exec(args);
    processedFiles.push(outputFile);

    onProgress?.(20 + (30 * (i + 1)) / inputs.length);
  }

  // If only one clip after processing
  if (processedFiles.length === 1) {
    const outputData = await ffmpeg.readFile(processedFiles[0]);
    const uint8 = outputData instanceof Uint8Array ? outputData : new TextEncoder().encode(outputData as string);
    const blob = new Blob([new Uint8Array(uint8)], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    // Cleanup
    for (const f of [...processedFiles, "input0.mp4"]) {
      await ffmpeg.deleteFile(f).catch(() => {});
    }
    onProgress?.(100);
    return url;
  }

  // Create concat list
  const concatList = processedFiles.map(f => `file '${f}'`).join("\n");
  await ffmpeg.writeFile("list.txt", concatList);

  // Concat
  await ffmpeg.exec([
    "-f", "concat", "-safe", "0", "-i", "list.txt",
    "-c", "copy", "-movflags", "+faststart", "output.mp4",
  ]);

  onProgress?.(92);

  const outputData = await ffmpeg.readFile("output.mp4");
  const uint8 = outputData instanceof Uint8Array ? outputData : new TextEncoder().encode(outputData as string);
  const blob = new Blob([new Uint8Array(uint8)], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);

  // Cleanup
  for (let i = 0; i < inputs.length; i++) {
    await ffmpeg.deleteFile(`input${i}.mp4`).catch(() => {});
    await ffmpeg.deleteFile(`trimmed${i}.mp4`).catch(() => {});
  }
  await ffmpeg.deleteFile("list.txt").catch(() => {});
  await ffmpeg.deleteFile("output.mp4").catch(() => {});

  onProgress?.(100);
  return url;
}
