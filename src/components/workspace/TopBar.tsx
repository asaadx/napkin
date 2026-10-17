"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Wordmark } from "@/components/Wordmark";
import { useTheme } from "@/components/theme/useTheme";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  ListIcon,
  Loader,
  Moon,
  Search,
  Shuffle,
  Sun,
  Upload,
} from "./icons";

const ICON_BTN =
  "press inline-grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-35";

function fmt(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Elapsed count-up from when the problem opened. Click to pause / resume. */
function Timer() {
  const [acc, setAcc] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const t0 = Date.now();
    // Start on mount (client only), so SSR and hydration both show 00:00.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStartedAt(t0);
    setNow(t0);
  }, []);

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const running = startedAt !== null;
  const elapsed = acc + (running ? (now - startedAt) / 1000 : 0);

  const toggle = () => {
    const t = Date.now();
    if (running) {
      setAcc((a) => a + (t - startedAt) / 1000);
      setStartedAt(null);
    } else {
      setStartedAt(t);
      setNow(t);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={running ? "Pause timer" : "Resume timer"}
      title={running ? "Pause timer" : "Resume timer"}
      className={`press inline-flex h-8 items-center gap-1.5 rounded-lg px-2 font-mono text-[13px] tabular-nums hover:bg-hover hover:text-fg max-sm:hidden ${
        running ? "text-fg-2" : "text-fg-3"
      }`}
    >
      <span className={running ? "text-accent" : ""}>
        <Clock size={15} />
      </span>
      <span>{fmt(elapsed)}</span>
    </button>
  );
}

const noopSubscribe = () => () => {};

/** "⌘K" on Apple platforms, "Ctrl K" elsewhere (server renders the Mac label). */
function usePaletteHint() {
  return useSyncExternalStore(
    noopSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl K"),
    () => "⌘K",
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`${next === "dark" ? "Dark" : "Light"} theme`}
      className={ICON_BTN}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}

export function TopBar({
  index,
  total,
  grading,
  onProblems,
  onPrev,
  onNext,
  onShuffle,
  onPalette,
  onSubmit,
}: {
  index: number;
  total: number;
  grading: boolean;
  onProblems: () => void;
  onPrev: () => void;
  onNext: () => void;
  onShuffle: () => void;
  onPalette: () => void;
  onSubmit: () => void;
}) {
  const paletteHint = usePaletteHint();
  return (
    <header className="flex h-[54px] shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-[18px] max-sm:px-3">
      <div className="flex min-w-0 items-center gap-1">
        <Wordmark />
        <span className="mx-1.5 h-4 w-px bg-line max-sm:hidden" aria-hidden />
        <button
          type="button"
          onClick={onProblems}
          aria-haspopup="dialog"
          className="press inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-[9px] font-medium text-fg hover:bg-hover"
        >
          <ListIcon />
          <span className="max-sm:hidden">Problems</span>
        </button>
        <button
          type="button"
          onClick={onPrev}
          disabled={index <= 0}
          aria-label="Previous problem"
          title="Previous problem"
          className={`${ICON_BTN} max-sm:hidden`}
        >
          <ChevronLeft />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={index < 0 || index >= total - 1}
          aria-label="Next problem"
          title="Next problem"
          className={`${ICON_BTN} max-sm:hidden`}
        >
          <ChevronRight />
        </button>
        <button
          type="button"
          onClick={onShuffle}
          disabled={total < 2}
          aria-label="Random problem"
          title="Random problem"
          className={`${ICON_BTN} max-sm:hidden`}
        >
          <Shuffle />
        </button>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onPalette}
          aria-label={`Search problems (${paletteHint})`}
          title="Search problems"
          className="press inline-flex h-8 items-center gap-2 rounded-lg px-2 text-fg-3 hover:bg-hover hover:text-fg max-md:hidden"
        >
          <Search size={15} />
          <kbd className="rounded-[5px] px-[5px] font-mono text-[11px] leading-[18px] shadow-[inset_0_0_0_1px_var(--color-line)]">
            {paletteHint}
          </kbd>
        </button>
        <Timer />
        <ThemeToggle />
        <button
          type="button"
          onClick={onSubmit}
          aria-busy={grading}
          disabled={grading}
          className="press inline-flex h-[34px] items-center gap-[7px] whitespace-nowrap rounded-full bg-ok px-4 font-medium text-white hover:bg-[color-mix(in_srgb,var(--color-ok)_88%,#000)] disabled:opacity-80"
        >
          {grading ? (
            <span className="animate-spin">
              <Loader size={15} />
            </span>
          ) : (
            <Upload size={15} />
          )}
          <span>{grading ? "Grading…" : "Submit"}</span>
        </button>
      </div>
    </header>
  );
}
