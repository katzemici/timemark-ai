/**
 * Time helpers. Timecodes use the `HH:MM:SS.mmm` format, e.g. `00:01:23.450`.
 */

/** Minimum allowed segment length in seconds (prevents zero-length cuts). */
export const MIN_SEGMENT_DURATION = 0.05;

/** Arrow-key seek step and Shift+Arrow fine step, in seconds. */
export const SEEK_STEP = 1;
export const FINE_STEP = 0.1;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds to whole milliseconds to avoid float noise like 1.2000000002. */
export function roundMs(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

/** Formats seconds as `HH:MM:SS.mmm`. Negative/invalid values render as zero. */
export function formatTimecode(seconds: number): string {
  const totalMs = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

/** Compact duration for list display: `1:23.4` or `12.35s`. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0.00s";
  if (seconds < 60) return `${seconds.toFixed(2)}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/**
 * Parses a user-entered timecode. Accepts:
 * - `HH:MM:SS.mmm`, `MM:SS.mmm`, `SS.mmm`
 * - plain seconds such as `83.45`
 * Comma is accepted as decimal separator. Returns `null` when invalid.
 */
export function parseTimecode(input: string): number | null {
  const text = input.trim().replace(",", ".");
  if (!text) return null;

  const parts = text.split(":");
  if (parts.length > 3) return null;

  // Every part but the last must be an integer; the last may have decimals.
  const numericPattern = /^\d+$/;
  const lastPattern = /^\d+(\.\d+)?$/;
  for (let i = 0; i < parts.length; i++) {
    const pattern = i === parts.length - 1 ? lastPattern : numericPattern;
    if (!pattern.test(parts[i])) return null;
  }

  const values = parts.map(Number);
  let seconds = 0;
  for (const v of values) seconds = seconds * 60 + v;
  return roundMs(seconds);
}

/** Filename-safe compact timestamp: `00h01m23s450`. */
export function fileTimestamp(seconds: number): string {
  return formatTimecode(seconds).replace(/^(\d\d):(\d\d):(\d\d)\.(\d{3})$/, "$1h$2m$3s$4");
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}
