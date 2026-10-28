"use client";

import {
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
  Plus,
  StepBack,
  StepForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { FINE_STEP, SEEK_STEP, formatTimecode } from "@/lib/time";
import { useEditor } from "@/store/editor-store";

import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";

/** Playback controls, timecode readout, and In/Out/Add marker actions. */
export function TransportBar() {
  const isPlaying = useEditor((s) => s.isPlaying);
  const muted = useEditor((s) => s.muted);
  const currentTime = useEditor((s) => s.currentTime);
  const duration = useEditor((s) => s.source?.duration ?? 0);
  const inPoint = useEditor((s) => s.inPoint);
  const outPoint = useEditor((s) => s.outPoint);
  const { togglePlay, toggleMute, seekBy, markIn, markOut, clearMarks, commitSegment } =
    useEditor.getState();

  const hasMarks = inPoint !== null || outPoint !== null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
      {/* Transport */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => seekBy(-SEEK_STEP)} title="Back 1s (←)" aria-label="Back 1 second">
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => seekBy(-FINE_STEP)} title="Back 0.1s (Shift+←)" aria-label="Back 0.1 second">
          <StepBack className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={togglePlay}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="h-10 w-10 rounded-full"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => seekBy(FINE_STEP)} title="Forward 0.1s (Shift+→)" aria-label="Forward 0.1 second">
          <StepForward className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => seekBy(SEEK_STEP)} title="Forward 1s (→)" aria-label="Forward 1 second">
          <ChevronsRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleMute} title={muted ? "Unmute (M)" : "Mute (M)"} aria-label={muted ? "Unmute" : "Mute"}>
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      </div>

      {/* Timecode */}
      <div className="timecode text-sm" aria-live="off">
        <span className="text-ink">{formatTimecode(currentTime)}</span>
        <span className="mx-1.5 text-ink-faint">/</span>
        <span className="text-ink-faint">{formatTimecode(duration)}</span>
      </div>

      {/* Markers */}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <MarkButton kind="in" value={inPoint} onClick={() => markIn()} />
        <MarkButton kind="out" value={outPoint} onClick={() => markOut()} />
        {hasMarks && (
          <Button variant="ghost" size="icon-sm" onClick={clearMarks} title="Clear In/Out (Esc)" aria-label="Clear In and Out points">
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={commitSegment} disabled={!hasMarks} title="Add segment (Enter or A)">
          <Plus className="h-3.5 w-3.5" />
          Add segment
          <Kbd tone="inverse">↵</Kbd>
        </Button>
      </div>
    </div>
  );
}

function MarkButton({ kind, value, onClick }: { kind: "in" | "out"; value: number | null; onClick: () => void }) {
  const isIn = kind === "in";
  const color = isIn ? "text-mark-in" : "text-mark-out";
  const ring = isIn ? "border-mark-in/50" : "border-mark-out/50";

  return (
    <button
      type="button"
      onClick={onClick}
      title={isIn ? "Set In point at playhead (I)" : "Set Out point at playhead (O)"}
      className={`group flex h-8 items-center gap-2 rounded-lg border bg-raised pr-2.5 pl-1.5 text-xs transition-colors hover:bg-[#1a2335] active:scale-[0.97] ${
        value !== null ? ring : "border-line hover:border-line-strong"
      }`}
    >
      <Kbd color={value !== null ? (isIn ? "var(--color-mark-in)" : "var(--color-mark-out)") : undefined}>
        {isIn ? "I" : "O"}
      </Kbd>
      <span className={`font-medium ${value !== null ? color : "text-ink-muted"}`}>{isIn ? "In" : "Out"}</span>
      <span className={`timecode ${value !== null ? "text-ink" : "text-ink-faint"}`}>
        {value !== null ? formatTimecode(value) : "--:--:--.---"}
      </span>
    </button>
  );
}
