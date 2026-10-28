"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, Info } from "lucide-react";
import { useEffect } from "react";

import { useEditor } from "@/store/editor-store";

const AUTO_DISMISS_MS = 3500;

/** Single transient notice, bottom-center. New notices replace old ones. */
export function Toast() {
  const notice = useEditor((s) => s.notice);
  const dismiss = useEditor((s) => s.dismissNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [notice, dismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            role={notice.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-xl border bg-raised px-4 py-2.5 text-sm shadow-xl shadow-black/40 ${
              notice.tone === "error" ? "border-danger/40 text-ink" : "border-line text-ink"
            }`}
            onClick={dismiss}
          >
            {notice.tone === "error" ? (
              <CircleAlert className="h-4 w-4 shrink-0 text-danger" />
            ) : (
              <Info className="h-4 w-4 shrink-0 text-accent" />
            )}
            {notice.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
