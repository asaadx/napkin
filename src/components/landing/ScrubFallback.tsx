"use client";

import { useEffect } from "react";
import { clamp } from "./anim";

const local = (p: number, a: number, b: number) => clamp((p - a) / (b - a || 1));

/**
 * Scroll-scrub fallback for browsers without CSS scroll timelines. It parks every
 * pinned animation in a paused state and moves it with scroll position (rAF-throttled).
 * Where `animation-timeline: view()` is supported this does nothing, unless the page is
 * opened with `?fb` to force it. Reduced motion and phones never show the pinned story.
 */
export function ScrubFallback() {
  useEffect(() => {
    const forced = new URLSearchParams(location.search).has("fb");
    const native = CSS.supports("animation-timeline: view()") && !forced;
    if (native) return;

    const desk = document.querySelector<HTMLElement>(".landing .desk[data-track]");
    if (!desk) return;
    const pinned = window.matchMedia("(min-width: 861px) and (prefers-reduced-motion: no-preference)");
    const els = Array.from(desk.querySelectorAll<HTMLElement>("[data-k]")).map((el) => ({
      el,
      kf: el.dataset.k!,
      a: +el.dataset.a!,
      b: +el.dataset.b!,
    }));
    // Drop any native timeline animation first so each element restarts on the document timeline.
    for (const { el } of els) el.style.animationName = "none";
    void desk.offsetWidth;
    for (const { el, kf } of els) {
      el.style.animation = `${kf} 1s linear both paused`;
      el.style.setProperty("animation-timeline", "auto");
      el.style.setProperty("animation-range", "normal");
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      if (!pinned.matches) return;
      const r = desk.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, r.height - innerHeight));
      for (const { el, a, b } of els) el.style.animationDelay = `${-local(p, a, b) * 0.9999}s`;
    };
    const req = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    addEventListener("scroll", req, { passive: true });
    addEventListener("resize", req);
    update();
    return () => {
      removeEventListener("scroll", req);
      removeEventListener("resize", req);
      if (raf) cancelAnimationFrame(raf);
      for (const { el } of els) {
        el.style.animation = "";
        el.style.animationDelay = "";
        el.style.removeProperty("animation-timeline");
        el.style.removeProperty("animation-range");
      }
    };
  }, []);
  return null;
}
