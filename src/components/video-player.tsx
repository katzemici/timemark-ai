"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useEditor } from "@/store/editor-store";

/**
 * Native <video> element plus time synchronisation into the store.
 *
 * `timeupdate` only fires ~4x/second, which is too coarse for a precise
 * playhead. While playing we instead sample `currentTime` once per presented
 * video frame (requestVideoFrameCallback) or per animation frame as a
 * fallback.
 */
export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const url = useEditor((s) => s.source?.url);
  const isPlaying = useEditor((s) => s.isPlaying);
  const muted = useEditor((s) => s.muted);
  const { registerVideo, setMetadata, syncTime, setPlaying, togglePlay, notify } = useEditor.getState();

  // Brief center icon that confirms play/pause on click.
  const [flash, setFlash] = useState<{ key: number; playing: boolean } | null>(null);

  useEffect(() => {
    registerVideo(videoRef.current);
    return () => registerVideo(null);
  }, [registerVideo]);

  // High-frequency playhead sampling while playing.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isPlaying) return;

    let handle = 0;
    const hasRVFC = "requestVideoFrameCallback" in video;

    const tick = () => {
      syncTime(video.currentTime);
      handle = hasRVFC ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    };
    tick();

    return () => {
      if (hasRVFC) video.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
    };
  }, [isPlaying, syncTime]);

  const onClick = () => {
    const video = videoRef.current;
    if (!video) return;
    setFlash({ key: Date.now(), playing: video.paused });
    togglePlay();
  };

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-line bg-black">
      <video
        ref={videoRef}
        src={url}
        muted={muted}
        playsInline
        preload="auto"
        className="h-full max-h-full w-full cursor-pointer object-contain"
        onClick={onClick}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (!Number.isFinite(v.duration)) {
            // Streamed WebM (e.g. from MediaRecorder) has no duration header.
            // Seeking far past the end makes the browser compute it; the real
            // value then arrives via `durationchange`.
            v.currentTime = Number.MAX_SAFE_INTEGER;
            return;
          }
          setMetadata({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
          syncTime(v.currentTime);
          if (v.videoWidth === 0) {
            notify("This file has no video track the browser can display. Audio-only?", "error");
          }
        }}
        // Some containers report a refined duration after load.
        onDurationChange={(e) => {
          const v = e.currentTarget;
          if (!Number.isFinite(v.duration) || v.duration <= 0) return;
          const wasUnknown = (useEditor.getState().source?.duration ?? 0) === 0;
          setMetadata({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
          if (wasUnknown && v.currentTime > 0) v.currentTime = 0; // undo the probe seek
        }}
        onPlay={() => setPlaying(true)}
        onPause={(e) => {
          setPlaying(false);
          syncTime(e.currentTarget.currentTime);
        }}
        onEnded={() => setPlaying(false)}
        onSeeked={(e) => syncTime(e.currentTarget.currentTime)}
        onTimeUpdate={(e) => {
          // Covers paused-state changes the frame loop doesn't see.
          if (e.currentTarget.paused) syncTime(e.currentTarget.currentTime);
        }}
        onError={() =>
          notify(
            "Your browser can't play this video (codec not supported). Try an H.264 MP4 or WebM.",
            "error",
          )
        }
      />

      <AnimatePresence>
        {flash && (
          <motion.span
            key={flash.key}
            initial={{ opacity: 0.9, scale: 0.85 }}
            animate={{ opacity: 0, scale: 1.25 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            onAnimationComplete={() => setFlash(null)}
            className="pointer-events-none absolute grid h-16 w-16 place-items-center rounded-full bg-black/60 text-white backdrop-blur"
          >
            {flash.playing ? <Play className="ml-0.5 h-7 w-7" /> : <Pause className="h-7 w-7" />}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
