"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * A fixed-size design surface scaled to fit its box. By default it fits both
 * width and height; with `byWidth` it fits width and sets its own height.
 */
export function Fit({
  w,
  h,
  max = 3,
  byWidth = false,
  children,
}: {
  w: number;
  h: number;
  max?: number;
  byWidth?: boolean;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = box.current;
    const stg = stage.current;
    if (!el || !stg) return;
    const measure = () => {
      const cw = el.clientWidth;
      if (!cw) return; // hidden (display: none) right now
      const s = Math.min(cw / w, byWidth ? Infinity : el.clientHeight / h, max);
      if (byWidth) el.style.height = `${Math.ceil(h * s)}px`;
      const ch = byWidth ? h * s : el.clientHeight;
      stg.style.transform = `translate(${(cw - w * s) / 2}px, ${(ch - h * s) / 2}px) scale(${s})`;
      el.dataset.ready = "";
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [w, h, max, byWidth]);

  return (
    <div ref={box} className={`fit${byWidth ? " fit-w" : ""}`}>
      <div ref={stage} className="stg" style={{ width: w, height: h }}>
        {children}
      </div>
    </div>
  );
}
