"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { clamp, formatTimecode } from "@/lib/time";
import type { Segment } from "@/lib/types";
import { useEditor } from "@/store/editor-store";

/** Candidate tick spacings in seconds; the smallest that fits is used. */
const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
const MIN_TICK_PX = 72;

type DragState =
  | { kind: "scrub" }
  | { kind: "edge"; id: string; edge: "start" | "end" };

/**
 * Scrub bar with:
 * - committed segments as colored regions (click to select, drag the
 *   selected segment's edges to trim),
 * - the pending In/Out range as a hatched region,
 * - the playhead and a hover readout.
 */
export function Timeline() {
  const trackRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(trackRef);

  const duration = useEditor((s) => s.source?.duration ?? 0);
  const currentTime = useEditor((s) => s.currentTime);
  const segments = useEditor((s) => s.segments);
  const selectedId = useEditor((s) => s.selectedId);
  const inPoint = useEditor((s) => s.inPoint);
  const outPoint = useEditor((s) => s.outPoint);
  const { seek, selectSegment, updateSegment } = useEditor.getState();

  const [hoverX, setHoverX] = useState<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const pct = (t: number) => (duration > 0 ? (clamp(t, 0, duration) / duration) * 100 : 0);

  /** Converts a client X coordinate to a time on the track. */
  const timeAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || duration === 0) return 0;
    return clamp(((clientX - rect.left) / rect.width) * duration, 0, duration);
  };

  const ticks = useMemo(() => buildTicks(duration, width), [duration, width]);

  // ------------------------------------------------------------- pointer --

  const beginDrag = (e: ReactPointerEvent, state: DragState) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    trackRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = state;
    setDragging(true);
    applyDrag(e.clientX);
  };

  const applyDrag = (clientX: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    const t = timeAt(clientX);
    if (drag.kind === "scrub") {
      seek(t);
    } else {
      updateSegment(drag.id, drag.edge === "start" ? { startTime: t } : { endTime: t });
      // Preview the frame at the edge being trimmed.
      seek(t);
    }
  };

  const endDrag = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    trackRef.current?.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    setDragging(false);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect) setHoverX(clamp(e.clientX - rect.left, 0, rect.width));
    applyDrag(e.clientX);
  };

  // ------------------------------------------------------- pending range --

  // While only In is set, preview the range up to the playhead.
  const pendingStart = inPoint ?? null;
  const pendingEnd = outPoint ?? (inPoint !== null && currentTime > inPoint ? currentTime : null);

  const hoverTime = hoverX !== null && width > 0 ? (hoverX / width) * duration : null;

  return (
    <div className="select-none">
      {/* Tick labels */}
      <div className="relative mb-1 h-4 text-[10px] text-ink-faint">
        {ticks.map((t) => (
          <span
            key={t}
            className="timecode absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${pct(t)}%` }}
          >
            {formatTick(t, duration)}
          </span>
        ))}
      </div>

      <div
        ref={trackRef}
        role="slider"
        aria-label="Timeline"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        aria-valuetext={formatTimecode(currentTime)}
        tabIndex={-1}
        className={`relative h-14 touch-none rounded-lg border border-line bg-canvas ${
          dragging ? "cursor-grabbing" : "cursor-pointer"
        }`}
        onPointerDown={(e) => beginDrag(e, { kind: "scrub" })}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => !dragging && setHoverX(null)}
      >
        {/* Tick grid */}
        {ticks.map((t) => (
          <span
            key={t}
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-line/70"
            style={{ left: `${pct(t)}%` }}
          />
        ))}

        {/* Committed segments */}
        {segments.map((seg, i) => (
          <SegmentRegion
            key={seg.id}
            segment={seg}
            index={i}
            left={pct(seg.startTime)}
            width={pct(seg.endTime) - pct(seg.startTime)}
            selected={seg.id === selectedId}
            onSelect={(e) => {
              selectSegment(seg.id);
              beginDrag(e, { kind: "scrub" });
            }}
            onEdgeDown={(e, edge) => {
              selectSegment(seg.id);
              beginDrag(e, { kind: "edge", id: seg.id, edge });
            }}
          />
        ))}

        {/* Pending In/Out range */}
        {pendingStart !== null && pendingEnd !== null && pendingEnd > pendingStart && (
          <div
            className={`hatch pointer-events-none absolute top-0 bottom-0 border-y border-white/30 ${
              outPoint === null ? "opacity-50" : ""
            }`}
            style={{ left: `${pct(pendingStart)}%`, width: `${pct(pendingEnd) - pct(pendingStart)}%` }}
          />
        )}
        {inPoint !== null && <MarkFlag time={pct(inPoint)} kind="in" />}
        {outPoint !== null && <MarkFlag time={pct(outPoint)} kind="out" />}

        {/* Hover readout */}
        {hoverTime !== null && !dragging && (
          <div className="pointer-events-none absolute top-0 bottom-0 z-20" style={{ left: hoverX! }}>
            <span className="absolute top-0 bottom-0 w-px bg-white/25" />
            <span className="timecode absolute -top-7 -translate-x-1/2 rounded bg-raised px-1.5 py-0.5 text-[10px] whitespace-nowrap text-ink shadow-lg ring-1 ring-line">
              {formatTimecode(hoverTime)}
            </span>
          </div>
        )}

        {/* Playhead */}
        <div
          className="pointer-events-none absolute -top-1.5 -bottom-1.5 z-30 w-0"
          style={{ left: `${pct(currentTime)}%` }}
        >
          <span className="absolute top-0 -left-[5px] h-2.5 w-2.5 rotate-45 rounded-[2px] bg-white shadow" />
          <span className="absolute top-1 bottom-0 -left-px w-0.5 bg-white shadow-[0_0_8px_rgb(255_255_255/0.6)]" />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- subparts --

