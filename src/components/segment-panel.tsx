"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Archive, Clapperboard, Info } from "lucide-react";

import { runExport } from "@/lib/export-runner";
import { formatDuration } from "@/lib/time";
import type { CutMode } from "@/lib/types";
import { isJobActive, useEditor } from "@/store/editor-store";

import { SegmentRow } from "./segment-row";
import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";

const MODES: { value: CutMode; label: string; hint: string }[] = [
  {
    value: "copy",
    label: "Lossless",
    hint: "Stream copy. Fast and no quality loss, but cuts snap to the nearest keyframe (can start up to a few seconds early).",
  },
  {
    value: "precise",
    label: "Frame-accurate",
    hint: "Re-encodes to H.264 MP4. Exact cut points, but much slower in the browser.",
  },
];

/** Sidebar (desktop) / lower drawer (mobile) listing all marked segments. */
export function SegmentPanel() {
  const segments = useEditor((s) => s.segments);
  const cutMode = useEditor((s) => s.cutMode);
  const busy = useEditor((s) => isJobActive(s.job));
  const setCutMode = useEditor((s) => s.setCutMode);

  const total = segments.reduce((acc, s) => acc + (s.endTime - s.startTime), 0);
  const activeMode = MODES.find((m) => m.value === cutMode)!;

  return (
    <aside
      aria-label="Segments"
      className="flex max-h-[45vh] min-h-0 shrink-0 flex-col border-t border-line bg-surface lg:max-h-none lg:w-[400px] lg:border-t-0 lg:border-l"
    >
      <div className="flex items-baseline justify-between px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold">
          Segments
          <span className="timecode ml-2 text-xs font-normal text-ink-faint">{segments.length}</span>
        </h2>
        {segments.length > 0 && (
          <span className="timecode text-xs text-ink-faint">Total {formatDuration(total)}</span>
        )}
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {segments.length === 0 ? (
          <EmptyState />
        ) : (
          <motion.ul layout className="space-y-2">
            <AnimatePresence initial={false}>
              {segments.map((seg, i) => (
                <SegmentRow key={seg.id} segment={seg} index={i} />
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </div>

      {/* Export settings */}
      <div className="space-y-3 border-t border-line p-4">
        <div>
          <div
            role="radiogroup"
            aria-label="Cut mode"
            className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-canvas p-1"
          >
            {MODES.map((mode) => {
              const active = mode.value === cutMode;
              return (
                <button
                  key={mode.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={busy}
                  onClick={() => setCutMode(mode.value)}
                  className={`relative h-7 rounded-md text-xs font-medium transition-colors ${
                    active ? "text-ink" : "text-ink-faint hover:text-ink-muted"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="cut-mode-pill"
                      className="absolute inset-0 rounded-md bg-raised ring-1 ring-line-strong"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                  <span className="relative">{mode.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 flex gap-1.5 text-[11px] leading-relaxed text-ink-faint">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {activeMode.hint}
          </p>
        </div>

        <Button
          variant="primary"
          className="w-full"
          disabled={busy || segments.length === 0}
          onClick={() => runExport({ zip: true })}
        >
          <Archive className="h-4 w-4" />
          Export {segments.length > 0 ? `${segments.length} ` : ""}clip{segments.length === 1 ? "" : "s"} as ZIP
        </Button>
      </div>
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <Clapperboard className="h-6 w-6 text-ink-faint" />
      <p className="text-sm text-ink-muted">No segments yet</p>
      <ol className="space-y-1.5 text-xs text-ink-faint">
        <li>
          Press <Kbd>I</Kbd> to mark the start
        </li>
        <li>
          Press <Kbd>O</Kbd> to mark the end
        </li>
        <li>
          Press <Kbd>↵</Kbd> or <Kbd>A</Kbd> to add it
        </li>
      </ol>
      <p className="text-[11px] text-ink-faint">Playback keeps running while you mark.</p>
    </div>
  );
}
