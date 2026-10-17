import { ChapterRail } from "./ChapterRail";
import { CHAPTERS } from "./copy";
import { k, kc, SC, TL } from "./anim";
import { Moment, PinnedWorkspace } from "./Stage";
import { ScrubFallback } from "./ScrubFallback";
import { StartLink } from "./StartLink";
import "./landing.css";

const HEADLINE = "Practice system design out loud.";

export function Landing() {
  return (
    <main className="landing flex-1">
      <section className="hero wrap">
        <h1>{HEADLINE}</h1>
        <p>Sketch it, say it, and defend it, round by round.</p>
        <div className="cta">
          <StartLink size="lg" arrow />
        </div>
        <div className="scroll-hint desk">
          <i />
          Scroll to watch a round
        </div>
      </section>

      {/* Desktop: one pinned workspace scrubbed by scroll. Four chapters, then the zoom-out ending. */}
      <div className="desk pf-track" data-track={TL}>
        <div className="pf-pin">
          <div className="wrap wide pf-grid">
            <div {...kc("pf-left", "fadeOut", TL, 0.8, 0.84)}>
              <div className="chaps">
                {CHAPTERS.map((c, i) => (
                  <div
                    key={c.lab}
                    {...k(["chapFirst", "chap", "chap", "chapLast"][i], TL, (i / 4) * SC, ((i + 1) / 4) * SC, {
                      className: "chap",
                    })}
                  >
                    <div>
                      <span className="lab">{c.lab} / 04</span>
                      <h2>{c.h}</h2>
                      <p>{c.p}</p>
                    </div>
                  </div>
                ))}
              </div>
              <ChapterRail />
            </div>
            <div {...kc("pf-right", "pullBack", TL, 0.8, 1)}>
              <PinnedWorkspace />
            </div>
          </div>
          <div {...kc("pf-end", "ctaIn", TL, 0.9, 0.96)}>
            <h2>Pick a problem. Start talking.</h2>
            <StartLink size="lg" arrow />
          </div>
        </div>
      </div>

      {/* Phones and reduced motion: stacked chapters in their finished state, no pinning. */}
      <div className="mob wrap">
        {CHAPTERS.map((c, i) => (
          <section key={c.lab} className="mob-ch">
            <span className="lab">{c.lab} / 04</span>
            <h2>{c.h}</h2>
            <p>{c.p}</p>
            <Moment index={i} />
          </section>
        ))}
      </div>
      <div className="mob">
        <section className="closing wrap">
          <h2>Pick a problem. Start talking.</h2>
          <div className="cta">
            <StartLink size="lg" arrow />
          </div>
        </section>
      </div>

      <ScrubFallback />
    </main>
  );
}
