"use client";

/*
 * Adapted from ElevenLabs UI "Live Waveform" (static mode)
 * https://github.com/elevenlabs/ui — components/ui/live-waveform.tsx
 * Copyright (c) ElevenLabs. MIT License.
 *
 * Changes: takes an AnalyserNode from useMicAnalyser instead of opening its own
 * stream; a noise floor so silence is a flat line; center-weighted fade instead
 * of an edge gradient; trimmed the processing/scrolling modes.
 */

import { useEffect, useRef } from "react";

const BAR_W = 2;
const GAP = 1.5;
const STEP = BAR_W + GAP;
const MIN_H = 2;
/** ~33 updates/s; the analyser's own smoothing fills the gaps. */
const UPDATE_MS = 30;
/** Frequency bins below this (0–1) count as silence. */
const FLOOR = 0.14;
const SENSITIVITY = 1.7;

/**
 * Mirrored frequency bars of the live mic, drawn on a canvas from a
 * requestAnimationFrame loop (no React renders per frame). Low frequencies sit
 * in the middle; louder speech lifts and spreads the bars, silence is a flat
 * line. Bar color is the canvas's CSS `color`.
 */
export function LiveWaveform({
  analyser,
  active,
  className,
}: {
  analyser: AnalyserNode | null;
  active: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let raf = 0;
    let last = -Infinity;
    let color = "";
    let colorAt = -Infinity;

    const draw = (now: number) => {
      if (active) raf = requestAnimationFrame(draw);
      if (active && now - last < UPDATE_MS) return;
      last = now;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      // Re-read the color now and then so a theme switch mid-recording follows.
      if (now - colorAt > 500) {
        color = getComputedStyle(canvas).color;
        colorAt = now;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;

      if (active && data && analyser) analyser.getByteFrequencyData(data);
      // Speech lives in the lower part of the spectrum.
      const lo = data ? Math.floor(data.length * 0.05) : 0;
      const span = data ? Math.floor(data.length * 0.4) - lo : 0;

      const count = Math.floor((w + GAP) / STEP);
      const half = count / 2;
      const offset = (w - (count * STEP - GAP)) / 2;
      for (let i = 0; i < count; i++) {
        // Distance from the center, 0..1; both halves read the same bins.
        const k = Math.abs(i + 0.5 - half) / half;
        let v = 0;
        if (active && data && span > 0) {
          const raw = data[lo + Math.min(span - 1, Math.floor(k * span))] / 255;
          v = Math.min(1, (Math.max(0, raw - FLOOR) / (1 - FLOOR)) * SENSITIVITY);
        }
        const bh = Math.max(MIN_H, v * h);
        ctx.globalAlpha = (0.35 + 0.65 * v) * (1 - 0.55 * k * k);
        ctx.beginPath();
        ctx.roundRect(offset + i * STEP, (h - bh) / 2, BAR_W, bh, BAR_W / 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, active]);

  return <canvas ref={canvasRef} aria-hidden className={`block ${className ?? ""}`} />;
}
