import { LogoMark } from "@/components/brand/Logo";
import { DIMS, PUSH, SAY } from "./copy";
import { Ic } from "./icons";
import { k, kc, slice, type Range, type Timings } from "./anim";

/* Small illustrated pieces of the workspace. Each takes a timeline name and its
 * slice of that timeline, so the same piece can scrub with scroll or sit finished. */

export function RoughBox({
  x, y, w, h, label, sub, tl, range, big,
}: {
  x: number; y: number; w: number; h: number; label: string; sub?: string;
  tl: string; range: Range; big?: boolean;
}) {
  const [a, b] = range;
  const d = b - a;
  const se = a + 0.75 * d;
  const s = (se - a) / 4;
  const sides: Array<[string, string, string]> = [
    [`M${x - 4} ${y + 2} Q${x + w / 2} ${y - 5} ${x + w + 3} ${y}`, "growX", "left center"],
    [`M${x + w + 2} ${y - 3} Q${x + w + 7} ${y + h / 2} ${x + w + 1} ${y + h + 3}`, "growY", "center top"],
    [`M${x + w + 3} ${y + h + 1} Q${x + w / 2} ${y + h + 7} ${x - 3} ${y + h - 1}`, "growX", "right center"],
    [`M${x - 2} ${y + h + 2} Q${x - 7} ${y + h / 2} ${x - 1} ${y - 4}`, "growY", "center bottom"],
  ];
  return (
    <>
      <g {...k("fadeOut", tl, se, se + 0.15 * d, { className: "rough" })}>
        {sides.map(([p, kf, origin], i) => (
          <path key={i} d={p} {...k(kf, tl, a + s * i, a + s * (i + 1), { origin })} />
        ))}
      </g>
      <g {...k("snapIn", tl, se, b, { origin: "center" })}>
        <rect className="sh" x={x} y={y} width={w} height={h} rx={9} />
        <text className={`lbl${big ? " big" : ""}`} x={x + w / 2} y={y + h / 2 - (sub ? 7 : 0)}>
          {label}
        </text>
        {sub ? (
          <text className="sub" x={x + w / 2} y={y + h / 2 + 11}>
            {sub}
          </text>
        ) : null}
      </g>
    </>
  );
}

function Cylinder({ x, y, w, h, label, tl, range }: { x: number; y: number; w: number; h: number; label: string; tl: string; range: Range }) {
  const rx = w / 2;
  const ry = 10;
  return (
    <g {...k("riseIn", tl, range[0], range[1])}>
      <path className="sh" d={`M${x} ${y + ry} V${y + h - ry} A${rx} ${ry} 0 0 0 ${x + w} ${y + h - ry} V${y + ry}`} />
      <ellipse className="sh" cx={x + rx} cy={y + ry} rx={rx} ry={ry} />
      <text className="lbl" x={x + rx} y={y + h / 2 + 5}>
        {label}
      </text>
    </g>
  );
}

function PlainBox({
  x, y, w, h, label, sub, tl, range, cls,
}: {
  x: number; y: number; w: number; h: number; label: string; sub?: string; tl: string; range: Range; cls?: string;
}) {
  return (
    <g {...k("riseIn", tl, range[0], range[1], { className: cls })}>
      <rect className="sh" x={x} y={y} width={w} height={h} rx={9} />
      <text className="lbl" x={x + w / 2} y={y + h / 2 - (sub ? 7 : 0)}>
        {label}
      </text>
      {sub ? (
        <text className="sub" x={x + w / 2} y={y + h / 2 + 11}>
          {sub}
        </text>
      ) : null}
    </g>
  );
}

function ArrowH({ x1, x2, y, tl, range, cls }: { x1: number; x2: number; y: number; tl: string; range: Range; cls?: string }) {
  const [a, b] = range;
  const m = a + 0.8 * (b - a);
  return (
    <g className={cls}>
      <path d={`M${x1} ${y} H${x2 - 8}`} {...kc("ar", "growX", tl, a, m, { origin: "left center" })} />
      <path d={`M${x2 - 9} ${y - 5} L${x2} ${y} L${x2 - 9} ${y + 5} Z`} {...kc("ah", "fadeIn", tl, m, b)} />
    </g>
  );
}

function ArrowUp({ x, y1, y2, tl, range, cls }: { x: number; y1: number; y2: number; tl: string; range: Range; cls?: string }) {
  const [a, b] = range;
  const m = a + 0.8 * (b - a);
  return (
    <g className={cls}>
      <path d={`M${x} ${y1} V${y2 + 8}`} {...kc("ar", "growY", tl, a, m, { origin: "center bottom" })} />
      <path d={`M${x - 5} ${y2 + 9} L${x} ${y2} L${x + 5} ${y2 + 9} Z`} {...kc("ah", "fadeIn", tl, m, b)} />
    </g>
  );
}

