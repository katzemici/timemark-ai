/**
 * Browser-side video cutting with FFmpeg.wasm.
 *
 * Design notes:
 * - One FFmpeg instance (a dedicated Web Worker) is lazily created and reused
 *   across exports. The ~32 MB wasm core is fetched once per page session and
 *   is HTTP-cached afterwards.
 * - The source file is mounted with WORKERFS instead of being copied into
 *   the in-memory FS. FFmpeg reads directly from the `File` handle, so a
 *   multi-GB source does not need to fit in wasm memory.
 * - Each clip is written to MEMFS, read back as a Blob, then deleted
 *   immediately to keep peak memory at roughly one clip.
 * - The `@ffmpeg/ffmpeg` runtime is loaded from `/ffmpeg/classes.js` (copied
 *   there by scripts/copy-ffmpeg-core.mjs) instead of being bundled: its
 *   worker is created with `new URL(variable, import.meta.url)`, which
 *   Turbopack can't resolve statically. Only its types are imported here.
 */
import type { FFFSType, FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

import { fileTimestamp } from "@/lib/time";
import type { CutMode, Segment } from "@/lib/types";

const INPUT_DIR = "/input";
const ASSET_BASE = "/ffmpeg";
/** Runtime value of `FFFSType.WORKERFS` (the enum only exists as a type here). */
const WORKERFS = "WORKERFS" as FFFSType;

/** Containers that accept stream-copied output for their usual codecs. */
const COPY_CONTAINERS = new Set(["mp4", "m4v", "mov", "webm", "mkv"]);

let engine: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;

export interface EngineLoadProgress {
  /** 0..1, or `null` when the server did not send Content-Length. */
  ratio: number | null;
}

/**
 * Returns a loaded FFmpeg instance, downloading the core on first call.
 * Concurrent callers share one in-flight load.
 */
export function loadEngine(onProgress?: (p: EngineLoadProgress) => void): Promise<FFmpeg> {
  if (engine?.loaded) return Promise.resolve(engine);
  if (loading) return loading;

  const pending = (async () => {
    const base = `${window.location.origin}${ASSET_BASE}`;
    const { FFmpeg: FFmpegClass } = (await import(
      /* webpackIgnore: true */ `${base}/classes.js`
    )) as typeof import("@ffmpeg/ffmpeg");
    const ffmpeg = new FFmpegClass();
    let wasmURL: string | null = null;

    try {
      // Fetch the wasm through a blob URL so we can report download progress.
      wasmURL = await toBlobURL(
        `${base}/ffmpeg-core.wasm`,
        "application/wasm",
        true,
        ({ total, received }) => onProgress?.({ ratio: total > 0 ? received / total : null }),
      );

      // The class worker defaults to ./worker.js next to classes.js.
      await ffmpeg.load({ coreURL: `${base}/ffmpeg-core.js`, wasmURL });
    } catch (err) {
      ffmpeg.terminate();
      throw err;
    } finally {
      // The worker holds its own compiled copy of the wasm by now.
      if (wasmURL) URL.revokeObjectURL(wasmURL);
    }

    engine = ffmpeg;
    return ffmpeg;
  })();

  loading = pending;
  // Clear the shared promise once settled so a failed load can be retried.
  pending.then(
    () => undefined,
    () => undefined,
  ).finally(() => {
    if (loading === pending) loading = null;
  });
  return pending;
}

/** Kills the worker. Any running `exec` rejects; the next call reloads. */
export function terminateEngine(): void {
  engine?.terminate();
  engine = null;
  loading = null;
}

/** File extension (lowercase, no dot) of the clip for a given mode. */
export function outputExtension(source: File, mode: CutMode): string {
  if (mode === "precise") return "mp4";
  const ext = source.name.split(".").pop()?.toLowerCase() ?? "";
  // Matroska accepts nearly any codec, so it is the safe fallback for copy.
  return COPY_CONTAINERS.has(ext) ? ext : "mkv";
}

/** Builds a descriptive, filesystem-safe filename for a clip. */
export function clipFileName(source: File, segment: Segment, index: number, mode: CutMode): string {
  const base = sanitize(source.name.replace(/\.[^.]+$/, "")) || "clip";
  const label = sanitize(segment.label);
  const num = String(index + 1).padStart(2, "0");
  const range = `${fileTimestamp(segment.startTime)}-${fileTimestamp(segment.endTime)}`;
  return [base, num, label, range].filter(Boolean).join("_") + "." + outputExtension(source, mode);
}

/** FFmpeg argument list for one clip. Exported for unit testing. */
export function buildCutArgs(
  inputPath: string,
  outputPath: string,
  segment: Pick<Segment, "startTime" | "endTime">,
  mode: CutMode,
  ext: string,
): string[] {
  const start = segment.startTime.toFixed(3);
  const duration = (segment.endTime - segment.startTime).toFixed(3);
  const isMp4Family = ext === "mp4" || ext === "m4v" || ext === "mov";

  // `-ss` before `-i` seeks the demuxer: fast in both modes. With re-encode
  // FFmpeg still decodes from the prior keyframe, so the cut is frame-exact.
  const head = ["-hide_banner", "-ss", start, "-i", inputPath, "-t", duration];

  if (mode === "copy") {
    return [
      ...head,
      // Video and audio only; data/timecode tracks often fail to remux.
      "-map", "0:v?", "-map", "0:a?",
      "-c", "copy",
      "-map_metadata", "0",
      // Shift timestamps so the clip starts at 0 even if it begins mid-GOP.
      "-avoid_negative_ts", "make_zero",
      ...(isMp4Family ? ["-movflags", "+faststart"] : []),
      "-y", outputPath,
    ];
  }

  return [
    ...head,
    "-map", "0:v:0?", "-map", "0:a:0?",
    "-c:v", "libx264", "-preset", "superfast", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    "-y", outputPath,
  ];
}

export interface CutCallbacks {
  /** Called when a clip starts (`progress` 0) and as it advances (0..1). */
  onClipProgress: (index: number, progress: number) => void;
  onClipDone: (index: number, blob: Blob) => void;
  onClipError: (index: number, message: string) => void;
}

/**
 * Cuts `segments` out of `source` sequentially.
 * Rejects with an `AbortError` if `signal` aborts. A failing clip is
 * reported through `onClipError` and does not stop the remaining clips.
 */
export async function cutSegments(
  ffmpeg: FFmpeg,
  source: File,
  segments: Segment[],
  mode: CutMode,
  callbacks: CutCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const ext = outputExtension(source, mode);
  const mime = mimeFor(ext);
  const inputPath = `${INPUT_DIR}/${source.name}`;

  // Keep a short rolling log tail so failures can show FFmpeg's reason.
  const logTail: string[] = [];
  let activeIndex = -1;
  let activeDuration = 1;

  const onLog = ({ message }: { message: string }) => {
    logTail.push(message);
    if (logTail.length > 12) logTail.shift();

    // FFmpeg prints `time=HH:MM:SS.xx` in its periodic stats line.
    const match = /time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message);
    if (match && activeIndex >= 0) {
      const t = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      callbacks.onClipProgress(activeIndex, Math.min(0.99, t / activeDuration));
    }
  };

  const abort = () => terminateEngine();
  signal.addEventListener("abort", abort, { once: true });
  ffmpeg.on("log", onLog);

  await ensureDir(ffmpeg, INPUT_DIR);
  await ffmpeg.mount(WORKERFS, { files: [source] }, INPUT_DIR);

  try {
    for (let i = 0; i < segments.length; i++) {
      throwIfAborted(signal);
      const segment = segments[i];
      const outputPath = `/clip_${i}.${ext}`;

      activeIndex = i;
      activeDuration = Math.max(0.001, segment.endTime - segment.startTime);
      logTail.length = 0;
      callbacks.onClipProgress(i, 0);

      try {
        const code = await ffmpeg.exec(buildCutArgs(inputPath, outputPath, segment, mode, ext));
        throwIfAborted(signal);
        if (code !== 0) throw new Error(lastError(logTail) ?? `FFmpeg exited with code ${code}`);

        const data = await ffmpeg.readFile(outputPath);
        if (typeof data === "string" || data.byteLength === 0) {
          throw new Error("FFmpeg produced an empty file.");
        }
        // readFile returns a view on a transferred ArrayBuffer.
        callbacks.onClipDone(i, new Blob([data as Uint8Array<ArrayBuffer>], { type: mime }));
      } catch (err) {
        if (signal.aborted) throw abortError();
        callbacks.onClipError(i, err instanceof Error ? err.message : String(err));
      } finally {
        if (!signal.aborted) await ffmpeg.deleteFile(outputPath).catch(() => undefined);
      }
    }
  } finally {
    signal.removeEventListener("abort", abort);
    // After an abort the worker is gone; there is nothing left to clean up.
    if (!signal.aborted) {
      ffmpeg.off("log", onLog);
      await ffmpeg.unmount(INPUT_DIR).catch(() => undefined);
    }
  }
}

// ----------------------------------------------------------------- helpers --

async function ensureDir(ffmpeg: FFmpeg, dir: string) {
  // createDir throws if the directory exists (e.g. after a previous export).
  await ffmpeg.createDir(dir).catch(() => undefined);
}

function sanitize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48);
}

function mimeFor(ext: string): string {
  switch (ext) {
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "mkv":
      return "video/x-matroska";
    default:
      return "video/mp4";
  }
}

/** Picks the most informative recent FFmpeg log line. */
function lastError(lines: string[]): string | null {
  const relevant = lines.filter((l) => /error|invalid|could not|not supported|failed/i.test(l));
  return relevant.at(-1) ?? lines.at(-1) ?? null;
}

function abortError(): DOMException {
  return new DOMException("Export cancelled", "AbortError");
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortError();
}
