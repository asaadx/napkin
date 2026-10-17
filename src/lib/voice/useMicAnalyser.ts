"use client";

import { useEffect, useState } from "react";

/**
 * A live AnalyserNode on the microphone while `active`, for drawing a
 * waveform. Consumers read it on their own animation frame (no React state per
 * frame). Returns null when inactive or when the mic can't be opened; speech
 * recognition reports its own mic errors. The stream and audio context are
 * released when `active` turns false and on unmount.
 */
export function useMicAnalyser(active: boolean): AnalyserNode | null {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const AudioCtx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        ctx = new AudioCtx();
        const node = ctx.createAnalyser();
        node.fftSize = 256;
        node.smoothingTimeConstant = 0.8;
        ctx.createMediaStreamSource(stream).connect(node);
        setAnalyser(node);
      } catch {
        // Permission denied or no device; the waveform stays flat.
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
      setAnalyser(null);
    };
  }, [active]);

  return analyser;
}
