"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Archive, CircleAlert, CircleCheck, Download, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { cancelExport, downloadClip, downloadJobZip } from "@/lib/export-runner";
import type { ClipResult, ExportJob } from "@/lib/types";
import { isJobActive, useEditor } from "@/store/editor-store";

import { Button } from "./ui/button";

const TITLES: Record<ExportJob["phase"], string> = {
  idle: "",
  "loading-engine": "Loading video engine",
  cutting: "Cutting clips",
  zipping: "Packaging ZIP",
  done: "Export complete",
  error: "Export failed",
  cancelled: "Export cancelled",
};

/** Modal progress view for a running or finished export job. */
export function ExportDialog() {
  const job = useEditor((s) => s.job);
  const resetJob = useEditor((s) => s.resetJob);
  const active = isJobActive(job);
  const open = job.phase !== "idle";
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape cancels a running job or closes a finished one.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (active) cancelExport();
      else resetJob();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open, active, resetJob]);

  // Move focus into the dialog when the job finishes.
  useEffect(() => {
    if (open && !active) closeRef.current?.focus();
  }, [open, active]);

  const doneCount = job.clips.filter((c) => c.status === "done").length;
  const errorCount = job.clips.filter((c) => c.status === "error").length;
  const percent = Math.round(job.progress * 100);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="export-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-canvas/70 p-4 backdrop-blur-sm"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/50"
          >
            <div className="flex items-start justify-between gap-4 p-5 pb-4">
              <div>
                <h2 id="export-title" className="flex items-center gap-2 text-sm font-semibold">
                  <PhaseIcon phase={job.phase} />
                  {TITLES[job.phase]}
                </h2>
                <p className="mt-1 text-xs text-ink-muted" aria-live="polite">
                  {describe(job, doneCount, errorCount)}
                </p>
              </div>
              {!active && (
                <Button ref={closeRef} variant="ghost" size="icon-sm" onClick={resetJob} aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Overall progress */}
            <div className="px-5">
              <div className="flex items-center justify-between text-[11px] text-ink-faint">
                <span>{job.mode === "copy" ? "Lossless stream copy" : "Frame-accurate re-encode"}</span>
                <span className="timecode">{percent}%</span>
              </div>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <motion.div
                  className={`h-full rounded-full ${
                    job.phase === "error" ? "bg-danger" : job.phase === "cancelled" ? "bg-ink-faint" : "bg-accent"
                  }`}
                  initial={false}
                  animate={{ width: `${job.phase === "loading-engine" ? (job.engineProgress ?? 0) * 100 : percent}%` }}
                  transition={{ type: "tween", ease: "easeOut", duration: 0.2 }}
                />
              </div>
            </div>

            {/* Per-clip list */}
            <ul className="scroll-thin mt-4 max-h-64 space-y-1 overflow-y-auto border-t border-line px-3 py-3">
              {job.clips.map((clip) => (
                <ClipItem key={clip.segmentId} clip={clip} canDownload={!active} />
              ))}
            </ul>

            {job.error && <p className="px-5 pb-3 text-xs text-danger">{job.error}</p>}

            <div className="flex justify-end gap-2 border-t border-line bg-canvas/40 px-5 py-3">
              {active ? (
                <Button variant="secondary" size="sm" onClick={cancelExport}>
                  Cancel
                </Button>
              ) : (
                <>
                  {job.zip && doneCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => downloadJobZip()}>
                      <Archive className="h-3.5 w-3.5" />
                      Download ZIP again
                    </Button>
                  )}
                  <Button variant="primary" size="sm" onClick={resetJob}>
                    Done
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ClipItem({ clip, canDownload }: { clip: ClipResult; canDownload: boolean }) {
  return (
    <li className="rounded-lg px-2 py-1.5 hover:bg-raised/60">
      <div className="flex items-center gap-2 text-xs">
        <ClipStatusIcon status={clip.status} />
        <span className="min-w-0 flex-1 truncate text-ink-muted" title={clip.fileName}>
          {clip.fileName}
        </span>
        {clip.blob && <span className="timecode shrink-0 text-ink-faint">{formatSize(clip.blob.size)}</span>}
        {canDownload && clip.blob && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => downloadClip(clip)}
            aria-label={`Download ${clip.fileName}`}
            title="Download clip"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {clip.status === "processing" && (
        <div className="mt-1.5 ml-6 h-0.5 overflow-hidden rounded-full bg-canvas">
          <div className="h-full bg-accent/70 transition-[width] duration-200" style={{ width: `${clip.progress * 100}%` }} />
        </div>
      )}
      {clip.error && <p className="mt-1 ml-6 line-clamp-2 text-[11px] text-danger">{clip.error}</p>}
    </li>
  );
}

function ClipStatusIcon({ status }: { status: ClipResult["status"] }) {
  switch (status) {
    case "done":
      return <CircleCheck className="h-4 w-4 shrink-0 text-emerald-400" />;
    case "error":
      return <CircleAlert className="h-4 w-4 shrink-0 text-danger" />;
    case "processing":
      return <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-accent" />;
    default:
      return <span className="mx-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" />;
  }
}

function PhaseIcon({ phase }: { phase: ExportJob["phase"] }) {
  if (phase === "done") return <CircleCheck className="h-4 w-4 text-emerald-400" />;
  if (phase === "error") return <CircleAlert className="h-4 w-4 text-danger" />;
  if (phase === "cancelled") return <X className="h-4 w-4 text-ink-faint" />;
  return <LoaderCircle className="h-4 w-4 animate-spin text-accent" />;
}

function describe(job: ExportJob, done: number, errors: number): string {
  const total = job.clips.length;
  switch (job.phase) {
    case "loading-engine":
      return job.engineProgress != null && job.engineProgress < 1
        ? `Downloading FFmpeg (~32 MB, first time only)… ${Math.round(job.engineProgress * 100)}%`
        : "Starting FFmpeg…";
    case "cutting":
      return `${done} of ${total} clip${total === 1 ? "" : "s"} ready`;
    case "zipping":
      return "Bundling clips into a ZIP file…";
    case "done":
      return errors > 0
        ? `${done} of ${total} clips exported, ${errors} failed.`
        : `${done} clip${done === 1 ? "" : "s"} exported. Your download should start automatically.`;
    case "cancelled":
      return done > 0 ? `${done} clip${done === 1 ? "" : "s"} finished before cancelling.` : "No clips were exported.";
    case "error":
      return "Something went wrong while cutting.";
    default:
      return "";
  }
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