/** The URL shortener sketch: Client, API server, Links DB, then a cache and replicas in round 2. */
export function Diagram({ W, H, ox, oy, tl, R }: { W: number; H: number; ox: number; oy: number; tl: string; R: Timings }) {
  const X = (v: number) => v + ox;
  const Y = (v: number) => v + oy;
  return (
    <svg className="dg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <rect x={X(212)} y={Y(-12)} width={150} height={54} rx={9} {...kc("back", "backOut", tl, R.rep[0], R.rep[1])} />
      <rect x={X(206)} y={Y(-6)} width={150} height={54} rx={9} {...kc("back", "backOut", tl, R.rep[0] + 0.01, R.rep[1])} />
      <RoughBox x={X(0)} y={Y(0)} w={120} h={54} label="Client" tl={tl} range={R.client} />
      <RoughBox x={X(200)} y={Y(0)} w={150} h={54} label="API server" sub="POST /links" tl={tl} range={R.api} />
      <Cylinder x={X(430)} y={Y(-18)} w={136} h={90} label="Links DB" tl={tl} range={R.db} />
      <ArrowH x1={X(120)} x2={X(198)} y={Y(27)} tl={tl} range={R.ar1} />
      <ArrowH x1={X(350)} x2={X(428)} y={Y(27)} tl={tl} range={R.ar2} />
      <PlainBox x={X(200)} y={Y(-140)} w={150} h={52} label="Redis cache" sub="code → url" tl={tl} range={R.cache} cls="nw" />
      <ArrowUp x={X(275)} y1={Y(-12)} y2={Y(-88)} tl={tl} range={R.cacheAr} cls="nw" />
    </svg>
  );
}

function Words({ text, tl, range }: { text: string; tl: string; range: Range }) {
  const ws = text.split(" ");
  return (
    <>
      {ws.map((w, i) => {
        const [x, y] = slice(range[0], range[1], i, ws.length);
        return (
          <span key={i} {...k("wordIn", tl, x, y, { className: "wd" })}>
            {w}
            {i < ws.length - 1 ? " " : ""}
          </span>
        );
      })}
    </>
  );
}

export function Pill({
  left, top, tl, R, time = "2:41",
}: {
  left: number; top: number; tl: string; R: Timings["pill"]; time?: string;
}) {
  const bars = Array.from({ length: 24 }, (_, i) => {
    const kf = ["wa", "wb", "wc"][i % 3];
    const off = ((i * 7) % 11) * 0.0025;
    return <i key={i} {...k(kf, tl, R.wave[0] + off, R.wave[1] - 0.01 + off)} />;
  });
  return (
    <div className="pill" style={{ left, top }}>
      <div {...kc("pill-bg", "pillGrow", tl, R.grow[0], R.grow[1])} />
      <div {...kc("pill-idle", "fadeOut", tl, R.grow[0], R.grow[0] + (R.grow[1] - R.grow[0]) * 0.4)}>
        <Ic name="mic" size={18} />
      </div>
      <div {...kc("pill-in", "fadeIn", tl, R.inn[0], R.inn[1])}>
        <span className="pill-stop">
          <Ic name="stop" size={15} />
        </span>
        <span className="wave">{bars}</span>
        <span className="pill-t">{time}</span>
      </div>
    </div>
  );
}

export function Transcript({
  left, top, width, tl, R,
}: {
  left: number; top: number; width: number; tl: string;
  R: { in: Range; words: Range; out?: Range };
}) {
  const out = R.out ? k("fadeOut", tl, R.out[0], R.out[1], { className: "tx", style: { left, top, width } }) : { className: "tx", style: { left, top, width } };
  return (
    <div {...out}>
      <div {...k("fadeIn", tl, R.in[0], R.in[1])}>
        <span className="who">You, live transcript</span>
        <Words text={SAY} tl={tl} range={R.words} />
      </div>
    </div>
  );
}

export function RoundCard({
  left, top, width, tl, R,
}: {
  left: number; top: number; width: number; tl: string;
  R: { card: Range; bar: Range; quote: Range };
}) {
  return (
    <div style={{ position: "absolute", left, top, width }}>
      <div {...k("slideL", tl, R.card[0], R.card[1], { className: "fcard", style: { position: "relative" } })}>
        <div className="rp-l">
          <b>Round 2 of 3</b>
          <span>·</span>
          <span>Scale it</span>
        </div>
        <div className="rp-bars">
          <i className="done" />
          <i>
            <b {...k("fill", tl, R.bar[0], R.bar[1])} />
          </i>
          <i />
        </div>
        <div className="iv-h">
          <span className="iv-av">I</span>
          <b>Interviewer</b>
        </div>
        <div className="iv-q">
          <Words text={PUSH} tl={tl} range={R.quote} />
        </div>
      </div>
    </div>
  );
}

export function GradeRows({ tl, range }: { tl: string; range: Range }) {
  return (
    <ul className="dims">
      {DIMS.map(([n, s], i) => {
        const [a, b] = slice(range[0], range[1], i, DIMS.length);
        return (
          <li key={n}>
            <span>{n}</span>
            <span className={`bar${s < 3 ? " low" : ""}`}>
              <b {...k("fill", tl, a, Math.min(range[1], b + 0.02), { style: { width: `${s * 25}%` } })} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function GradeCard({
  left, top, width, tl, R,
}: {
  left: number; top: number; width: number; tl: string;
  R: { card: Range; bars: Range; chip: Range };
}) {
  return (
    <div {...k("slideL", tl, R.card[0], R.card[1], { className: "fcard", style: { left, top, width } })}>
      <div className="gr-h">
        <span className="t">
          <b>Round 2</b> · Scale it
        </span>
        <span {...kc("lvl", "fadeIn", tl, R.chip[0], R.chip[1])}>
          Mid-level signal
        </span>
      </div>
      <GradeRows tl={tl} range={R.bars} />
      <p className="gr-ex">Example feedback</p>
    </div>
  );
}

/** Mark + wordmark as drawn inside the illustrated workspace top bar. */
export function MiniLogo() {
  return (
    <span className="w-logo">
      <LogoMark size={20} />
      <span>Napkin</span>
    </span>
  );
}
