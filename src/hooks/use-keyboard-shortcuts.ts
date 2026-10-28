import { useEffect } from "react";

import { FINE_STEP, SEEK_STEP } from "@/lib/time";
import { isJobActive, useEditor } from "@/store/editor-store";

/**
 * Global editor shortcuts.
 *
 *   Space        play / pause
 *   I / O        set In / Out at the playhead
 *   Enter / A    add the pending range as a segment
 *   ← / →        seek 1s   (Shift: 0.1s)
 *   Esc          clear pending In/Out, then deselect
 *   Delete       remove the selected segment
 *   M            mute / unmute
 *
 * Shortcuts are ignored while typing in a field. On buttons, Space/Enter are
 * left to the button only when it was focused via keyboard (:focus-visible),
 * so mouse users clicking a control don't lose their shortcuts.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const state = useEditor.getState();
      if (!state.source || isJobActive(state.job)) return;

      const isActivationKey = e.key === " " || e.key === "Enter";
      if (isActivationKey) {
        if (isKeyboardFocusedControl(e.target)) return;
        // A mouse-clicked button keeps focus; drop it so the browser can't
        // also "click" it on keyup.
        if (e.target instanceof HTMLElement && e.target !== document.body) e.target.blur();
      }

      let handled = true;
      switch (e.key) {
        case " ":
          // Ignore auto-repeat so holding Space doesn't flicker playback.
          if (!e.repeat) state.togglePlay();
          break;
        case "i":
        case "I":
          state.markIn();
          break;
        case "o":
        case "O":
          state.markOut();
          break;
        case "Enter":
        case "a":
        case "A":
          if (!e.repeat) state.commitSegment();
          break;
        case "ArrowLeft":
          state.seekBy(-(e.shiftKey ? FINE_STEP : SEEK_STEP));
          break;
        case "ArrowRight":
          state.seekBy(e.shiftKey ? FINE_STEP : SEEK_STEP);
          break;
        case "Escape":
          if (state.inPoint !== null || state.outPoint !== null) state.clearMarks();
          else state.selectSegment(null);
          break;
        case "Delete":
        case "Backspace":
          if (state.selectedId) state.removeSegment(state.selectedId);
          else handled = false;
          break;
        case "m":
        case "M":
          state.toggleMute();
          break;
        default:
          handled = false;
      }

      if (handled) e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    // Non-text inputs (checkbox, radio, range) don't consume letters.
    return !["checkbox", "radio", "range", "button", "submit", "reset", "file"].includes(target.type);
  }
  return false;
}

function isKeyboardFocusedControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const interactive = target.closest("button, a[href], [role='button'], input, [role='radio']");
  return interactive instanceof HTMLElement && interactive.matches(":focus-visible");
}
