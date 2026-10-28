"use client";

import { useState, type KeyboardEvent } from "react";

import { formatTimecode, parseTimecode } from "@/lib/time";

interface TimecodeInputProps {
  value: number;
  onCommit: (seconds: number) => void;
  "aria-label": string;
  className?: string;
}

/**
 * Precise timecode field. While focused, edits go to a local draft that is
 * committed on Enter or blur; Escape or an unparseable value reverts. When
 * not focused the field always shows `value`, so external changes (e.g.
 * dragging a segment edge on the timeline) appear immediately.
 *
 * ArrowUp/ArrowDown nudge by 0.1s (Shift: 1s, Alt: 0.001s).
 */
export function TimecodeInput({ value, onCommit, className = "", ...aria }: TimecodeInputProps) {
  const formatted = formatTimecode(value);
  /** `null` = not editing; display the formatted value. */
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseTimecode(draft);
    setDraft(null);
    if (parsed === null) {
      setInvalid(true);
      window.setTimeout(() => setInvalid(false), 600);
      return;
    }
    onCommit(parsed);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur(); // blur commits
    } else if (e.key === "Escape") {
      setDraft(null);
      // Keep the cleared draft from being committed by the blur below.
      e.currentTarget.dataset.cancel = "1";
      e.currentTarget.blur();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const step = e.shiftKey ? 1 : e.altKey ? 0.001 : 0.1;
      const base = (draft !== null ? parseTimecode(draft) : null) ?? value;
      const next = Math.max(0, base + (e.key === "ArrowUp" ? step : -step));
      onCommit(next);
      setDraft(formatTimecode(next));
    }
  };

  return (
    <input
      {...aria}
      inputMode="decimal"
      spellCheck={false}
      autoComplete="off"
      value={draft ?? formatted}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        setDraft(formatted);
        e.currentTarget.select();
      }}
      onBlur={(e) => {
        if (e.currentTarget.dataset.cancel) {
          delete e.currentTarget.dataset.cancel;
          setDraft(null);
          return;
        }
        commit();
      }}
      onKeyDown={onKeyDown}
      className={`timecode w-[7.75rem] rounded-md border bg-canvas px-2 py-1 text-xs text-ink transition-colors outline-none hover:border-line-strong focus:border-accent focus-visible:outline-none ${
        invalid ? "border-danger" : "border-line"
      } ${className}`}
    />
  );
}
