"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatElapsed, useMicAnalyser, useSpeechTranscript, UNSUPPORTED_MESSAGE } from "@/lib/voice";
import { LiveWaveform } from "./LiveWaveform";
import "./voice-dock.css";

const noopSubscribe = () => () => {};

/** Expanded pill width (keep in sync with .vd-dock[data-rec] .vd-pill in voice-dock.css). */
const EXPANDED_W = 212;
/** Minimum gap between the expanded pill and the container edges (or Excalidraw's mobile bar). */
const EDGE = 12;

/**
 * Floating record button for the canvas. Idle it's a round mic button; while
 * recording it widens into a pill with a live waveform, the elapsed time and
 * a stop button. The transcript is recorded and saved in the background (the
 * grader reads it); nothing of it is shown here.
 *
 * The transcript hook reads the browser (speech support, localStorage) on its
 * first render, so the dock mounts after hydration and the server renders
 * nothing.
 */
export function VoiceDock({ slug }: { slug: string }) {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  if (!isClient) return null;
  // Keyed so switching prompts starts a fresh transcript session.
  return <VoiceDockContent key={slug} slug={slug} />;
}

/** True when a keypress belongs to text entry (ours, the app's or Excalidraw's). */
function isTyping(target: EventTarget | null): boolean {
  if (target instanceof HTMLElement) {
    if (target.isContentEditable) return true;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return true;
  }
  // Excalidraw's text editor is a textarea, but check for it directly too.
  return !!document.querySelector(".excalidraw-wysiwyg");
}

/**
 * Centers the dock on the viewport (so it lines up with the top bar's centered
 * Submit) while it sits inside the canvas container, which is offset by the
 * side card. It only clamps when the container is too narrow for the expanded
 * pill to stay centered without sliding under the side card. Excalidraw's
 * desktop controls sit on the right edge, so the bottom edge is free; its
 * compact (mobile) layout has a full-width bottom bar, so there the dock rises
 * above it. Writes `left`/`bottom`/`data-covered` directly; no re-render.
 */
function useViewportCentered(ref: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const update = () => {
      const r = parent.getBoundingClientRect();
      const half = EXPANDED_W / 2;
      const want = window.innerWidth / 2 - r.left;
      const x =
        r.width < EXPANDED_W + 2 * EDGE
          ? r.width / 2
          : Math.min(Math.max(want, EDGE + half), r.width - EDGE - half);
      el.style.left = `${Math.round(x)}px`;
      const bar = parent.querySelector(".excalidraw--mobile .App-bottom-bar .App-toolbar")?.getBoundingClientRect();
      el.style.bottom = bar && bar.height ? `${Math.round(r.bottom - bar.top + EDGE)}px` : "";
      // There, the ☰ menu and style panel open upward from that bar, over the
      // dock's spot; step aside while one is open.
      const panel = parent.querySelector(".excalidraw--mobile :is(.dropdown-menu, .App-mobile-menu)");
      el.toggleAttribute("data-covered", !!panel?.getBoundingClientRect().height);
    };
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    const ro = new ResizeObserver(schedule);
    ro.observe(parent);
    // Excalidraw loads (and swaps desktop/compact UI) after we mount.
    const mo = new MutationObserver(schedule);
    mo.observe(parent, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [ref]);
}

