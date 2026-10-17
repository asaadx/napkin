"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  getRecognitionCtor,
  speechErrorMessage,
  UNSUPPORTED_MESSAGE,
  type SpeechRecognitionLike,
} from "./speech";
import { loadTranscript, saveTranscript, clearTranscript } from "./storage";
import {
  initialTranscript,
  transcriptReducer,
  type RecognitionResult,
  type Segment,
} from "./transcript";
import { useMicLevel } from "./useMicLevel";

export type SpeechStatus = "idle" | "listening" | "error";

export type SpeechTranscript = {
  /** False in browsers without the Web Speech API (e.g. Firefox). */
  supported: boolean;
  status: SpeechStatus;
  error: string | null;
  start: () => void;
  stop: () => void;
  /** Stops recording and deletes the transcript (including the saved copy). */
  reset: () => void;
  segments: Segment[];
  interim: string;
  /** Total recorded time across start/stop, persisted with the transcript. */
  elapsedMs: number;
  /** Mic level 0–1 while listening, or null if unavailable. */
  level: number | null;
};

const TICK_MS = 250;
/** Sessions that end this quickly with no speech count toward the restart-loop guard. */
const QUICK_END_MS = 1000;
const MAX_QUICK_RESTARTS = 5;

/**
 * Live transcript of the user talking, saved per prompt.
 *
 * Client-only: it reads localStorage and feature-detects during its first
 * render, so mount it after hydration (see VoiceDock) and key it by `slug`.
 */
export function useSpeechTranscript(slug: string): SpeechTranscript {
  const [supported] = useState(() => getRecognitionCtor() !== null);
  // Read once on mount; the caller remounts per prompt.
  const [saved] = useState(() =>
    typeof window === "undefined" ? { segments: [], elapsedMs: 0 } : loadTranscript(slug),
  );

  const [transcript, dispatch] = useReducer(transcriptReducer, saved, (s) =>
    transcriptReducer(initialTranscript, { type: "restore", segments: s.segments }),
  );
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(saved.elapsedMs);

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  /** The user wants to be recording (cleared by stop, reset and fatal errors). */
  const wanted = useRef(false);
  const sessionId = useRef(0);
  /** Recorded time before the current run, and when the current run began. */
  const baseMs = useRef(saved.elapsedMs);
  const runStartedAt = useRef<number | null>(null);
  const quickEnds = useRef(0);

  const now = () => performance.now();
  const currentElapsed = useCallback(
    () => baseMs.current + (runStartedAt.current === null ? 0 : now() - runStartedAt.current),
    [],
  );

  // Persist finalized segments (not interim text) when they change, and the
  // clock when recording stops.
  const { segments } = transcript;
  useEffect(() => {
    // Right after a reset (which already cleared storage).
    if (segments === initialTranscript.segments) return;
    if (segments.length === 0 && baseMs.current === 0) return;
    saveTranscript(slug, { segments, elapsedMs: Math.round(currentElapsed()) });
  }, [slug, segments, status, currentElapsed]);

  /** Ends the current run's clock and folds it into the base. */
  const pauseClock = useCallback(() => {
    if (runStartedAt.current === null) return;
    baseMs.current += now() - runStartedAt.current;
    runStartedAt.current = null;
    setElapsedMs(baseMs.current);
  }, []);

  const detach = (rec: SpeechRecognitionLike | null) => {
    if (!rec) return;
    rec.onstart = rec.onend = rec.onresult = rec.onerror = null;
  };

  const startSessionRef = useRef<() => void>(() => {});
  const startSession = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const id = ++sessionId.current;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = navigator.language || "en-US";
    let startedAt = 0;
    let heardSomething = false;

    rec.onstart = () => {
      startedAt = now();
      dispatch({ type: "sessionStart", sessionId: id });
    };
    rec.onresult = (event) => {
      heardSomething = true;
      quickEnds.current = 0;
      const results: RecognitionResult[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        results.push({ transcript: r[0]?.transcript ?? "", isFinal: r.isFinal });
      }
      dispatch({ type: "result", sessionId: id, results, atMs: Math.round(currentElapsed()) });
    };
    rec.onerror = (event) => {
      const message = speechErrorMessage(event.error);
      if (!message) return; // e.g. no-speech: onend follows and we restart.
      wanted.current = false;
      setError(message);
      setStatus("error");
      pauseClock();
    };
    rec.onend = () => {
      dispatch({ type: "sessionEnd", sessionId: id, atMs: Math.round(currentElapsed()) });
      if (recognition.current === rec) recognition.current = null;
      detach(rec);
      // Only the latest session may restart (an older one can still be winding
      // down after a quick stop/start).
      if (!wanted.current || id !== sessionId.current) return;

      if (!heardSomething && now() - startedAt < QUICK_END_MS) quickEnds.current++;
      if (quickEnds.current > MAX_QUICK_RESTARTS) {
        wanted.current = false;
        setError("Speech recognition keeps stopping on its own. Try again in a moment.");
        setStatus("error");
        pauseClock();
        return;
      }
      // Chrome ended on its own (silence or ~60s cap): keep going.
      startSessionRef.current();
    };

    recognition.current = rec;
    try {
      rec.start();
    } catch {
      // start() throws if called while a previous instance is still shutting down.
      detach(rec);
      recognition.current = null;
      setTimeout(() => {
        if (wanted.current && !recognition.current) startSessionRef.current();
      }, 300);
    }
  }, [currentElapsed, pauseClock]);
  useEffect(() => {
    startSessionRef.current = startSession;
  }, [startSession]);

  const start = useCallback(() => {
    if (wanted.current) return;
    if (!getRecognitionCtor()) {
      setError(UNSUPPORTED_MESSAGE);
      setStatus("error");
      return;
    }
    wanted.current = true;
    quickEnds.current = 0;
    setError(null);
    setStatus("listening");
    runStartedAt.current = now();
    startSession();
  }, [startSession]);

  const stop = useCallback(() => {
    wanted.current = false;
    // stop() (unlike abort()) lets pending words finalize; onend commits them.
    recognition.current?.stop();
    setStatus("idle");
    pauseClock();
  }, [pauseClock]);

  const reset = useCallback(() => {
    wanted.current = false;
    sessionId.current++; // Ignore anything a dying session still delivers.
    const rec = recognition.current;
    recognition.current = null;
    detach(rec);
    rec?.abort();
    baseMs.current = 0;
    runStartedAt.current = null;
    dispatch({ type: "reset" });
    setElapsedMs(0);
    setStatus("idle");
    setError(null);
    clearTranscript(slug);
  }, [slug]);

  // Tick the visible clock while listening.
  useEffect(() => {
    if (status !== "listening") return;
    const timer = setInterval(() => setElapsedMs(currentElapsed()), TICK_MS);
    return () => clearInterval(timer);
  }, [status, currentElapsed]);

  // Stop the mic when leaving the page.
  useEffect(
    () => () => {
      wanted.current = false;
      const rec = recognition.current;
      recognition.current = null;
      detach(rec);
      rec?.abort();
    },
    [],
  );

  const level = useMicLevel(status === "listening");

  return {
    supported,
    status,
    error: supported ? error : UNSUPPORTED_MESSAGE,
    start,
    stop,
    reset,
    segments: transcript.segments,
    interim: transcript.interim,
    elapsedMs,
    level,
  };
}
