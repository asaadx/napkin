import { Ic, type IconName } from "./icons";
import { SideCard } from "./SideCard";
import { Diagram, GradeCard, MiniLogo, Pill, RoughBox, RoundCard, Transcript } from "./Pieces";
import { RF, TL, STATIC } from "./anim";
import { Fit } from "./Fit";

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

