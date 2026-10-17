"use client";

import { useEffect, useState } from "react";

/** How often the level is pushed to React state (the analyser runs every frame). */
const UPDATE_MS = 50;

/**
 * Live microphone level (0–1) while `active`, for a simple meter. Returns null
 * when inactive or when the mic can't be opened (the transcript still works;
 * speech recognition reports its own mic errors). The stream and audio context
 * are released when `active` turns false and on unmount.
 */
export function useMicLevel(active: boolean): number | null {
  const [level, setLevel] = useState<number | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let frame = 0;
    let lastUpdate = 0;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return;
        const AudioCtx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);

        const tick = (now: number) => {
          if (cancelled) return;
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += v * v;
          const rms = Math.sqrt(sum / buf.length);
          if (now - lastUpdate >= UPDATE_MS) {
            lastUpdate = now;
            // Speech RMS sits around 0.01–0.2; scale so normal talking fills the meter.
            setLevel(Math.min(1, rms * 6));
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch {
        // Permission denied or no device; the meter just stays hidden.
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
      setLevel(null);
    };
  }, [active]);

  return level;
}
