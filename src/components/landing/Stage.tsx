import { PUSH, ROUND_ONE } from "./copy";
import { Ic, type IconName } from "./icons";
import { Diagram, GradeCard, GradeRows, MiniLogo, Pill, RoughBox, RoundCard, Transcript } from "./Pieces";
import { RF, SC, TL, STATIC, k } from "./anim";
import { Fit } from "./Fit";

/** KS: a keyframe slice written in chapter space, scaled into the pinned track. */
const ks = (kf: string, a: number, b: number, opts?: Parameters<typeof k>[4]) => k(kf, TL, a * SC, b * SC, opts);

function SideCard() {
  const tabs: Array<[string, IconName]> = [
    ["Description", "doc"],
    ["Hints", "bulb"],
    ["Submissions", "hist"],
  ];
  return (
    <div className="w-side">
      <div className="w-card">
        <div className="w-tabs">
          {tabs.map(([label, icon], i) => (
            <span key={label} className="w-tab">
              <Ic name={icon} size={14} />
              {label}
              {i === 0 ? (
                <span {...ks("fadeOut", 0.755, 0.77, { className: "on" })}>
                  <Ic name={icon} size={14} />
                  {label}
                </span>
              ) : i === 2 ? (
                <span {...ks("fadeIn", 0.76, 0.775, { className: "on" })}>
                  <Ic name={icon} size={14} />
                  {label}
                </span>
              ) : null}
            </span>
          ))}
          <span className="w-ic" style={{ marginLeft: "auto", alignSelf: "center" }}>
            <Ic name="panel" size={15} />
          </span>
        </div>
        <div {...ks("fadeOut", 0.755, 0.77, { className: "w-pane" })}>
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
            <span className="iv-av">I</span>
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
        <div {...ks("riseIn", 0.77, 0.81, { className: "w-pane w-grade" })}>
          <div className="w-title" style={{ fontSize: 15 }}>
            Submissions
          </div>
          <div className="gr-h" style={{ marginTop: 16 }}>
            <span className="t">
              <b>Round 2</b> · Scale it
            </span>
            <span {...ks("fadeIn", 0.92, 0.95, { className: "lvl" })}>Mid-level signal</span>
          </div>
          <GradeRows tl={TL} range={[0.8 * SC, 0.92 * SC]} />
          <p className="gr-ex">Example feedback</p>
        </div>
      </div>
    </div>
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

const TOOLS: IconName[] = ["hand", "cursor", "sq", "diamond", "circle", "arr2", "line", "pen", "text", "eraser"];

/** The illustrated workspace: 1040 x 600. Canvas spans x 320..1040, y 54..600. */
function WorkspaceStage() {
  return (
    <div className="frame">
      <div className="w-top">
        <div className="l">
          <MiniLogo />
          <span className="w-sep" />
          <span className="w-btn">
            <Ic name="list" size={15} />
            Problems
          </span>
          <span className="w-ic">
            <Ic name="chev" size={15} />
          </span>
        </div>
        <div className="r">
          <span className="w-kbd">
            <Ic name="search" size={15} />
            <kbd>⌘K</kbd>
          </span>
          <span className="w-timer">18:42</span>
          <span className="w-ic">
            <Ic name="moon" size={15} />
          </span>
          <span className="w-submit">
            <Ic name="upload" size={15} />
            Submit
          </span>
        </div>
      </div>
      <SideCard />
      <div className="w-canvas">
        <div className="w-tools">
          {TOOLS.map((t, i) => (
            <span key={t} style={{ display: "contents" }}>
              {i === 2 ? <span className="gap" /> : null}
              <i className={i === 7 ? "on" : ""}>
                <Ic name={t} size={15} />
              </i>
            </span>
          ))}
        </div>
        <div className="w-zoom">
          <div>
            <i>
              <Ic name="plus" size={14} />
            </i>
            <i>100%</i>
            <i>
              <Ic name="minus" size={14} />
            </i>
          </div>
          <div>
            <i>
              <Ic name="undo" size={14} />
            </i>
            <i>
              <Ic name="redo" size={14} />
            </i>
          </div>
        </div>
      </div>
      <Diagram W={1040} H={600} ox={397} oy={316} tl={TL} R={RF} />
      <Transcript left={450} top={450} width={460} tl={TL} R={RF.tx} />
      <Pill left={564} top={534} tl={TL} R={RF.pill} />
    </div>
  );
}

/** The pinned desktop visual, scaled to fit its box. */
export function PinnedWorkspace() {
  return (
    <Fit w={1040} h={600} max={1.25}>
      <WorkspaceStage />
    </Fit>
  );
}

/* Static moments: one finished mini-scene per chapter (phones and reduced motion). */
const S = STATIC;

export function Moment({ index }: { index: number }) {
  if (index === 0) {
    return (
      <Fit w={520} h={250} byWidth max={1.2}>
        <div className="cv frame" />
        <svg className="dg" width={520} height={250} viewBox="0 0 520 250" aria-hidden="true">
          <RoughBox x={130} y={70} w={260} h={110} label="API server" sub="POST /links" tl={S} range={[0.08, 0.6]} big />
        </svg>
      </Fit>
    );
  }
  if (index === 1) {
    return (
      <Fit w={380} h={170} byWidth max={1.2}>
        <Pill left={74} top={14} tl={S} R={{ grow: [0.04, 0.2], inn: [0.16, 0.26], wave: [0.2, 1] }} time="0:48" />
        <Transcript left={0} top={84} width={380} tl={S} R={{ in: [0.16, 0.25], words: [0.25, 0.8] }} />
      </Fit>
    );
  }
  if (index === 2) {
    return (
      <Fit w={380} h={210} byWidth max={1.2}>
        <RoundCard left={10} top={8} width={360} tl={S} R={{ card: [0.04, 0.22], bar: [0.22, 0.38], quote: [0.32, 0.85] }} />
      </Fit>
    );
  }
  return (
    <Fit w={380} h={270} byWidth max={1.2}>
      <GradeCard left={10} top={6} width={360} tl={S} R={{ card: [0.04, 0.2], bars: [0.2, 0.75], chip: [0.75, 0.85] }} />
    </Fit>
  );
}

