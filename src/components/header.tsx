"use client";

import { Archive, FolderOpen, RotateCcw, Scissors } from "lucide-react";
import { useRef } from "react";

import { runExport } from "@/lib/export-runner";
import { formatTimecode } from "@/lib/time";
import { isJobActive, useEditor } from "@/store/editor-store";

import { VIDEO_ACCEPT } from "./dropzone";
import { Button } from "./ui/button";

/** App header: brand, loaded file details, and primary actions. */
export function Header({ onOpenFile }: { onOpenFile: (file: File) => void }) {
  const source = useEditor((s) => s.source);
  const segmentCount = useEditor((s) => s.segments.length);
  const busy = useEditor((s) => isJobActive(s.job));
  const reset = useEditor((s) => s.reset);
  const inputRef = useRef<HTMLInputElement>(null);

  const onReset = () => {
    if (segmentCount > 0 && !window.confirm("Close this video and clear all segments?")) return;
    reset();
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line px-4 sm:px-6">
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 text-accent">
          <Scissors className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">TimeMark</span>
      </div>

      {source && (
        <div className="hidden min-w-0 items-center gap-3 border-l border-line pl-4 text-xs text-ink-muted md:flex">
          <span className="truncate font-medium text-ink" title={source.file.name}>
            {source.file.name}
          </span>
          <span className="shrink-0 text-ink-faint">{formatBytes(source.file.size)}</span>
          {source.width > 0 && (
            <span className="timecode shrink-0 text-ink-faint">
              {source.width}×{source.height}
            </span>
          )}
          {source.duration > 0 && (
            <span className="timecode shrink-0 text-ink-faint">{formatTimecode(source.duration)}</span>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {source && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              title="Open another video"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={onReset} disabled={busy} title="Close video and clear segments">
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => runExport({ zip: true })}
              disabled={busy || segmentCount === 0}
              title="Cut every segment and download a ZIP"
            >
              <Archive className="h-3.5 w-3.5" />
              Export all
              {segmentCount > 0 && (
                <span className="timecode rounded bg-canvas/20 px-1.5 py-px text-[10px]">{segmentCount}</span>
              )}
            </Button>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onOpenFile(file);
          e.target.value = "";
        }}
      />
    </header>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
