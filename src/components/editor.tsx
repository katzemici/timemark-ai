"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState, type DragEvent } from "react";

import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useEditor } from "@/store/editor-store";

import { Dropzone, isVideoFile } from "./dropzone";
import { ExportDialog } from "./export-dialog";
import { Header } from "./header";
import { SegmentPanel } from "./segment-panel";
import { Timeline } from "./timeline";
import { Toast } from "./toast";
import { TransportBar } from "./transport-bar";
import { VideoPlayer } from "./video-player";

/**
 * Top-level editor: header, player workspace, segment sidebar, and global
 * concerns (keyboard shortcuts, drag-to-replace, unsaved-work guard).
 */
export function Editor() {
  const hasSource = useEditor((s) => s.source !== null);
  const hasSegments = useEditor((s) => s.segments.length > 0);
  const loadFile = useEditor((s) => s.loadFile);
  const notify = useEditor((s) => s.notify);
  const [dragging, setDragging] = useState(false);

  useKeyboardShortcuts();

  // Warn before closing the tab when there is unexported marking work.
  useEffect(() => {
    if (!hasSegments) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasSegments]);

  /** Loads a file, confirming first if it would discard existing segments. */
  const openFile = useCallback(
    (file: File) => {
      if (!isVideoFile(file)) {
        notify(`"${file.name}" is not a supported video file.`, "error");
        return;
      }
      const { segments } = useEditor.getState();
      if (
        segments.length > 0 &&
        !window.confirm(`Replace the current video? Your ${segments.length} segment(s) will be cleared.`)
      ) {
        return;
      }
      loadFile(file);
    },
    [loadFile, notify],
  );

  // Dropping a new file anywhere on the workspace replaces the video.
  const onDragOver = (e: DragEvent) => {
    if (!hasSource || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragging(true);
  };
  const onDrop = (e: DragEvent) => {
    if (!hasSource) return;
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) openFile(file);
  };

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <Header onOpenFile={openFile} />

      {hasSource ? (
        <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <section
            aria-label="Player"
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 sm:p-4 lg:gap-4 lg:p-6"
          >
            <VideoPlayer />
            <div className="rounded-xl border border-line bg-surface p-3 sm:p-4">
              <Timeline />
              <TransportBar />
            </div>
          </section>
          <SegmentPanel />
        </main>
      ) : (
        <Dropzone onFile={openFile} />
      )}

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-canvas/80 backdrop-blur-sm"
          >
            <div className="rounded-2xl border-2 border-dashed border-accent px-10 py-8 text-sm text-ink">
              Drop to replace the current video
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ExportDialog />
      <Toast />
    </div>
  );
}
