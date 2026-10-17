"use client";

import { CHAPTERS } from "./copy";
import { k, SC, TL } from "./anim";
import { chapterScrollTop, useChapter } from "./useChapter";
import { Ic } from "./icons";

/** Each chapter's accent, matching what it shows in the demo: ink strokes, the red mic, the blue round, the green grade. */
const ACCENT = ["var(--color-fg)", "var(--color-rec)", "var(--color-accent)", "var(--color-ok)"] as const;
const ROW = ["railFirst", "rail", "rail", "railLast"] as const;

/** The chapter list under the headline. Scroll-driven like everything else; rows jump to their chapter. */
export function ChapterRail() {
  const active = useChapter();

  const go = (e: React.MouseEvent<HTMLButtonElement>, i: number) => {
    const track = e.currentTarget.closest(".pf-track");
    if (!track) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollTo({ top: chapterScrollTop(track, i), behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className="rail" role="list" aria-label="Chapters">
      {CHAPTERS.map((c, i) => {
        const a = (i / 4) * SC;
        const b = ((i + 1) / 4) * SC;
        return (
          <button
            key={c.lab}
            type="button"
            role="listitem"
            className="rl"
            style={{ "--c": ACCENT[i] } as React.CSSProperties}
            aria-current={active === i ? "step" : undefined}
            aria-label={`Chapter ${c.lab}: ${c.rail}`}
            onClick={(e) => go(e, i)}
          >
            <span {...k(ROW[i], TL, a, b, { className: "rl-in" })}>
              <span className="mk" aria-hidden="true">
                {/* Ring and tint come on when the chapter starts and stay once it is done. */}
                <i {...(i === 0 ? { className: "mk-on" } : k("fadeIn", TL, a, a + 0.02, { className: "mk-on" }))} />
                <span {...k("fadeOut", TL, b - 0.025, b, { className: "n" })}>{c.lab}</span>
                <span {...k("fadeIn", TL, b - 0.025, b, { className: "ck" })}>
                  <Ic name="check" size={12} />
                </span>
              </span>
              <span className="nm">{c.rail}</span>
              <span className="seg" aria-hidden="true">
                <b {...k("fill", TL, a, b)} />
                <em {...k("dot", TL, a, b)} />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