function VoiceDockContent({ slug }: { slug: string }) {
  const { supported, status, error, start, stop, elapsedMs } = useSpeechTranscript(slug);
  const listening = status === "listening";
  const analyser = useMicAnalyser(listening);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  /** Unsupported browsers: the note shows on hover/focus, or briefly after a press. */
  const [tipPinned, setTipPinned] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  useViewportCentered(dockRef);

  const alertMessage = supported && error && error !== dismissedError ? error : null;

  const toggleRecording = useCallback(() => {
    if (!supported) {
      setTipPinned(true);
      return;
    }
    if (listening) stop();
    else {
      setDismissedError(null);
      start();
    }
  }, [supported, listening, start, stop]);

  useEffect(() => {
    if (!tipPinned) return;
    const t = setTimeout(() => setTipPinned(false), 4000);
    return () => clearTimeout(t);
  }, [tipPinned]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.metaKey || e.ctrlKey || isTyping(e.target)) return;
      if (e.key.toLowerCase() !== "m") return;
      e.preventDefault();
      e.stopPropagation();
      toggleRecording();
    };
    // Capture phase on window: runs before Excalidraw's own key handling.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [toggleRecording]);

  return (
    <div
      ref={dockRef}
      className="vd-dock absolute bottom-4 left-1/2 z-20 -translate-x-1/2 text-sm text-fg"
      data-rec={listening ? "" : undefined}
      data-tip={tipPinned ? "" : undefined}
    >
      <span className="sr-only" aria-live="polite">
        {listening ? "Recording" : ""}
      </span>

      {alertMessage && (
        <div
          role="alert"
          className="vd-bubble absolute bottom-[calc(100%+10px)] left-1/2 flex w-[240px] -translate-x-1/2 items-start gap-2 rounded-xl bg-panel py-2 pr-1.5 pl-3 text-[12.5px] leading-snug text-fg-2 shadow-float"
        >
          <span className="mt-1.5 size-1.5 flex-none rounded-full bg-rec" aria-hidden />
          <p className="min-w-0 flex-1">{alertMessage}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissedError(alertMessage)}
            className="vd-press grid size-6 flex-none place-items-center rounded-full text-fg-3 hover:bg-panel-2 hover:text-fg"
          >
            <Icon d="M18 6 6 18M6 6l12 12" size={14} />
          </button>
        </div>
      )}

      {!supported && (
        <p
          id="vd-unsupported"
          role="note"
          className="vd-tip pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 w-[240px] -translate-x-1/2 rounded-xl bg-panel px-3 py-2 text-[12.5px] leading-snug text-fg-2 shadow-float"
        >
          {UNSUPPORTED_MESSAGE}
        </p>
      )}

      <div className="vd-pill relative h-11 rounded-full bg-panel shadow-float">
        <button
          type="button"
          onClick={toggleRecording}
          aria-disabled={!supported || undefined}
          aria-describedby={supported ? undefined : "vd-unsupported"}
          aria-pressed={listening}
          aria-label={
            supported ? `${listening ? "Stop recording" : "Record your explanation"} (M)` : "Voice unavailable"
          }
          title={supported ? `${listening ? "Stop" : "Record"} (M)` : undefined}
          aria-keyshortcuts="M"
          className={`vd-press vd-mic absolute top-1 left-1 grid size-9 place-items-center rounded-full ${
            !supported
              ? "cursor-not-allowed bg-panel-2 text-fg-3"
              : listening
                ? "bg-rec text-white"
                : "bg-fg text-panel hover:opacity-90"
          }`}
        >
          <span
            aria-hidden
            className="vd-ring pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_2px_var(--color-rec)]"
          />
          {supported ? (
            <>
              <MicIcon className="vd-icon vd-icon-mic" />
              <svg aria-hidden width={15} height={15} viewBox="0 0 24 24" className="vd-icon vd-icon-stop">
                <rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor" />
              </svg>
            </>
          ) : (
            <Icon
              d="M2 2l20 20M18.89 13.23A7 7 0 0 0 19 12v-2M5 10v2a7 7 0 0 0 12 5M15 9.34V5a3 3 0 0 0-5.68-1.33M9 9v3a3 3 0 0 0 5.12 2.12M12 19v3"
              size={17}
            />
          )}
        </button>

        <div
          aria-hidden={!listening}
          className="vd-meter absolute inset-y-0 right-3 left-12 flex items-center gap-2.5"
        >
          <LiveWaveform analyser={analyser} active={listening} className="h-6 min-w-0 flex-1 text-fg" />
          <span className="font-mono text-[13px] text-fg tabular-nums" aria-label={`Recorded ${formatElapsed(elapsedMs)}`}>
            {formatElapsed(elapsedMs)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Icon({ d, size = 16, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`block flex-none ${className ?? ""}`}
    >
      <path d={d} />
    </svg>
  );
}

function MicIcon({ className, size = 17 }: { className?: string; size?: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`block flex-none ${className ?? ""}`}
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
    </svg>
  );
}
