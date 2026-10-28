/**
 * Global editor state (Zustand).
 *
 * The <video> element is the source of truth for playback; this store mirrors
 * its time/play state for rendering and exposes imperative transport actions
 * that drive the registered element. Components should subscribe with narrow
 * selectors (e.g. `useEditor((s) => s.currentTime)`) because `currentTime`
 * updates every animation frame during playback.
 */
import { create } from "zustand";

import { colorForIndex } from "@/lib/colors";
import { MIN_SEGMENT_DURATION, clamp, roundMs } from "@/lib/time";
import type { CutMode, ExportJob, Segment, SegmentPatch, SourceVideo } from "@/lib/types";

export interface Notice {
  id: number;
  tone: "info" | "error";
  message: string;
}

const IDLE_JOB: ExportJob = { phase: "idle", mode: "copy", zip: false, clips: [], progress: 0 };

interface EditorState {
  // Source + playback
  source: SourceVideo | null;
  videoEl: HTMLVideoElement | null;
  currentTime: number;
  isPlaying: boolean;
  muted: boolean;

  // Markers
  inPoint: number | null;
  outPoint: number | null;
  segments: Segment[];
  selectedId: string | null;
  /** Monotonic counter so colors keep cycling after deletions. */
  colorCursor: number;

  // Export
  cutMode: CutMode;
  job: ExportJob;

  notice: Notice | null;
}

interface EditorActions {
  loadFile: (file: File) => void;
  setMetadata: (meta: { duration: number; width: number; height: number }) => void;
  reset: () => void;

  registerVideo: (el: HTMLVideoElement | null) => void;
  syncTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  toggleMute: () => void;
  seek: (time: number) => void;
  seekBy: (delta: number) => void;

  markIn: (time?: number) => void;
  markOut: (time?: number) => void;
  clearMarks: () => void;
  /** Turns the pending In/Out range into a segment. Returns false if invalid. */
  commitSegment: () => boolean;

  updateSegment: (id: string, patch: SegmentPatch) => void;
  removeSegment: (id: string) => void;
  selectSegment: (id: string | null) => void;
  jumpToSegment: (id: string) => void;

  setCutMode: (mode: CutMode) => void;
  setJob: (updater: (job: ExportJob) => ExportJob) => void;
  resetJob: () => void;

  notify: (message: string, tone?: Notice["tone"]) => void;
  dismissNotice: () => void;
}

export type EditorStore = EditorState & EditorActions;

const initialState: EditorState = {
  source: null,
  videoEl: null,
  currentTime: 0,
  isPlaying: false,
  muted: false,
  inPoint: null,
  outPoint: null,
  segments: [],
  selectedId: null,
  colorCursor: 0,
  cutMode: "copy",
  job: IDLE_JOB,
  notice: null,
};

let noticeId = 0;