interface SegmentRegionProps {
  segment: Segment;
  index: number;
  left: number;
  width: number;
  selected: boolean;
  onSelect: (e: ReactPointerEvent) => void;
  onEdgeDown: (e: ReactPointerEvent, edge: "start" | "end") => void;
}

function SegmentRegion({ segment, index, left, width, selected, onSelect, onEdgeDown }: SegmentRegionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scaleY: 0.6 }}
      animate={{ opacity: 1, scaleY: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={`group absolute top-1.5 bottom-1.5 rounded-md transition-shadow ${selected ? "z-10" : ""}`}
      style={{
        left: `${left}%`,
        width: `max(${width}%, 2px)`,
        backgroundColor: `${segment.color}${selected ? "40" : "26"}`,
        boxShadow: selected
          ? `inset 0 0 0 1.5px ${segment.color}, 0 0 16px -4px ${segment.color}`
          : `inset 0 0 0 1px ${segment.color}99`,
      }}
      onPointerDown={onSelect}
      title={`${segment.label || `Segment ${index + 1}`} · ${formatTimecode(segment.startTime)} → ${formatTimecode(segment.endTime)}`}
    >
      <span
        className="timecode pointer-events-none absolute top-1 left-1.5 text-[10px] font-semibold"
        style={{ color: segment.color }}
      >
        {index + 1}
      </span>

      {/* Trim handles: always grabbable, visible on hover/selection. */}
      {(["start", "end"] as const).map((edge) => (
        <span
          key={edge}
          aria-hidden
          onPointerDown={(e) => onEdgeDown(e, edge)}
          className={`absolute top-0 bottom-0 w-2.5 cursor-ew-resize ${
            edge === "start" ? "-left-1.5" : "-right-1.5"
          }`}
        >
          <span
            className={`absolute top-1/2 left-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity ${
              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            style={{ backgroundColor: segment.color }}
          />
        </span>
      ))}
    </motion.div>
  );
}

function MarkFlag({ time, kind }: { time: number; kind: "in" | "out" }) {
  const color = kind === "in" ? "var(--color-mark-in)" : "var(--color-mark-out)";
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-none absolute top-0 bottom-0 z-20 w-0"
      style={{ left: `${time}%` }}
    >
      <span className="absolute top-0 bottom-0 -left-px w-0.5" style={{ backgroundColor: color }} />
      <span
        className={`absolute -top-px px-1 text-[9px] leading-3.5 font-bold text-canvas ${
          kind === "in" ? "left-0 rounded-r rounded-bl" : "right-0 rounded-l rounded-br"
        }`}
        style={{ backgroundColor: color }}
      >
        {kind === "in" ? "IN" : "OUT"}
      </span>
    </motion.div>
  );
}

// ------------------------------------------------------------- helpers --

function useElementWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function buildTicks(duration: number, width: number): number[] {
  if (duration <= 0 || width <= 0) return [];
  const maxTicks = Math.max(1, Math.floor(width / MIN_TICK_PX));
  const step = TICK_STEPS.find((s) => duration / s <= maxTicks) ?? TICK_STEPS.at(-1)!;
  const ticks: number[] = [];
  // Skip 0 and anything too close to the end so labels don't clip.
  for (let t = step; t < duration - step * 0.4; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return ticks;
}

/** Short tick label: `1:05`, `0:12.5`, `1:02:00`. */
function formatTick(t: number, duration: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const whole = Math.abs(s - Math.round(s)) < 0.005;
  const sText = whole
    ? String(Math.round(s)).padStart(2, "0")
    : (s < 10 ? "0" : "") + s.toFixed(2);
  return duration >= 3600 ? `${h}:${String(m).padStart(2, "0")}:${sText}` : `${m}:${sText}`;
}
