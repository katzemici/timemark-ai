"use client";

import { motion } from "framer-motion";
import { FileVideo, ShieldCheck, Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { Kbd } from "./ui/kbd";

const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm", "mkv", "ogv"];
export const VIDEO_ACCEPT = "video/*,.mp4,.m4v,.mov,.webm,.mkv";

/** Accepts files by MIME type, falling back to extension (MKV often has none). */
export function isVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.includes(ext);
}

/** Empty-state upload target shown before a video is loaded. */
export function Dropzone({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <main className="grid flex-1 place-items-center p-6">
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`group flex w-full max-w-xl flex-col items-center gap-5 rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-colors duration-200 ${
          over ? "border-accent bg-accent/5" : "border-line hover:border-line-strong hover:bg-surface"
        }`}
      >
        <span
          className={`grid h-14 w-14 place-items-center rounded-2xl border border-line bg-raised transition-transform duration-200 group-hover:-translate-y-0.5 ${
            over ? "scale-110 text-accent" : "text-ink-muted"
          }`}
        >
          {over ? <FileVideo className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
        </span>

        <span className="space-y-1.5">
          <span className="block text-base font-medium text-ink">Drop a video to start marking</span>
          <span className="block text-sm text-ink-muted">
            or click to browse — MP4, MOV, WebM, MKV
          </span>
        </span>

        <span className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-ink-faint">
          <span className="flex items-center gap-1.5">
            <Kbd>I</Kbd> in
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>O</Kbd> out
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> add segment
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Space</Kbd> play
          </span>
        </span>

        <span className="flex items-center gap-1.5 text-xs text-ink-faint">
          <ShieldCheck className="h-3.5 w-3.5" />
          Processed locally in your browser. Nothing is uploaded.
        </span>
      </motion.button>

      <input
        ref={inputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </main>
  );
}
