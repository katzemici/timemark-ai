/**
 * Export orchestration: runs the FFmpeg cutter for a set of segments, mirrors
 * progress into the store, and triggers downloads (single file or ZIP).
 */
import JSZip from "jszip";

import { clipFileName, cutSegments, loadEngine } from "@/lib/ffmpeg/cutter";
import type { ClipResult, ExportJob } from "@/lib/types";
import { isJobActive, useEditor } from "@/store/editor-store";

/** Share of the overall progress bar reserved for building the ZIP. */
const ZIP_WEIGHT = 0.05;

let controller: AbortController | null = null;

export interface ExportOptions {
  /** Segment ids to export, in timeline order. Defaults to all segments. */
  segmentIds?: string[];
  /** Bundle the clips into one ZIP download instead of separate files. */
  zip: boolean;
}

export async function runExport({ segmentIds, zip }: ExportOptions): Promise<void> {
  const store = useEditor.getState();
  const { source, segments: allSegments, cutMode } = store;
  if (!source || isJobActive(store.job)) return;

  const segments = segmentIds
    ? allSegments.filter((s) => segmentIds.includes(s.id))
    : allSegments;
  if (segments.length === 0) {
    store.notify("Add at least one segment to export.");
    return;
  }

  // Number clips by their timeline position so names stay stable for
  // single-clip exports too.
  const clips: ClipResult[] = segments.map((seg) => ({
    segmentId: seg.id,
    fileName: clipFileName(source.file, seg, allSegments.indexOf(seg), cutMode),
    status: "pending",
    progress: 0,
  }));

  const update = (fn: (job: ExportJob) => Partial<ExportJob>) =>
    useEditor.getState().setJob((job) => ({ ...job, ...fn(job) }));
  const updateClip = (index: number, patch: Partial<ClipResult>) =>
    update((job) => {
      const next = job.clips.map((c, i) => (i === index ? { ...c, ...patch } : c));
      return { clips: next, progress: overallProgress(next, zip) };
    });

  useEditor.getState().setJob(() => ({ phase: "loading-engine", mode: cutMode, zip, clips, progress: 0 }));

  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;

  try {
    const ffmpeg = await loadEngine(({ ratio }) => update(() => ({ engineProgress: ratio })));
    if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");

    update(() => ({ phase: "cutting" }));
    await cutSegments(
      ffmpeg,
      source.file,
      segments,
      cutMode,
      {
        onClipProgress: (i, progress) => updateClip(i, { status: "processing", progress }),
        onClipDone: (i, blob) => updateClip(i, { status: "done", progress: 1, blob }),
        onClipError: (i, error) => updateClip(i, { status: "error", progress: 1, error }),
      },
      signal,
    );

    const done = useEditor.getState().job.clips.filter((c) => c.status === "done" && c.blob);
    if (done.length === 0) {
      update(() => ({ phase: "error", error: "No clips could be cut. See the errors below." }));
      return;
    }

    if (zip) {
      update(() => ({ phase: "zipping" }));
      const blob = await buildZip(done, (ratio) =>
        update((job) => ({ progress: 1 - ZIP_WEIGHT + ZIP_WEIGHT * ratio, phase: job.phase })),
      );
      downloadBlob(blob, zipName(source.file.name));
    } else {
      // Separate downloads; small stagger so browsers don't drop any.
      for (const clip of done) {
        downloadBlob(clip.blob!, clip.fileName);
        await sleep(150);
      }
    }

    update(() => ({ phase: "done", progress: 1 }));
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      update(() => ({ phase: "cancelled" }));
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    update(() => ({ phase: "error", error: `Export failed: ${message}` }));
  } finally {
    if (controller?.signal === signal) controller = null;
  }
}

/** Cancels the running export, terminating the FFmpeg worker. */
export function cancelExport(): void {
  controller?.abort();
}

/** Re-downloads an already rendered clip from the current job. */
export function downloadClip(clip: ClipResult): void {
  if (clip.blob) downloadBlob(clip.blob, clip.fileName);
}

/** Bundles finished clips into a ZIP from the current job and downloads it. */
export async function downloadJobZip(): Promise<void> {
  const { job, source } = useEditor.getState();
  const done = job.clips.filter((c) => c.status === "done" && c.blob);
  if (!source || done.length === 0) return;
  downloadBlob(await buildZip(done), zipName(source.file.name));
}

// ----------------------------------------------------------------- helpers --

function overallProgress(clips: ClipResult[], zip: boolean): number {
  if (clips.length === 0) return 0;
  const cutShare = zip ? 1 - ZIP_WEIGHT : 1;
  const sum = clips.reduce((acc, c) => acc + c.progress, 0);
  return (sum / clips.length) * cutShare;
}

async function buildZip(clips: ClipResult[], onProgress?: (ratio: number) => void): Promise<Blob> {
  const zip = new JSZip();
  for (const clip of clips) zip.file(clip.fileName, clip.blob!);
  // Video is already compressed; STORE avoids burning CPU for ~0% gain.
  return zip.generateAsync({ type: "blob", compression: "STORE" }, (meta) =>
    onProgress?.(meta.percent / 100),
  );
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function zipName(sourceName: string): string {
  const base = sourceName.replace(/\.[^.]+$/, "").replace(/[^\w\-]+/g, "_") || "clips";
  return `${base}_clips.zip`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
