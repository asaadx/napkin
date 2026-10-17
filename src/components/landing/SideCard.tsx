"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { BotIcon } from "@/components/icons/BotIcon";
import { PUSH, ROUND_ONE } from "./copy";
import { Ic, type IconName } from "./icons";
import { GradeRows } from "./Pieces";
import { SC, STATIC, TL, k } from "./anim";
import { useChapter } from "./useChapter";

/** KS: a keyframe slice written in chapter space, scaled into the pinned track. */
const ks = (kf: string, a: number, b: number, opts?: Parameters<typeof k>[4]) => k(kf, TL, a * SC, b * SC, opts);

type Tab = "description" | "hints" | "submissions";
const TABS: ReadonlyArray<readonly [Tab, string, IconName]> = [
  ["description", "Description", "doc"],
  ["hints", "Hints", "bulb"],
  ["submissions", "Submissions", "hist"],
];

const HINTS = [
  "Start with the redirect. It only needs code to URL, so what makes that lookup fast?",
  "Counter plus base62, or a hash with a collision check? Say what each costs at scale.",
  "Reads outnumber writes by orders of magnitude. Where would a cache sit, and what happens on a miss?",
];

/**
 * The demo's left card. Its tab follows the scroll story; clicking a tab takes over
 * until the story moves to the next chapter, then scroll drives it again.
 */
export function SideCard() {
  const chapter = useChapter();
  const [pick, setPick] = useState<{ tab: Tab; chapter: number } | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const forced = pick && pick.chapter === chapter ? pick.tab : null;
  const shown: Tab = forced ?? (chapter === 3 ? "submissions" : "description");

  const choose = (tab: Tab) => setPick({ tab, chapter });
  const onKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const j = (next + TABS.length) % TABS.length;
    tabRefs.current[j]?.focus();
    choose(TABS[j][0]);
  };

  return (
    <div className="w-side">
      <div className="w-card" data-forced={forced ?? undefined}>
        <div className="w-tabs" role="tablist" aria-label="Problem panel">
          {TABS.map(([id, label, icon], i) => (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`demo-tab-${id}`}
              aria-selected={shown === id}
              aria-controls={`demo-pane-${id}`}
              className="w-tab"
              onClick={() => choose(id)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <Ic name={icon} size={14} />
              {label}
              {i === 0 ? (
                <span aria-hidden="true" {...ks("fadeOut", 0.755, 0.77, { className: "on" })}>
                  <Ic name={icon} size={14} />
                  {label}
                </span>
              ) : i === 2 ? (
                <span aria-hidden="true" {...ks("fadeIn", 0.76, 0.775, { className: "on" })}>
                  <Ic name={icon} size={14} />
                  {label}
                </span>
              ) : null}
            </button>
          ))}
          <span className="w-ic" style={{ marginLeft: "auto", alignSelf: "center" }} aria-hidden="true">
            <Ic name="panel" size={15} />
          </span>
        </div>

        <div
          id="demo-pane-description"
          role="tabpanel"
          aria-labelledby="demo-tab-description"
          aria-hidden={shown !== "description"}
          {...ks("fadeOut", 0.755, 0.77, { className: "w-pane w-scroll w-desc" })}
        >
          <div className="w-title">
            Design a URL Shortener <span className="diff d-easy">easy</span>
          </div>
          <div className="w-rp">
            <div className="w-rp-l">
              <div {...ks("fadeOut", 0.51, 0.54)}>
                <b>Round 1 of 3</b>
                <span>·</span>
                <span>Core design</span>
              </div>
              <div {...ks("fadeIn", 0.52, 0.55)}>
                <b>Round 2 of 3</b>
                <span>·</span>
                <span>Scale it</span>
              </div>
            </div>
            <div className="w-bars">
              <i className="r1">
                <b {...ks("fill", 0.51, 0.54, { className: "done" })} />
              </i>
              <i>
                <b {...ks("fill", 0.54, 0.58, { className: "cur" })} />
              </i>
              <i />
            </div>
          </div>
          <div className="iv-h">
            <span className="iv-av">
              <BotIcon className="size-[12px]" />
            </span>
            <b>Interviewer</b>
          </div>
          <div className="w-q">
            <div {...ks("fadeOut", 0.505, 0.53)}>
              <p className="q">{ROUND_ONE}</p>
            </div>
            <div {...ks("fadeIn", 0.53, 0.55)}>
              <PushWords />
            </div>
          </div>
        </div>

        <div
          id="demo-pane-submissions"
          role="tabpanel"
          aria-labelledby="demo-tab-submissions"
          aria-hidden={shown !== "submissions"}
          {...ks("riseIn", 0.77, 0.81, { className: "w-pane w-scroll w-grade" })}
        >
          <GradeBody tl={TL} live />
        </div>

        {forced === "submissions" ? (
          <div role="tabpanel" aria-labelledby="demo-tab-submissions" className="w-pane w-forced w-grade">
            <GradeBody tl={STATIC} />
          </div>
        ) : null}

        {forced === "hints" ? (
          <div id="demo-pane-hints" role="tabpanel" aria-labelledby="demo-tab-hints" className="w-pane w-forced">
            <div className="w-title" style={{ fontSize: 15 }}>
              Hints
            </div>
            <ol className="w-hints">
              {HINTS.map((h, i) => (
                <li key={h}>
                  <span className="hn">Hint {i + 1}</span>
                  <p>{h}</p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GradeBody({ tl, live = false }: { tl: string; live?: boolean }) {
  const slice = (kf: string, a: number, b: number, className: string) =>
    live ? ks(kf, a, b, { className }) : k(kf, tl, 0, 0, { className });
  return (
    <>
      <div className="w-title" style={{ fontSize: 15 }}>
        Submissions
      </div>
      <div className="gr-h" style={{ marginTop: 16 }}>
        <span className="t">
          <b>Round 2</b> · Scale it
        </span>
        <span {...slice("fadeIn", 0.92, 0.95, "lvl")}>Mid-level signal</span>
      </div>
      <GradeRows tl={tl} range={[0.8 * SC, 0.92 * SC]} />
      <p className="gr-ex">Example feedback</p>
    </>
  );
}

function PushWords() {
  const ws = PUSH.split(" ");
  const [a, b] = [0.54 * SC, 0.66 * SC];
  return (
    <p className="q">
      {ws.map((w, i) => {
        const x = a + ((b - a) * i) / ws.length;
        const y = a + ((b - a) * (i + 1)) / ws.length;
        return (
          <span key={i} {...k("wordIn", TL, x, y, { className: "wd" })}>
            {w}
            {i < ws.length - 1 ? " " : ""}
          </span>
        );
      })}
    </p>
  );
}
