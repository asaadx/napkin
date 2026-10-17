"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatElapsed, useSpeechTranscript, UNSUPPORTED_MESSAGE, type Segment } from "@/lib/voice";
import "./voice-dock.css";

const noopSubscribe = () => () => {};

/**
 * Floating voice dock, centered at the bottom of its (relative) canvas
 * container. The transcript hook reads the browser (speech support,
 * localStorage) on its first render, so the dock mounts after hydration and
 * the server renders nothing.
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

const CAPTION_CHARS = 68;

function VoiceDockContent({ slug }: { slug: string }) {
  const { supported, status, error, start, stop, reset, segments, interim, elapsedMs, level } =
    useSpeechTranscript(slug);
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const listening = status === "listening";
  const hasTranscript = segments.length > 0 || interim.length > 0;
  // Unsupported is shown in the pill itself; other errors float above it.
  const alertMessage =
    supported && error && error !== dismissedError && error !== UNSUPPORTED_MESSAGE ? error : null;

  const toggleRecording = useCallback(() => {
    if (!supported) return;
    if (listening) stop();
    else {
      setDismissedError(null);
      start();
    }
  }, [supported, listening, start, stop]);

  /** Keyboard toggles skip the animation (they're repeated often). */
  const setOpenInstant = useCallback((next: boolean | ((o: boolean) => boolean)) => {
    setInstant(true);
    setOpen(next);
    requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.metaKey || e.ctrlKey || isTyping(e.target)) return;
      if (e.key === "Escape") {
        if (!open) return;
        if (confirmingClear) setConfirmingClear(false);
        else {
          if (panelRef.current?.contains(document.activeElement)) toggleRef.current?.focus();
          setOpenInstant(false);
        }
        return;
      }
      const key = e.key.toLowerCase();
      if (key !== "m" && key !== "t") return;
      // Claim the key before Excalidraw sees it (T is its text-tool shortcut;
      // the text tool stays on 8 and in the toolbar).
      e.preventDefault();
      e.stopPropagation();
      if (key === "m") toggleRecording();
      else setOpenInstant((o) => !o);
    };
    // Capture phase on window runs before Excalidraw's own key handling.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, confirmingClear, toggleRecording, setOpenInstant]);

  const lastText = interim || segments.at(-1)?.text || "";
  const caption =
    lastText.length > CAPTION_CHARS ? "…" + lastText.slice(-(CAPTION_CHARS - 2)) : lastText;

  return (
    <div
      className={`vd-dock absolute bottom-4 left-1/2 z-20 -translate-x-1/2 text-sm text-fg`}
      data-rec={listening ? "" : undefined}
      data-open={open ? "" : undefined}
      data-cap={caption ? "" : undefined}
      data-instant={instant ? "" : undefined}
    >
      {/* Live caption (collapsed + recording). Screen readers get the panel's live region. */}
      <div
        aria-hidden
        className={`vd-caption pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 w-max max-w-[min(520px,calc(100vw-24px))] -translate-x-1/2 truncate rounded-full bg-panel/90 px-3.5 py-1.5 text-[13px] text-fg-2 shadow-[0_0_0_1px_var(--color-line)] backdrop-blur-md`}
      >
        {caption}
      </div>

      {alertMessage && !open && (
        <div
          role="alert"
          className={`vd-alert absolute bottom-[calc(100%+10px)] left-1/2 flex w-[min(360px,calc(100vw-24px))] -translate-x-1/2 items-start gap-2 rounded-xl bg-panel py-2 pr-1.5 pl-3 text-[13px] leading-snug text-fg-2 shadow-float`}
        >
          <span className="mt-1.5 size-1.5 flex-none rounded-full bg-rec" aria-hidden />
          <p className="min-w-0 flex-1">{alertMessage}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissedError(alertMessage)}
            className={`vd-press grid size-6 flex-none place-items-center rounded-full text-fg-3 hover:bg-panel-2 hover:text-fg`}
          >
            <Icon d="M18 6 6 18M6 6l12 12" size={14} />
          </button>
        </div>
      )}

      <TranscriptPanel
        ref={panelRef}
        segments={segments}
        interim={interim}
        elapsedMs={elapsedMs}
        listening={listening}
        open={open}
        supported={supported}
        error={error}
        confirmingClear={confirmingClear}
        setConfirmingClear={setConfirmingClear}
        onClear={() => {
          reset();
          setConfirmingClear(false);
        }}
        onCollapse={() => {
          toggleRef.current?.focus();
          setOpen(false);
        }}
        canClear={hasTranscript || elapsedMs > 0}
      />

      <div
        className={`vd-pill relative flex h-12 items-center gap-2.5 rounded-full bg-panel px-1.5 shadow-float`}
      >
        <button
          type="button"
          onClick={toggleRecording}
          disabled={!supported}
          aria-pressed={listening}
          aria-label={`${listening ? "Stop recording" : "Start recording"} (M)`}
          title={supported ? `${listening ? "Stop" : "Record"} (M)` : UNSUPPORTED_MESSAGE}
          aria-keyshortcuts="M"
          className={`vd-press relative grid size-9 flex-none place-items-center rounded-full disabled:cursor-not-allowed disabled:bg-panel-2 disabled:text-fg-3 ${
            listening ? "bg-rec text-white" : "bg-fg text-panel hover:opacity-90"
          }`}
        >
          <span
            aria-hidden
            className={`vd-ring pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_2px_var(--color-rec)]`}
          />
          {supported ? (
            <>
              <MicIcon className={`vd-mic-icon vd-icon-mic`} />
              <svg
                aria-hidden
                width={17}
                height={17}
                viewBox="0 0 24 24"
                className={`vd-mic-icon vd-icon-stop`}
              >
                <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
              </svg>
            </>
          ) : (
            <Icon
              d="M2 2l20 20M18.89 13.23A7 7 0 0 0 19 12v-2M5 10v2a7 7 0 0 0 12 5M15 9.34V5a3 3 0 0 0-5.68-1.33M9 9v3a3 3 0 0 0 5.12 2.12M12 19v3"
              size={17}
            />
          )}
        </button>

        <div className="relative h-7 w-[120px] flex-none">
          <span
            className={`vd-slot-label absolute inset-0 flex items-center truncate font-medium ${supported ? "" : "text-fg-3"}`}
            title={supported ? undefined : UNSUPPORTED_MESSAGE}
          >
            {!supported ? "Voice unavailable" : segments.length > 0 ? "Resume" : "Record"}
          </span>
          {supported && <Waveform level={level} active={listening} className="vd-wave" />}
        </div>

        <span
          className={`min-w-[42px] font-mono text-[13px] tabular-nums transition-colors ${listening ? "text-fg" : "text-fg-3"}`}
          aria-label={`Recorded ${formatElapsed(elapsedMs)}`}
        >
          {formatElapsed(elapsedMs)}
        </span>

        <span className="h-5 w-px flex-none bg-line" aria-hidden />

        <button
          ref={toggleRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="voice-dock-panel"
          aria-label={`Transcript, ${segments.length} ${segments.length === 1 ? "line" : "lines"} (T)`}
          aria-keyshortcuts="T"
          title="Transcript (T)"
          className={`vd-press inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 font-mono text-[12.5px] tabular-nums hover:bg-panel-2 hover:text-fg ${
            open ? "bg-panel-2 text-fg" : "text-fg-2"
          }`}
        >
          <Icon d="M4 6h16M4 10h16M4 14h10M4 18h7" size={15} />
          <span>{segments.length}</span>
          <Icon d="m18 15-6-6-6 6" size={14} className="vd-chev" />
        </button>
      </div>
    </div>
  );
}