const sortByStart = (segments: Segment[]) =>
  [...segments].sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const useEditor = create<EditorStore>()((set, get) => ({
  ...initialState,

  // ---------------------------------------------------------------- source --

  loadFile: (file) => {
    const previous = get().source;
    if (previous) URL.revokeObjectURL(previous.url);

    set({
      ...initialState,
      videoEl: get().videoEl,
      muted: get().muted,
      cutMode: get().cutMode,
      source: { file, url: URL.createObjectURL(file), duration: 0, width: 0, height: 0 },
    });
  },

  setMetadata: ({ duration, width, height }) => {
    const source = get().source;
    if (!source) return;
    set({ source: { ...source, duration, width, height } });
  },

  reset: () => {
    const { source, videoEl, muted, cutMode } = get();
    if (source) URL.revokeObjectURL(source.url);
    set({ ...initialState, videoEl, muted, cutMode });
  },

  // -------------------------------------------------------------- playback --

  registerVideo: (el) => set({ videoEl: el }),

  syncTime: (time) => {
    if (time !== get().currentTime) set({ currentTime: time });
  },

  setPlaying: (playing) => set({ isPlaying: playing }),

  togglePlay: () => {
    const el = get().videoEl;
    if (!el || !get().source) return;
    if (el.paused || el.ended) {
      // play() rejects if interrupted by a pause or source change; that is benign.
      el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  },

  toggleMute: () => {
    const el = get().videoEl;
    const muted = !get().muted;
    if (el) el.muted = muted;
    set({ muted });
  },

  seek: (time) => {
    const { videoEl, source } = get();
    if (!videoEl || !source?.duration) return;
    const target = clamp(time, 0, source.duration);
    videoEl.currentTime = target;
    // Update immediately so the UI does not wait for the `seeked` event.
    set({ currentTime: target });
  },

  seekBy: (delta) => {
    const { videoEl, currentTime } = get();
    // Prefer the element's time: it is fresher than the mirrored value.
    get().seek((videoEl?.currentTime ?? currentTime) + delta);
  },

  // --------------------------------------------------------------- markers --

  markIn: (time) => {
    const { source, outPoint } = get();
    if (!source?.duration) return;
    const t = roundMs(time ?? currentPlayhead(get()));
    // Placing In at/after the pending Out invalidates the Out point.
    const keepOut = outPoint !== null && outPoint - t >= MIN_SEGMENT_DURATION;
    set({ inPoint: t, outPoint: keepOut ? outPoint : null });
  },

  markOut: (time) => {
    const { source, inPoint } = get();
    if (!source?.duration) return;
    const t = roundMs(time ?? currentPlayhead(get()));
    const keepIn = inPoint !== null && t - inPoint >= MIN_SEGMENT_DURATION;
    set({ outPoint: t, inPoint: keepIn ? inPoint : null });
  },

  clearMarks: () => set({ inPoint: null, outPoint: null }),

  commitSegment: () => {
    const { source, inPoint, outPoint, segments, colorCursor } = get();
    if (!source?.duration) return false;

    if (inPoint === null && outPoint === null) {
      get().notify("Set an In point (I) or Out point (O) first.");
      return false;
    }

    // A missing side defaults to the start/end of the video.
    const start = inPoint ?? 0;
    const end = outPoint ?? source.duration;
    if (end - start < MIN_SEGMENT_DURATION) {
      get().notify("Out point must be after the In point.", "error");
      return false;
    }

    const segment: Segment = {
      id: makeId(),
      startTime: roundMs(start),
      endTime: roundMs(end),
      label: "",
      color: colorForIndex(colorCursor),
    };

    set({
      segments: sortByStart([...segments, segment]),
      colorCursor: colorCursor + 1,
      selectedId: segment.id,
      inPoint: null,
      outPoint: null,
    });
    return true;
  },

  updateSegment: (id, patch) => {
    const { segments, source } = get();
    const duration = source?.duration ?? 0;

    const next = segments.map((seg) => {
      if (seg.id !== id) return seg;
      let { startTime, endTime } = seg;

      // Clamp each edited edge against the opposite edge and the video bounds.
      if (patch.startTime !== undefined) {
        startTime = clamp(patch.startTime, 0, endTime - MIN_SEGMENT_DURATION);
      }
      if (patch.endTime !== undefined) {
        endTime = clamp(patch.endTime, startTime + MIN_SEGMENT_DURATION, duration);
      }

      return {
        ...seg,
        startTime: roundMs(startTime),
        endTime: roundMs(endTime),
        label: patch.label ?? seg.label,
      };
    });

    set({ segments: sortByStart(next) });
  },

  removeSegment: (id) =>
    set((s) => ({
      segments: s.segments.filter((seg) => seg.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  selectSegment: (id) => set({ selectedId: id }),

  jumpToSegment: (id) => {
    const seg = get().segments.find((s) => s.id === id);
    if (!seg) return;
    set({ selectedId: id });
    get().seek(seg.startTime);
  },

  // ---------------------------------------------------------------- export --

  setCutMode: (mode) => set({ cutMode: mode }),
  setJob: (updater) => set((s) => ({ job: updater(s.job) })),
  resetJob: () => set({ job: IDLE_JOB }),

  // --------------------------------------------------------------- notices --

  notify: (message, tone = "info") => set({ notice: { id: ++noticeId, tone, message } }),
  dismissNotice: () => set({ notice: null }),
}));

/** Reads the most accurate playhead position available. */
function currentPlayhead(state: EditorState): number {
  return state.videoEl?.currentTime ?? state.currentTime;
}

/** True while an export job is actively running. */
export function isJobActive(job: ExportJob): boolean {
  return job.phase === "loading-engine" || job.phase === "cutting" || job.phase === "zipping";
}
