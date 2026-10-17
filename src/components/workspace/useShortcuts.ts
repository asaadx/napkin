"use client";

import { useEffect, useRef } from "react";

/** True when a key press belongs to whatever the user is typing into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color"].includes(type);
  }
  return false;
}

type Handlers = {
  /** ⌘K / Ctrl+K. Works even while typing, like every command palette. */
  onPalette: () => void;
  /** Bare P: toggle the prompt card. */
  onTogglePrompt: () => void;
};

/**
 * Workspace shortcuts. Listens on window in the capture phase so it runs before
 * Excalidraw's own key handling, and swallows the keys it handles: Excalidraw
 * maps P to the pen (X still is) and ⌘K to "add link". Bare keys are ignored
 * while typing in a field or while a pointer is down (mid-stroke).
 */
export function useShortcuts(handlers: Handlers) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    let pointerDown = false;
    const down = () => (pointerDown = true);
    const up = () => (pointerDown = false);

    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.repeat) return;
      const key = e.key.toLowerCase();

      if (key === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        ref.current.onPalette();
        return;
      }

      if (key === "p" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (pointerDown || isTypingTarget(e.target)) return;
        // A modal (our drawer / palette, or an Excalidraw dialog) owns the keyboard.
        if (document.querySelector("[data-napkin-modal], .excalidraw .Modal")) return;
        e.preventDefault();
        e.stopPropagation();
        ref.current.onTogglePrompt();
      }
    };

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, []);
}