type PanelProps = {
  ref: React.Ref<HTMLElement>;
  segments: Segment[];
  interim: string;
  elapsedMs: number;
  listening: boolean;
  open: boolean;
  supported: boolean;
  error: string | null;
  confirmingClear: boolean;
  setConfirmingClear: (v: boolean) => void;
  onClear: () => void;
  onCollapse: () => void;
  canClear: boolean;
};

function TranscriptPanel({
  ref,
  segments,
  interim,
  elapsedMs,
  listening,
  open,
  supported,
  error,
  confirmingClear,
  setConfirmingClear,
  onClear,
  onCollapse,
  canClear,
}: PanelProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [copied, setCopied] = useState(false);
  const hasTranscript = segments.length > 0 || interim.length > 0;

  // Follow new words unless the reader scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [segments, interim]);

  // Opening always lands on the newest line.
  useEffect(() => {
    const el = scroller.current;
    if (open && el) {
      stick.current = true;
      el.scrollTop = el.scrollHeight;
    }
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = () => {
    const text = segments.map((x) => `[${formatElapsed(x.startedAtMs)}] ${x.text}`).join("\n");
    void navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => {},
    );
  };

  const iconBtn = `vd-press grid size-8 flex-none place-items-center rounded-full text-fg-2 hover:bg-panel-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40`;
  const textBtn = `vd-press h-7 rounded-full px-2.5 text-[12.5px] font-medium`;

  return (
    <section
      ref={ref}
      id="voice-dock-panel"
      aria-label="Transcript"
      inert={!open}
      className={`vd-panel absolute bottom-[calc(100%+8px)] left-1/2 flex max-h-[min(340px,46dvh)] w-[min(460px,calc(100vw-24px))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-panel shadow-float`}
    >
      <header className="flex h-11 flex-none items-center gap-1 border-b border-line pr-1.5 pl-4">
        {confirmingClear ? (
          <>
            <span className="flex-1 font-medium">Clear transcript?</span>
            <button
              type="button"
              autoFocus
              onClick={() => setConfirmingClear(false)}
              className={`${textBtn} text-fg-2 hover:bg-panel-2 hover:text-fg`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onClear}
              className={`${textBtn} bg-rec-soft text-rec hover:bg-rec hover:text-white`}
            >
              Clear
            </button>
          </>
        ) : (
          <>
            <h2 className="flex flex-1 items-center gap-2.5 font-semibold">
              Transcript
              {(listening || segments.length > 0) && (
                <span className="inline-flex items-center gap-1.5 font-mono text-[12.5px] font-normal text-fg-3">
                  {listening && (
                    <i className={`vd-live-dot size-[7px] rounded-full bg-rec`} aria-hidden />
                  )}
                  {listening ? "live" : "paused"}
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={copy}
              disabled={segments.length === 0}
              aria-label={copied ? "Copied" : "Copy transcript"}
              title="Copy transcript"
              className={iconBtn}
            >
              {copied ? (
                <Icon d="M20 6 9 17l-5-5" size={15} className="text-accent" />
              ) : (
                <Icon
                  d="M8 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1zM16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"
                  size={15}
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingClear(true)}
              disabled={!canClear}
              aria-label="Clear transcript"
              title="Clear transcript"
              className={iconBtn}
            >
              <Icon
                d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"
                size={15}
              />
            </button>
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse transcript (T)"
              title="Collapse (T)"
              className={iconBtn}
            >
              <Icon d="m6 9 6 6 6-6" size={16} />
            </button>
          </>
        )}
      </header>

      {error && (
        <p
          role={supported ? undefined : "note"}
          className={`flex-none border-b border-line px-4 py-2 text-[13px] leading-snug ${
            supported ? "bg-rec-soft text-rec" : "bg-panel-2 text-fg-2"
          }`}
        >
          {error}
        </p>
      )}

      <div
        ref={scroller}
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2.5 pb-3.5 leading-relaxed"
      >
        {hasTranscript ? (
          <>
            {segments.map((seg, i) => (
              <div key={i} className="grid grid-cols-[42px_1fr] gap-2.5 py-1">
                <span className="pt-px font-mono text-xs text-fg-3 tabular-nums">
                  {formatElapsed(seg.startedAtMs)}
                </span>
                <p>{seg.text}</p>
              </div>
            ))}
            {interim && (
              <div className="grid grid-cols-[42px_1fr] gap-2.5 py-1">
                <span className="pt-px font-mono text-xs text-fg-3 tabular-nums">
                  {formatElapsed(elapsedMs)}
                </span>
                <p className="text-fg-3">
                  {interim}
                  <span
                    aria-hidden
                    className={`vd-caret ml-0.5 inline-block h-[1em] w-0.5 bg-accent align-[-2px]`}
                  />
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="grid justify-items-center gap-2 px-4 py-8 text-center text-fg-2">
            <MicIcon className="text-fg-3" size={22} />
            {supported ? (
              <p>
                {listening
                  ? "Listening. Start talking through your design."
                  : "Press the mic and explain your design out loud."}
                <br />
                <span className="text-fg-3">
                  <Kbd>M</Kbd> record · <Kbd>T</Kbd> transcript
                </span>
              </p>
            ) : (
              <p className="text-fg-3">Your words would appear here.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Rolling bar waveform of the real mic level (from useMicLevel via the hook). */
function Waveform({
  level,
  active,
  className,
}: {
  level: number | null;
  active: boolean;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const history = useRef<number[]>(new Array(48).fill(0));

  useEffect(() => {
    const h = history.current;
    if (!active) h.fill(0);
    else {
      h.push(level ?? 0);
      h.shift();
    }
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const ht = c.clientHeight;
    if (!w || !ht) return;
    if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
    if (c.height !== Math.round(ht * dpr)) c.height = Math.round(ht * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, ht);
    ctx.fillStyle = getComputedStyle(c).color;
    const step = 4;
    const n = Math.min(h.length, Math.floor(w / step));
    for (let i = 0; i < n; i++) {
      const a = h[h.length - n + i];
      // Lift quiet speech so normal talking reads clearly.
      const bh = Math.max(2, Math.min(1, Math.sqrt(a)) * ht);
      ctx.globalAlpha = 0.2 + 0.8 * Math.pow(i / n, 1.4);
      ctx.beginPath();
      ctx.roundRect(i * step, (ht - bh) / 2, 2, bh, 1);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [level, active]);

  return (
    <canvas ref={canvas} aria-hidden className={`${className} absolute inset-0 size-full text-fg`} />
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[5px] px-1 font-mono text-[11px] text-fg-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
      {children}
    </kbd>
  );
}
