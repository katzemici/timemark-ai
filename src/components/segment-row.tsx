"use client";

import { motion } from "framer-motion";
import { Crosshair, Download, Play, Trash2 } from "lucide-react";

import { runExport } from "@/lib/export-runner";
import { formatDuration } from "@/lib/time";
import type { Segment } from "@/lib/types";
import { isJobActive, useEditor } from "@/store/editor-store";

import { Button } from "./ui/button";
import { TimecodeInput } from "./ui/timecode-input";

/**
 * One editable segment: label, precise start/end inputs (with "set to
 * playhead" buttons), duration, and jump / export / delete actions.
 */
export function SegmentRow({ segment, index }: { segment: Segment; index: number }) {
  const selected = useEditor((s) => s.selectedId === segment.id);
  const busy = useEditor((s) => isJobActive(s.job));
  const { updateSegment, removeSegment, selectSegment, jumpToSegment } = useEditor.getState();

  const playhead = () => useEditor.getState().videoEl?.currentTime ?? useEditor.getState().currentTime;
  const name = segment.label || `Segment ${index + 1}`;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      onClick={() => selectSegment(segment.id)}
      className={`group relative overflow-hidden rounded-xl border bg-raised/60 p-3 pl-4 transition-colors ${
        selected ? "border-line-strong bg-raised" : "border-line hover:border-line-strong"
      }`}
      style={selected ? { boxShadow: `0 0 0 1px ${segment.color}66` } : undefined}
    >
      {/* Color accent */}
      <span className="absolute top-0 bottom-0 left-0 w-1" style={{ backgroundColor: segment.color }} />

      <div className="flex items-center gap-2">
        <span className="timecode w-5 shrink-0 text-xs font-semibold" style={{ color: segment.color }}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <input
          aria-label={`Label for ${name}`}
          value={segment.label}
          placeholder={`Segment ${index + 1}`}
          maxLength={80}
          onChange={(e) => updateSegment(segment.id, { label: e.target.value })}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm text-ink transition-colors outline-none placeholder:text-ink-faint hover:border-line focus:border-accent focus-visible:outline-none"
        />
        <span className="timecode shrink-0 text-xs text-ink-muted">
          {formatDuration(segment.endTime - segment.startTime)}
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1.5 pl-7">
        {(["start", "end"] as const).map((edge) => {
          const isStart = edge === "start";
          const value = isStart ? segment.startTime : segment.endTime;
          return (
            <div key={edge} className="contents">
              <span className={`text-[10px] font-semibold tracking-wider uppercase ${isStart ? "text-mark-in" : "text-mark-out"}`}>
                {isStart ? "In" : "Out"}
              </span>
              <TimecodeInput
                aria-label={`${name} ${isStart ? "start" : "end"} time`}
                value={value}
                onCommit={(t) => updateSegment(segment.id, isStart ? { startTime: t } : { endTime: t })}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                title={`Set ${isStart ? "start" : "end"} to playhead`}
                aria-label={`Set ${name} ${isStart ? "start" : "end"} to playhead`}
                onClick={(e) => {
                  e.stopPropagation();
                  updateSegment(segment.id, isStart ? { startTime: playhead() } : { endTime: playhead() });
                }}
              >
                <Crosshair className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-end gap-1 border-t border-line/60 pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          title="Jump to start"
          onClick={(e) => {
            e.stopPropagation();
            jumpToSegment(segment.id);
          }}
        >
          <Play className="h-3 w-3" />
          Jump
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          disabled={busy}
          title="Cut and download this clip"
          onClick={(e) => {
            e.stopPropagation();
            runExport({ segmentIds: [segment.id], zip: false });
          }}
        >
          <Download className="h-3 w-3" />
          Export
        </Button>
        <Button
          variant="danger"
          size="icon-sm"
          title="Delete segment (Del)"
          aria-label={`Delete ${name}`}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            removeSegment(segment.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.li>
  );
}
