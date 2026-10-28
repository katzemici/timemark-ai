import type { CSSProperties, ReactNode } from "react";

interface KbdProps {
  children: ReactNode;
  /** `inverse` is for use on the solid accent (primary) button. */
  tone?: "default" | "inverse";
  /** Overrides the text color, e.g. to tint an active In/Out key. */
  color?: string;
  className?: string;
}

const TONES = {
  default: "border-line-strong bg-canvas text-ink-muted",
  inverse: "border-canvas/30 bg-canvas/15 text-canvas",
};

/**
 * Keyboard key hint, e.g. <Kbd>I</Kbd>. Colors come from `tone`/`color`
 * rather than className overrides, because conflicting Tailwind utilities
 * resolve by stylesheet order, not by class order.
 */
export function Kbd({ children, tone = "default", color, className = "" }: KbdProps) {
  const style: CSSProperties | undefined = color ? { color } : undefined;
  return (
    <kbd
      style={style}
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 font-mono text-[10px] leading-none font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </kbd>
  );
}
