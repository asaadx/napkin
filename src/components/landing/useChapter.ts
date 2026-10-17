"use client";

import { useSyncExternalStore } from "react";
import { SC } from "./anim";

const CHAPTERS = 4;

/** Pinned-track progress (0..1) for the current scroll position, or 0 when the track is hidden. */
export function trackProgress(track: Element | null): number {
  if (!track) return 0;
  const r = track.getBoundingClientRect();
  return Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
}

/** Scroll position (page y) that lands mid-way into chapter `i`. */
export function chapterScrollTop(track: Element, i: number): number {
  const r = track.getBoundingClientRect();
  const p = (i / CHAPTERS + 0.1) * SC;
  return scrollY + r.top + p * Math.max(0, r.height - innerHeight);
}

function read(): number {
  const p = trackProgress(document.querySelector(".landing .pf-track"));
  return Math.min(CHAPTERS - 1, Math.floor(p / (SC / CHAPTERS)));
}

function subscribe(cb: () => void) {
  let raf = 0;
  const on = () => {
    if (!raf) raf = requestAnimationFrame(() => ((raf = 0), cb()));
  };
  addEventListener("scroll", on, { passive: true });
  addEventListener("resize", on);
  return () => {
    removeEventListener("scroll", on);
    removeEventListener("resize", on);
    if (raf) cancelAnimationFrame(raf);
  };
}

/** Index (0..3) of the chapter the pinned story is currently in. Re-renders only when it changes. */
export function useChapter(): number {
  return useSyncExternalStore(subscribe, read, () => 0);
}
