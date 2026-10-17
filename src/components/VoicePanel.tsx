"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatElapsed, useSpeechTranscript } from "@/lib/voice";

const BARS = 5;

function LevelBars({ level }: { level: number }) {
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden>
      {Array.from({ length: BARS }, (_, i) => {
        const lit = level * BARS > i;
        return (
          <span
            key={i}
            className={`w-1 rounded-sm ${lit ? "bg-neutral-700 dark:bg-neutral-300" : "bg-neutral-200 dark:bg-neutral-700"}`}
            style={{ height: `${30 + (i * 70) / (BARS - 1)}%` }}
          />
        );
      })}
    </span>
  );
}

const PANEL = "flex h-56 shrink-0 flex-col border-t border-neutral-200 dark:border-neutral-800";
const noopSubscribe = () => () => {};

/**
 * Bottom panel under the canvas. The transcript hook reads the browser (speech
 * support, localStorage) on its first render, so it mounts after hydration;
 * the server renders an empty panel of the same size.
 */
export function VoicePanel({ slug }: { slug: string }) {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  if (!isClient) return <section aria-label="Voice transcript" className={PANEL} />;
  return <VoicePanelContent slug={slug} />;
}

function VoicePanelContent({ slug }: { slug: string }) {
  const { supported, status, error, start, stop, reset, segments, interim, elapsedMs, level } =
    useSpeechTranscript(slug);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const listening = status === "listening";
  const hasTranscript = segments.length > 0 || interim.length > 0;

  // Keep the newest words in view.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [segments, interim]);

  const btn =
    "rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

  return (
    <section aria-label="Voice transcript" className={PANEL}>
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-neutral-200 px-3 dark:border-neutral-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Transcript
        </h2>

        <button
          type="button"
          onClick={listening ? stop : start}
          disabled={!supported}
          aria-pressed={listening}
          className={btn}
        >
          {listening ? "Stop" : segments.length > 0 ? "Resume recording" : "Record"}
        </button>

        <span className="flex items-center gap-2 text-sm tabular-nums text-neutral-500">
          {listening && (
            <>
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
              <span className="sr-only">Recording</span>
            </>
          )}
          {(listening || elapsedMs > 0) && formatElapsed(elapsedMs)}
          {listening && level !== null && <LevelBars level={level} />}
        </span>

        <div className="ml-auto flex items-center gap-2 text-sm">
          {confirmingClear ? (
            <>
              <span className="text-neutral-500">Clear transcript?</span>
              <button
                type="button"
                className={btn}
                onClick={() => {
                  reset();
                  setConfirmingClear(false);
                }}
              >
                Clear
              </button>
              <button type="button" className={btn} onClick={() => setConfirmingClear(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className={btn}
              disabled={!hasTranscript && elapsedMs === 0}
              onClick={() => setConfirmingClear(true)}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="shrink-0 px-3 pt-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <div
        ref={scroller}
        aria-live="polite"
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-sm leading-relaxed"
      >
        {hasTranscript ? (
          <p>
            {segments.map((s, i) => (
              <span key={i}>
                <span className="mr-1 text-xs tabular-nums text-neutral-400">
                  {formatElapsed(s.startedAtMs)}
                </span>
                {s.text}{" "}
              </span>
            ))}
            {interim && <span className="text-neutral-400">{interim}</span>}
          </p>
        ) : (
          supported && (
            <p className="text-neutral-400">
              {listening
                ? "Listening… start talking through your design."
                : "Press Record and talk through your design. Your words appear here."}
            </p>
          )
        )}
      </div>
    </section>
  );
}
