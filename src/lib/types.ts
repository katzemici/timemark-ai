/**
 * Core domain types for TimeMark.
 * All times are expressed in seconds (floating point) relative to the start
 * of the loaded source video.
 */

/** A single cut range on the source video. */
export interface Segment {
  /** Stable unique id (used as React key and for selection). */
  id: string;
  /** In point, in seconds. Always `< endTime`. */
  startTime: number;
  /** Out point, in seconds. Always `<= duration`. */
  endTime: number;
  /** Optional user label; also used in the exported filename. */
  label: string;
  /** Display color for timeline overlay and list accent (CSS color). */
  color: string;
}

/** Editable fields of a segment. */
export type SegmentPatch = Partial<Pick<Segment, "startTime" | "endTime" | "label">>;

/** Metadata about the loaded source file. */
export interface SourceVideo {
  file: File;
  /** Object URL pointing at `file`, used as the <video> src. */
  url: string;
  /** Duration in seconds; 0 until the browser has read the metadata. */
  duration: number;
  width: number;
  height: number;
}

/**
 * How segments are cut.
 * - `copy`: stream copy, lossless and fast, but cut points snap to the
 *   nearest preceding keyframe.
 * - `precise`: re-encodes to H.264/AAC MP4 for frame-accurate cuts. Slower.
 */
export type CutMode = "copy" | "precise";

export type ClipStatus = "pending" | "processing" | "done" | "error";

/** A finished (or in-flight) exported clip. */
export interface ClipResult {
  segmentId: string;
  fileName: string;
  status: ClipStatus;
  /** 0..1 progress of this clip. */
  progress: number;
  blob?: Blob;
  error?: string;
}

export type ExportPhase =
  | "idle"
  | "loading-engine"
  | "cutting"
  | "zipping"
  | "done"
  | "error"
  | "cancelled";

export interface ExportJob {
  phase: ExportPhase;
  mode: CutMode;
  /** Whether the job bundles every clip into a single ZIP. */
  zip: boolean;
  clips: ClipResult[];
  /** 0..1 overall progress across all clips (and zipping). */
  progress: number;
  /** 0..1 engine download progress; `null` when size is unknown. */
  engineProgress?: number | null;
  error?: string;
}
