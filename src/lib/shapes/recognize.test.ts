import { describe, expect, it } from "vitest";
import { detectArrowhead, detectCylinder, recognizeShape, type Point, type RecognizedShape } from "./index";

// ---------------------------------------------------------------------------
// Synthetic stroke generator
// ---------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Noise = {
  seed?: number;
  /** Per-point random jitter amplitude (px). */
  jitter?: number;
  /** Low-frequency perpendicular wobble amplitude (px). */
  wobble?: number;
  /** Mean spacing between emitted points (px); actual spacing varies 0.3x–2x. */
  spacing?: number;
};

/**
 * Turn an ideal polyline into a "hand-drawn" stroke: uneven point spacing,
 * smooth perpendicular wobble and per-point jitter.
 */
function handDraw(ideal: Point[], noise: Noise = {}): Point[] {
  const { seed = 1, jitter = 1.2, wobble = 2.5, spacing = 4 } = noise;
  const rand = rng(seed);
  const total = ideal.reduce((acc, p, i) => (i ? acc + Math.hypot(p.x - ideal[i - 1].x, p.y - ideal[i - 1].y) : 0), 0);
  const phase1 = rand() * 6.28, phase2 = rand() * 6.28;
  const f1 = 2 + rand() * 2, f2 = 5 + rand() * 4;
  const out: Point[] = [];
  let seg = 0, segPos = 0, travelled = 0;
  while (seg < ideal.length - 1) {
    const a = ideal[seg], b = ideal[seg + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0 || segPos > len) { segPos -= len; seg++; continue; }
    const t = segPos / len;
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    const s = (travelled + segPos) / Math.max(1, total);
    const w = wobble * (0.7 * Math.sin(2 * Math.PI * f1 * s + phase1) + 0.3 * Math.sin(2 * Math.PI * f2 * s + phase2));
    out.push({
      x: a.x + t * (b.x - a.x) + nx * w + (rand() - 0.5) * 2 * jitter,
      y: a.y + t * (b.y - a.y) + ny * w + (rand() - 0.5) * 2 * jitter,
    });
    const step = spacing * (0.3 + rand() * 1.7);
    segPos += step;
    if (segPos > len) { travelled += len; segPos -= len; seg++; }
  }
  out.push({ ...ideal[ideal.length - 1] });
  return out;
}

const rot = (p: Point, c: Point, angle: number): Point => ({
  x: c.x + (p.x - c.x) * Math.cos(angle) - (p.y - c.y) * Math.sin(angle),
  y: c.y + (p.x - c.x) * Math.sin(angle) + (p.y - c.y) * Math.cos(angle),
});

/** Densify a parametric curve into a polyline. */
function curve(f: (t: number) => Point, n = 200): Point[] {
  return Array.from({ length: n + 1 }, (_, i) => f(i / n));
}

type RectOpts = {
  cx: number; cy: number; w: number; h: number; angle?: number;
  startCorner?: 0 | 1 | 2 | 3; clockwise?: boolean;
  /** Fraction of the first side to continue past the start corner (negative = stop short). */
  overshoot?: number;
};

function rectIdeal({ cx, cy, w, h, angle = 0, startCorner = 0, clockwise = true, overshoot = 0 }: RectOpts): Point[] {
  let corners: Point[] = [
    { x: cx - w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 },
    { x: cx - w / 2, y: cy + h / 2 },
  ];
  if (!clockwise) corners = [corners[0], corners[3], corners[2], corners[1]];
  corners = [...corners.slice(startCorner), ...corners.slice(0, startCorner)];
  const pts = [...corners, corners[0]];
  const first = { x: corners[1].x - corners[0].x, y: corners[1].y - corners[0].y };
  if (overshoot > 0) {
    pts.push({ x: corners[0].x + first.x * overshoot, y: corners[0].y + first.y * overshoot });
  } else if (overshoot < 0) {
    const last = corners[3];
    const k = -overshoot;
    pts[pts.length - 1] = { x: corners[0].x + (last.x - corners[0].x) * k, y: corners[0].y + (last.y - corners[0].y) * k };
  }
  return pts.map((p) => rot(p, { x: cx, y: cy }, angle));
}

type EllipseOpts = {
  cx: number; cy: number; rx: number; ry: number; angle?: number;
  start?: number; clockwise?: boolean; sweep?: number;
  /** Radius modulation amplitude, e.g. 0.08 for a lopsided circle. */
  lopsided?: number;
};

function ellipseIdeal({ cx, cy, rx, ry, angle = 0, start = 0, clockwise = true, sweep = 1, lopsided = 0 }: EllipseOpts): Point[] {
  const dir = clockwise ? 1 : -1;
  return curve((t) => {
    const a = start + dir * t * sweep * 2 * Math.PI;
    const k = 1 + lopsided * Math.cos(a - 0.7);
    return rot({ x: cx + rx * k * Math.cos(a), y: cy + ry * k * Math.sin(a) }, { x: cx, y: cy }, angle);
  });
}

const reverse = (pts: Point[]) => [...pts].reverse();

function arrowIdeal(start: Point, end: Point, style: "hook" | "both" | "cross", barb = 0.22, spread = 30): Point[] {
  const L = Math.hypot(end.x - start.x, end.y - start.y);
  const bx = (start.x - end.x) / L, by = (start.y - end.y) / L;
  const b = (sign: number): Point => {
    const a = sign * spread * (Math.PI / 180);
    return {
      x: end.x + barb * L * (bx * Math.cos(a) - by * Math.sin(a)),
      y: end.y + barb * L * (bx * Math.sin(a) + by * Math.cos(a)),
    };
  };
  if (style === "hook") return [start, end, b(1)];
  if (style === "both") return [start, end, b(1), end, b(-1)];
  return [start, end, b(1), b(-1)];
}

/** Rhombus with its vertices at the midpoints of a w×h box, starting at vertex `start` (0 = top). */
function diamondIdeal({ cx, cy, w, h, start = 0, clockwise = true, overshoot = 0 }: {
  cx: number; cy: number; w: number; h: number; start?: number; clockwise?: boolean; overshoot?: number;
}): Point[] {
  let v: Point[] = [
    { x: cx, y: cy - h / 2 },
    { x: cx + w / 2, y: cy },
    { x: cx, y: cy + h / 2 },
    { x: cx - w / 2, y: cy },
  ];
  if (!clockwise) v = [v[0], v[3], v[2], v[1]];
  v = [...v.slice(start % 4), ...v.slice(0, start % 4)];
  const pts = [...v, v[0]];
  if (overshoot > 0) pts.push({ x: v[0].x + (v[1].x - v[0].x) * overshoot, y: v[0].y + (v[1].y - v[0].y) * overshoot });
  return pts;
}

type CylOpts = { cx: number; top: number; w: number; capH: number; bodyH: number };

/** Top ellipse of a cylinder, drawn as one loop. */
function capIdeal({ cx, top, w, capH }: CylOpts, start = 2.6, clockwise = true, sweep = 1.04): Point[] {
  return ellipseIdeal({ cx, cy: top + capH / 2, rx: w / 2, ry: capH / 2, start, clockwise, sweep });
}

/**
 * The "U" of a cylinder: down the left side, along the bottom arc, up the right.
 * `ends` nudges the left/right endpoints (sloppy starts and finishes).
 */
function bodyIdeal({ cx, top, w, capH, bodyH }: CylOpts, ends: [Point, Point] = [{ x: 0, y: 0 }, { x: 0, y: 0 }]): Point[] {
  const cy = top + capH / 2, rx = w / 2, ry = capH / 2;
  const bottomC = cy + bodyH;
  return [
    { x: cx - rx + ends[0].x, y: cy + ends[0].y },
    ...curve((t) => ({ x: cx - rx * Math.cos(t * Math.PI), y: bottomC + ry * Math.sin(t * Math.PI) }), 60),
    { x: cx + rx + ends[1].x, y: cy + ends[1].y },
  ];
}

/** One-stroke "can" outline: top arc, right side, bottom arc, left side. */
function canIdeal({ cx, top, w, capH, bodyH }: CylOpts): Point[] {
  const cy = top + capH / 2, rx = w / 2, ry = capH / 2;
  return [
    ...curve((t) => ({ x: cx - rx * Math.cos(t * Math.PI), y: cy - ry * Math.sin(t * Math.PI) }), 60),
    ...curve((t) => ({ x: cx + rx * Math.cos(t * Math.PI), y: cy + bodyH + ry * Math.sin(t * Math.PI) }), 60),
    { x: cx - rx, y: cy },
  ];
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

function expectBox(
  s: RecognizedShape | null,
  kind: "rectangle" | "diamond",
  want: { cx: number; cy: number; width: number; height: number },
  tol = 0.1,
) {
  expect(s, `expected ${kind}`).not.toBeNull();
  expect(s!.kind).toBe(kind);
  const b = s as Extract<RecognizedShape, { kind: "rectangle" | "diamond" }>;
  const scale = Math.max(want.width, want.height);
  expect(Math.abs(b.cx - want.cx)).toBeLessThan(tol * scale);
  expect(Math.abs(b.cy - want.cy)).toBeLessThan(tol * scale);
  // Always axis-aligned, so width is the horizontal extent.
  expect(Math.abs(b.width - want.width) / want.width).toBeLessThan(tol);
  expect(Math.abs(b.height - want.height) / want.height).toBeLessThan(tol);
  expect("angle" in b).toBe(false);
}

function expectCylinder(s: RecognizedShape | null, o: CylOpts, tol = 0.12, capTol = 0.35) {
  expect(s, "expected cylinder").not.toBeNull();
  expect(s!.kind).toBe("cylinder");
  const c = s as Extract<RecognizedShape, { kind: "cylinder" }>;
  const height = o.capH + o.bodyH;
  expect(Math.abs(c.cx - o.cx)).toBeLessThan(tol * o.w);
  expect(Math.abs(c.cy - (o.top + height / 2))).toBeLessThan(tol * height);
  expect(Math.abs(c.width - o.w) / o.w).toBeLessThan(tol);
  expect(Math.abs(c.height - height) / height).toBeLessThan(tol);
  expect(Math.abs(c.capHeight - o.capH)).toBeLessThan(capTol * o.capH);
}

function expectSegment(s: RecognizedShape | null, kind: "line" | "arrow", start: Point, end: Point, tol = 0.08) {
  expect(s, `expected ${kind}`).not.toBeNull();
  expect(s!.kind).toBe(kind);
  const seg = s as Extract<RecognizedShape, { kind: "line" | "arrow" }>;
  const L = Math.hypot(end.x - start.x, end.y - start.y);
  expect(Math.hypot(seg.start.x - start.x, seg.start.y - start.y)).toBeLessThan(tol * L);
  expect(Math.hypot(seg.end.x - end.x, seg.end.y - end.y)).toBeLessThan(tol * L);
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

// ---------------------------------------------------------------------------
// Positives
// ---------------------------------------------------------------------------

describe("recognizeShape: rectangles", () => {
  it("wobbly square keeps its drawn aspect (all start corners, both directions)", () => {
    for (const seed of SEEDS) {
      const pts = handDraw(
        rectIdeal({ cx: 300, cy: 200, w: 160, h: 144, startCorner: (seed % 4) as 0 | 1 | 2 | 3, clockwise: seed % 2 === 0 }),
        { seed, wobble: 3, jitter: 1.5 },
      );
      const s = recognizeShape(pts);
      expectBox(s, "rectangle", { cx: 300, cy: 200, width: 160, height: 144 }, 0.06);
      const r = s as Extract<RecognizedShape, { kind: "rectangle" }>;
      expect(r.width).toBeGreaterThan(r.height); // no square snapping
    }
  });

  it("wide rectangle", () => {
    for (const seed of SEEDS) {
      const pts = handDraw(rectIdeal({ cx: 500, cy: 120, w: 320, h: 90, startCorner: (seed % 4) as 0 | 1 | 2 | 3, clockwise: seed % 2 === 1 }), { seed });
      expectBox(recognizeShape(pts), "rectangle", { cx: 500, cy: 120, width: 320, height: 90 });
    }
  });

  it("tall rectangle keeps width/height orientation", () => {
    const pts = handDraw(rectIdeal({ cx: 0, cy: 0, w: 80, h: 240 }), { seed: 9 });
    expectBox(recognizeShape(pts), "rectangle", { cx: 0, cy: 0, width: 80, height: 240 });
  });

  it("boxes tilted ~10° (either way) become axis-aligned rectangles", () => {
    for (const seed of SEEDS) {
      const angle = (seed % 2 ? 1 : -1) * (8 + (seed % 4)) * (Math.PI / 180);
      const pts = handDraw(rectIdeal({ cx: 200, cy: 200, w: 220, h: 120, angle, startCorner: (seed % 4) as 0 | 1 | 2 | 3 }), { seed });
      expectBox(recognizeShape(pts), "rectangle", { cx: 200, cy: 200, width: 220, height: 120 });
    }
  });

  it("boxes tilted up to ~22° still straighten, keeping their side lengths", () => {
    for (const seed of SEEDS) {
      const angle = (seed % 2 ? 1 : -1) * (16 + (seed % 3) * 3) * (Math.PI / 180);
      const pts = handDraw(rectIdeal({ cx: 400, cy: 300, w: 240, h: 130, angle, clockwise: seed % 3 === 0 }), { seed });
      expectBox(recognizeShape(pts), "rectangle", { cx: 400, cy: 300, width: 240, height: 130 });
    }
  });

  it("a tilted tall box straightens without swapping width and height", () => {
    const pts = handDraw(rectIdeal({ cx: 0, cy: 0, w: 90, h: 200, angle: 12 * (Math.PI / 180) }), { seed: 4 });
    expectBox(recognizeShape(pts), "rectangle", { cx: 0, cy: 0, width: 90, height: 200 });
  });

  it("box with overshoot at the close", () => {
    for (const seed of SEEDS) {
      const pts = handDraw(rectIdeal({ cx: 250, cy: 250, w: 200, h: 140, overshoot: 0.25, startCorner: (seed % 4) as 0 | 1 | 2 | 3 }), { seed });
      expectBox(recognizeShape(pts), "rectangle", { cx: 250, cy: 250, width: 200, height: 140 });
    }
  });

  it("box with a small undershoot gap at the close", () => {
    for (const seed of SEEDS) {
      const pts = handDraw(rectIdeal({ cx: 250, cy: 250, w: 200, h: 140, overshoot: -0.15 }), { seed });
      expectBox(recognizeShape(pts), "rectangle", { cx: 250, cy: 250, width: 200, height: 140 });
    }
  });

  it("randomized boxes (size, aspect, tilt ≤ 15°, start, direction, noise)", () => {
    const rand = rng(1234);
    for (let i = 0; i < 60; i++) {
      const w = 70 + rand() * 300, h = Math.max(50, w * (0.3 + rand() * 1.4));
      const angle = (rand() * 2 - 1) * 15 * (Math.PI / 180);
      const pts = handDraw(
        rectIdeal({ cx: 0, cy: 0, w, h, angle, startCorner: Math.floor(rand() * 4) as 0 | 1 | 2 | 3, clockwise: rand() < 0.5, overshoot: rand() * 0.2 }),
        { seed: 100 + i, wobble: 1 + rand() * 2.5, jitter: 0.5 + rand() },
      );
      const s = recognizeShape(pts);
      expect(s?.kind, `box #${i}`).toBe("rectangle");
    }
  });
});

describe("recognizeShape: diamonds", () => {
  it("diamonds of several sizes and aspects, every start vertex and direction", () => {
    const sizes: [number, number][] = [[120, 120], [200, 140], [260, 120], [90, 130], [400, 260]];
    for (const [w, h] of sizes) {
      for (const seed of SEEDS) {
        const pts = handDraw(diamondIdeal({ cx: 300, cy: 200, w, h, start: seed, clockwise: seed % 2 === 0 }), { seed });
        expectBox(recognizeShape(pts), "diamond", { cx: 300, cy: 200, width: w, height: h });
      }
    }
  });

  it("wobbly diamonds, with overshoot at the close", () => {
    for (const seed of SEEDS) {
      const pts = handDraw(diamondIdeal({ cx: 0, cy: 0, w: 220, h: 160, start: seed, overshoot: 0.2 }), { seed, wobble: 3.5, jitter: 1.5 });
      expectBox(recognizeShape(pts), "diamond", { cx: 0, cy: 0, width: 220, height: 160 });
    }
  });

  it("a square rotated 40–45° is a diamond", () => {
    for (const seed of SEEDS) {
      const angle = (40 + (seed % 6)) * (Math.PI / 180);
      const pts = handDraw(rectIdeal({ cx: 0, cy: 0, w: 140, h: 140, angle, startCorner: (seed % 4) as 0 | 1 | 2 | 3 }), { seed });
      expect(recognizeShape(pts)?.kind, `seed ${seed}`).toBe("diamond");
    }
  });

  it("randomized diamonds", () => {
    const rand = rng(77);
    for (let i = 0; i < 60; i++) {
      const w = 80 + rand() * 280, h = w * (0.45 + rand() * 1.0);
      const pts = handDraw(
        diamondIdeal({ cx: 0, cy: 0, w, h, start: Math.floor(rand() * 4), clockwise: rand() < 0.5, overshoot: rand() * 0.15 }),
        { seed: 300 + i, wobble: 1 + rand() * 2.5, jitter: 0.5 + rand() },
      );
      expect(recognizeShape(pts)?.kind, `diamond #${i}`).toBe("diamond");
    }
  });
});

describe("recognizeShape: ambiguous quads", () => {
  it("a box tilted ~30° is neither rectangle nor diamond", () => {
    for (const seed of SEEDS) {
      for (const [w, h] of [[160, 160], [240, 130]] as const) {
        const angle = (seed % 2 ? 1 : -1) * (28 + (seed % 5)) * (Math.PI / 180);
        const pts = handDraw(rectIdeal({ cx: 0, cy: 0, w, h, angle, startCorner: (seed % 4) as 0 | 1 | 2 | 3 }), { seed });
        const s = recognizeShape(pts);
        expect(s, `${w}x${h} seed ${seed} → ${JSON.stringify(s)}`).toBeNull();
      }
    }
  });

  it("randomized quads tilted 27–33° → null", () => {
    const rand = rng(99);
    for (let i = 0; i < 60; i++) {
      const w = 80 + rand() * 250, h = w * (0.5 + rand());
      const angle = (rand() < 0.5 ? 1 : -1) * (27 + rand() * 6) * (Math.PI / 180);
      const pts = handDraw(rectIdeal({ cx: 0, cy: 0, w, h, angle, startCorner: Math.floor(rand() * 4) as 0 | 1 | 2 | 3, clockwise: rand() < 0.5 }), { seed: 1500 + i, wobble: 1 + rand() * 2 });
      const s = recognizeShape(pts);
      expect(s, `#${i} ${JSON.stringify(s)}`).toBeNull();
    }
  });

  it("a non-square rectangle rotated 45° is not a diamond (corners off the midpoints)", () => {
    for (const seed of SEEDS) {
      const pts = handDraw(rectIdeal({ cx: 0, cy: 0, w: 240, h: 110, angle: Math.PI / 4 }), { seed });
      expect(recognizeShape(pts)).toBeNull();
    }
  });
});

describe("recognizeShape: single-stroke cylinder", () => {
  const shapes: CylOpts[] = [
    { cx: 200, top: 100, w: 160, capH: 50, bodyH: 180 },
    { cx: 0, top: 0, w: 120, capH: 44, bodyH: 120 },
    { cx: 500, top: 300, w: 200, capH: 70, bodyH: 160 },
  ];
  it("can outline → cylinder", () => {
    for (const o of shapes) {
      for (const seed of SEEDS) {
        const ideal = canIdeal(o);
        const pts = handDraw(seed % 2 ? ideal : reverse(ideal), { seed });
        expectCylinder(recognizeShape(pts), o, 0.12, 0.5);
      }
    }
  });

  it("randomized cans: mostly cylinders, never a diamond", () => {
    const rand = rng(555);
    let hits = 0;
    const total = 80;
    for (let i = 0; i < total; i++) {
      const w = 90 + rand() * 200;
      const o = { cx: 0, top: 0, w, capH: w * (0.25 + rand() * 0.25), bodyH: w * (0.7 + rand() * 1.2) };
      const ideal = canIdeal(o);
      const s = recognizeShape(handDraw(rand() < 0.5 ? ideal : reverse(ideal), { seed: 900 + i, wobble: 1 + rand() * 2, jitter: 0.5 + rand() }));
      // A can with shallow caps is close to a rounded box; reading it as a
      // rectangle is tolerable, anything else is not.
      expect(s === null || s.kind === "cylinder" || s.kind === "rectangle", JSON.stringify(s)).toBe(true);
      if (s?.kind === "cylinder") hits++;
    }
    expect(hits / total).toBeGreaterThan(0.8);
  });
});

describe("detectCylinder: two strokes", () => {
  const shapes: CylOpts[] = [
    { cx: 200, top: 100, w: 160, capH: 50, bodyH: 180 },
    { cx: 0, top: 0, w: 110, capH: 36, bodyH: 90 },
    { cx: 600, top: 300, w: 240, capH: 80, bodyH: 200 },
    { cx: 300, top: 50, w: 180, capH: 60, bodyH: 300 },
  ];

  it("loop then U, and U then loop", () => {
    for (const o of shapes) {
      for (const seed of SEEDS) {
        const cap = handDraw(capIdeal(o, seed, seed % 2 === 0), { seed, wobble: 1.5 });
        const body = handDraw(seed % 3 ? bodyIdeal(o) : reverse(bodyIdeal(o)), { seed: seed + 50 });
        expectCylinder(detectCylinder(cap, body), o);
        expectCylinder(detectCylinder(body, cap), o);
      }
    }
  });

  it("sloppy endpoints: starting high or low, inside or outside the loop's extremes", () => {
    const o = shapes[0];
    const rand = rng(9);
    for (let i = 0; i < 40; i++) {
      const j = () => ({ x: (rand() * 2 - 1) * 0.15 * o.w, y: (rand() * 2 - 1) * (o.capH / 2 + 0.08 * o.w) });
      const cap = handDraw(capIdeal(o, rand() * 6, rand() < 0.5), { seed: i, wobble: 1.5 });
      const body = handDraw(bodyIdeal(o, [j(), j()]), { seed: i + 500 });
      expectCylinder(detectCylinder(cap, body), o, 0.2);
    }
  });

  it("randomized two-stroke cylinders", () => {
    const rand = rng(2024);
    let hits = 0;
    const total = 80;
    for (let i = 0; i < total; i++) {
      const w = 70 + rand() * 250;
      const o = { cx: rand() * 500, top: rand() * 500, w, capH: w * (0.2 + rand() * 0.35), bodyH: w * (0.5 + rand() * 1.5) };
      const j = () => ({ x: (rand() * 2 - 1) * 0.1 * w, y: (rand() * 2 - 1) * 0.5 * o.capH });
      const cap = handDraw(capIdeal(o, rand() * 6, rand() < 0.5, 1 + rand() * 0.08), { seed: 2000 + i, wobble: 0.8 + rand() * 1.5, jitter: 0.5 + rand() });
      const bodyPts = bodyIdeal(o, [j(), j()]);
      const body = handDraw(rand() < 0.5 ? bodyPts : reverse(bodyPts), { seed: 3000 + i, wobble: 1 + rand() * 2, jitter: 0.5 + rand() });
      const s = rand() < 0.5 ? detectCylinder(cap, body) : detectCylinder(body, cap);
      if (s) {
        expectCylinder(s, o, 0.2);
        hits++;
      }
    }
    expect(hits / total).toBeGreaterThan(0.9);
  });

  it("a loop paired with other strokes (text, arrows, boxes, arcs) is not a cylinder", () => {
    const o = { cx: 200, top: 100, w: 160, capH: 50, bodyH: 180 };
    const cy = o.top + o.capH / 2, l = o.cx - o.w / 2, r = o.cx + o.w / 2;
    const others: [string, Point[]][] = [
      ["arrow down", arrowIdeal({ x: o.cx, y: cy + 40 }, { x: o.cx, y: cy + 240 }, "both")],
      ["line between extremes", [{ x: l, y: cy }, { x: r, y: cy }]],
      ["box below", rectIdeal({ cx: o.cx, cy: cy + 120, w: o.w, h: 150 })],
      ["L", [{ x: l, y: cy }, { x: l, y: cy + 200 }, { x: r, y: cy + 200 }]],
      ["C", ellipseIdeal({ cx: o.cx, cy: cy + 100, rx: 80, ry: 100, start: -Math.PI / 2, sweep: 0.5, clockwise: false })],
      ["cursive", curve((t) => ({ x: l + o.w * t + 15 * Math.cos(t * 30), y: cy + 100 + 25 * Math.sin(t * 30) }), 300)],
      ["zigzag down", [{ x: l, y: cy }, { x: r, y: cy + 60 }, { x: l, y: cy + 120 }, { x: r, y: cy + 180 }]],
      ["square U too shallow", [{ x: l, y: cy }, { x: l, y: cy + 20 }, { x: r, y: cy + 20 }, { x: r, y: cy }]],
    ];
    for (const seed of SEEDS) {
      const cap = handDraw(capIdeal(o, seed), { seed, wobble: 1.5 });
      for (const [label, ideal] of others) {
        const s = handDraw(ideal, { seed: seed + 10 });
        expect(detectCylinder(cap, s), label).toBeNull();
        expect(detectCylinder(s, cap), `${label} (first)`).toBeNull();
      }
    }
  });

  it("neither stroke alone is a shape", () => {
    const o = shapes[0];
    for (const seed of SEEDS) {
      expect(recognizeShape(handDraw(capIdeal(o, seed), { seed, wobble: 1.5 }))).toBeNull();
      expect(recognizeShape(handDraw(bodyIdeal(o), { seed }))).toBeNull();
    }
  });

  it("a U far from the loop is not a cylinder", () => {
    const o = shapes[0];
    const cap = handDraw(capIdeal(o), { seed: 1, wobble: 1.5 });
    const elsewhere = (dx: number, dy: number) => bodyIdeal({ ...o, cx: o.cx + dx, top: o.top + dy });
    for (const [dx, dy] of [[300, 0], [0, 260], [-120, 40], [80, 0], [0, -150], [0, 90]]) {
      expect(detectCylinder(cap, handDraw(elsewhere(dx, dy), { seed: 2 })), `${dx},${dy}`).toBeNull();
    }
  });

  it("a U much narrower or wider than the loop is not a cylinder", () => {
    const o = shapes[0];
    const cap = handDraw(capIdeal(o), { seed: 1, wobble: 1.5 });
    expect(detectCylinder(cap, handDraw(bodyIdeal({ ...o, w: 90 }), { seed: 3 }))).toBeNull();
    expect(detectCylinder(cap, handDraw(bodyIdeal({ ...o, w: 260 }), { seed: 3 }))).toBeNull();
  });

  it("a V, a bowl, a line, or a second loop under the loop is not a cylinder", () => {
    const o = shapes[0];
    const cap = handDraw(capIdeal(o), { seed: 1, wobble: 1.5 });
    const cy = o.top + o.capH / 2, l = o.cx - o.w / 2, r = o.cx + o.w / 2;
    const v = [{ x: l, y: cy }, { x: o.cx, y: cy + 200 }, { x: r, y: cy }];
    const bowl = curve((t) => ({ x: o.cx - (o.w / 2) * Math.cos(t * Math.PI), y: cy + (o.w / 2) * Math.sin(t * Math.PI) }), 80);
    for (const seed of SEEDS) {
      expect(detectCylinder(cap, handDraw(v, { seed })), "V").toBeNull();
      expect(detectCylinder(cap, handDraw(bowl, { seed })), "bowl").toBeNull();
      expect(detectCylinder(cap, handDraw([{ x: l, y: cy + 150 }, { x: r, y: cy + 150 }], { seed })), "line").toBeNull();
      expect(detectCylinder(cap, handDraw(capIdeal({ ...o, top: o.top + 150 }), { seed })), "loop").toBeNull();
    }
  });

  it("a round loop or a box on top is not a cylinder cap", () => {
    const o = shapes[0];
    const body = handDraw(bodyIdeal(o), { seed: 1 });
    const circle = handDraw(ellipseIdeal({ cx: o.cx, cy: o.top + o.capH / 2, rx: o.w / 2, ry: o.w / 2 }), { seed: 2 });
    expect(detectCylinder(circle, body)).toBeNull();
    const tilted = handDraw(ellipseIdeal({ cx: o.cx, cy: o.top + o.capH / 2, rx: o.w / 2, ry: o.capH / 2, angle: 0.5 }), { seed: 2 });
    expect(detectCylinder(tilted, body)).toBeNull();
    // Two U's are not a cylinder either.
    expect(detectCylinder(body, handDraw(bodyIdeal(o), { seed: 4 }))).toBeNull();
  });
});

describe("recognizeShape: lines", () => {
  it("diagonal line (both directions)", () => {
    for (const seed of SEEDS) {
      const a = { x: 100, y: 100 }, b = { x: 340, y: 280 };
      const [s, e] = seed % 2 ? [a, b] : [b, a];
      const pts = handDraw([s, e], { seed, wobble: 2 });
      expectSegment(recognizeShape(pts), "line", s, e);
    }
  });

  it("near-horizontal line snaps to horizontal", () => {
    const pts = handDraw([{ x: 0, y: 0 }, { x: 300, y: 25 }], { seed: 2 }); // ~4.8°
    const s = recognizeShape(pts) as Extract<RecognizedShape, { kind: "line" }>;
    expectSegment(s, "line", { x: 0, y: 12.5 }, { x: 300, y: 12.5 });
    expect(s.start.y).toBe(s.end.y);
  });

  it("near-vertical line snaps to vertical", () => {
    const pts = handDraw([{ x: 50, y: 300 }, { x: 70, y: 0 }], { seed: 5 });
    const s = recognizeShape(pts) as Extract<RecognizedShape, { kind: "line" }>;
    expect(s?.kind).toBe("line");
    expect(s.start.x).toBe(s.end.x);
  });

  it("line with a tiny pen-lift tail is still a line", () => {
    const pts = handDraw([{ x: 0, y: 0 }, { x: 300, y: 150 }, { x: 296, y: 154 }], { seed: 6 });
    expectSegment(recognizeShape(pts), "line", { x: 0, y: 0 }, { x: 300, y: 150 });
  });

  it("a stroke with only a few points (fast flick)", () => {
    const pts = [{ x: 0, y: 0 }, { x: 60, y: 41 }, { x: 121, y: 80 }, { x: 180, y: 122 }];
    expectSegment(recognizeShape(pts), "line", { x: 0, y: 0 }, { x: 180, y: 122 });
  });
});

describe("recognizeShape: single-stroke arrows", () => {
  const cases: [string, "hook" | "both" | "cross"][] = [
    ["out-and-back along one barb", "hook"],
    ["both barbs via the tip", "both"],
    ["both barbs joined across", "cross"],
  ];
  for (const [name, style] of cases) {
    it(name, () => {
      for (const seed of SEEDS) {
        const start = { x: 100, y: 400 };
        const end = { x: 100 + 260 * Math.cos(seed), y: 400 + 260 * Math.sin(seed) };
        const pts = handDraw(arrowIdeal(start, end, style, 0.2, 25 + seed * 3), { seed, wobble: 1.5 });
        expectSegment(recognizeShape(pts), "arrow", start, end);
      }
    });
  }
});

describe("detectArrowhead: two-stroke arrows", () => {
  const line = { start: { x: 100, y: 100 }, end: { x: 400, y: 220 } };
  const L = Math.hypot(300, 120);
  const dir = { x: 300 / L, y: 120 / L };

  function vAt(tip: Point, pointing: Point, size = 30, spread = 35, seed = 1): Point[] {
    const back = { x: -pointing.x, y: -pointing.y };
    const arm = (sign: number) => {
      const a = sign * spread * (Math.PI / 180);
      return {
        x: tip.x + size * (back.x * Math.cos(a) - back.y * Math.sin(a)),
        y: tip.y + size * (back.x * Math.sin(a) + back.y * Math.cos(a)),
      };
    };
    return handDraw([arm(1), tip, arm(-1)], { seed, wobble: 0.8, jitter: 0.6, spacing: 2 });
  }

  it("V at the end, pointing outward → 'end'", () => {
    for (const seed of SEEDS) {
      const tip = { x: line.end.x + (seed % 3) * 2, y: line.end.y - (seed % 2) * 3 };
      expect(detectArrowhead(vAt(tip, dir, 24 + seed * 2, 28 + seed * 3, seed), line)).toBe("end");
    }
  });

  it("V at the start, pointing outward → 'start'", () => {
    for (const seed of SEEDS) {
      expect(detectArrowhead(vAt(line.start, { x: -dir.x, y: -dir.y }, 30, 35, seed), line)).toBe("start");
    }
  });

  it("V drawn in either stroke direction", () => {
    expect(detectArrowhead(reverse(vAt(line.end, dir)), line)).toBe("end");
  });

  it("V far from the line → null", () => {
    expect(detectArrowhead(vAt({ x: 250, y: 400 }, dir), line)).toBeNull();
    expect(detectArrowhead(vAt({ x: line.end.x + 120, y: line.end.y + 50 }, dir), line)).toBeNull();
  });

  it("V near the end but pointing inward → null", () => {
    expect(detectArrowhead(vAt(line.end, { x: -dir.x, y: -dir.y }), line)).toBeNull();
    expect(detectArrowhead(vAt(line.start, dir), line)).toBeNull();
  });

  it("V near the end but pointing sideways → null", () => {
    expect(detectArrowhead(vAt(line.end, { x: -dir.y, y: dir.x }), line)).toBeNull();
  });

  it("straight tick near the end → null", () => {
    const pts = handDraw([{ x: 390, y: 200 }, { x: 410, y: 240 }], { seed: 1, wobble: 0.5, spacing: 2 });
    expect(detectArrowhead(pts, line)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Negatives
// ---------------------------------------------------------------------------

describe("recognizeShape: negatives return null", () => {
  const expectNull = (pts: Point[], label: string) => {
    const s = recognizeShape(pts);
    expect(s, `${label} → ${JSON.stringify(s)}`).toBeNull();
  };

  it("circles and loops stay ink", () => {
    for (const seed of SEEDS) {
      expectNull(handDraw(ellipseIdeal({ cx: 300, cy: 300, rx: 90, ry: 86, start: seed, clockwise: seed % 2 === 0, sweep: 1.02 }), { seed }), "circle");
      expectNull(handDraw(ellipseIdeal({ cx: 200, cy: 100, rx: 150, ry: 50, start: seed * 0.8, clockwise: seed % 2 === 1 }), { seed }), "flat ellipse");
      expectNull(handDraw(ellipseIdeal({ cx: 0, cy: 0, rx: 60, ry: 140, start: seed }), { seed }), "tall ellipse");
      expectNull(handDraw(ellipseIdeal({ cx: 0, cy: 0, rx: 140, ry: 60, angle: seed * 0.4 }), { seed }), "rotated ellipse");
      expectNull(handDraw(ellipseIdeal({ cx: 100, cy: 100, rx: 80, ry: 80, lopsided: 0.08, start: seed, sweep: 0.97 }), { seed }), "lopsided circle");
      expectNull(handDraw(ellipseIdeal({ cx: 0, cy: 0, rx: 100, ry: 100, sweep: 1.12, start: seed }), { seed }), "circle with overshoot");
    }
  });

  it("randomized loops never convert", () => {
    const rand = rng(4242);
    for (let i = 0; i < 80; i++) {
      const rx = 30 + rand() * 200, ry = rx * (0.15 + rand() * 2);
      const pts = handDraw(
        ellipseIdeal({ cx: 0, cy: 0, rx, ry, angle: rand() * Math.PI, start: rand() * 6, clockwise: rand() < 0.5, sweep: 0.95 + rand() * 0.15, lopsided: rand() * 0.1 }),
        { seed: 700 + i, wobble: 1 + rand() * 3, jitter: 0.5 + rand() },
      );
      expectNull(pts, `loop #${i}`);
    }
  });

  it("rounded boxes and pills are not cylinders", () => {
    const rounded = (w: number, h: number, r: number): Point[] => {
      const pts: Point[] = [];
      const corners = [[w / 2 - r, -h / 2 + r, -Math.PI / 2], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI]];
      for (const [x, y, a0] of corners) pts.push(...curve((t) => ({ x: x + r * Math.cos(a0 + (t * Math.PI) / 2), y: y + r * Math.sin(a0 + (t * Math.PI) / 2) }), 12));
      pts.push({ ...pts[0] });
      return pts;
    };
    for (const seed of SEEDS) {
      // Vertical pill: semicircular caps.
      const pill = [
        ...curve((t) => ({ x: -60 * Math.cos(t * Math.PI), y: -60 - 60 * Math.sin(t * Math.PI) }), 50),
        ...curve((t) => ({ x: 60 * Math.cos(t * Math.PI), y: 60 + 60 * Math.sin(t * Math.PI) }), 50),
        { x: -60, y: -60 },
      ];
      for (const [label, ideal] of [["pill", pill], ["rounded box", rounded(160, 220, 30)], ["very rounded box", rounded(160, 220, 40)], ["rounded wide box", rounded(240, 140, 35)]] as const) {
        const s = recognizeShape(handDraw(ideal, { seed }));
        expect(s?.kind === "cylinder" || s?.kind === "diamond", `${label}: ${JSON.stringify(s)}`).toBe(false);
      }
    }
  });

  it("randomized rounded boxes are never cylinders", () => {
    const rand = rng(31337);
    for (let i = 0; i < 60; i++) {
      const w = 90 + rand() * 220, h = w * (0.6 + rand() * 1.2), r = Math.min(w, h) * (0.1 + rand() * 0.25);
      const pts: Point[] = [];
      const corners = [[w / 2 - r, -h / 2 + r, -Math.PI / 2], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI]];
      for (const [x, y, a0] of corners) pts.push(...curve((t) => ({ x: x + r * Math.cos(a0 + (t * Math.PI) / 2), y: y + r * Math.sin(a0 + (t * Math.PI) / 2) }), 12));
      pts.push({ ...pts[0] });
      const s = recognizeShape(handDraw(pts, { seed: 1100 + i, wobble: 1 + rand() * 2.5, jitter: 0.5 + rand() }));
      expect(s === null || s.kind === "rectangle", `#${i} ${w.toFixed(0)}x${h.toFixed(0)} r${r.toFixed(0)}: ${JSON.stringify(s)}`).toBe(true);
    }
  });

  it("handwriting-like squiggles", () => {
    for (const seed of SEEDS) {
      const rand = rng(seed * 31);
      // Cursive: loops moving rightward.
      const cursive = curve((t) => ({
        x: 400 * t + 25 * Math.cos(t * 2 * Math.PI * (4 + seed % 3)),
        y: 30 * Math.sin(t * 2 * Math.PI * (4 + seed % 3)) + 10 * rand(),
      }), 400);
      expectNull(handDraw(cursive, { seed, wobble: 1 }), "cursive");
      // Wavy underline.
      const wave = curve((t) => ({ x: 300 * t, y: 12 * Math.sin(t * Math.PI * (3 + seed)) }));
      expectNull(handDraw(wave, { seed, wobble: 1 }), "wave");
    }
  });

  it("the letter S", () => {
    const s = [
      ...curve((t) => ({ x: 60 * Math.cos(Math.PI * 0.2 + t * Math.PI * 1.3), y: -60 - 60 * Math.sin(Math.PI * 0.2 + t * Math.PI * 1.3) }), 60),
      ...curve((t) => ({ x: -60 * Math.cos(Math.PI * 0.5 + t * Math.PI * 1.3), y: 60 + 60 * Math.sin(Math.PI * 0.5 - t * Math.PI * 1.3) }), 60),
    ];
    for (const seed of SEEDS) {
      expectNull(handDraw(s, { seed }), "S");
      expectNull(handDraw(reverse(s), { seed }), "S reversed");
    }
  });

  it("the letter Z", () => {
    const z = [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 0, y: 140 }, { x: 120, y: 140 }];
    for (const seed of SEEDS) expectNull(handDraw(z, { seed }), "Z");
  });

  it("the letter L (large) and small letters", () => {
    expectNull(handDraw([{ x: 0, y: 0 }, { x: 0, y: 200 }, { x: 120, y: 200 }], { seed: 1 }), "L");
    expectNull(handDraw(ellipseIdeal({ cx: 0, cy: 0, rx: 9, ry: 12 }), { seed: 1, wobble: 0.5, jitter: 0.3, spacing: 1 }), "small o");
    expectNull(handDraw(ellipseIdeal({ cx: 0, cy: 0, rx: 13, ry: 16 }), { seed: 1, wobble: 0.5, jitter: 0.3, spacing: 1 }), "o");
  });

  it("zigzag", () => {
    for (const seed of SEEDS) {
      const zig = Array.from({ length: 7 }, (_, i) => ({ x: i * 40, y: i % 2 ? 40 : 0 }));
      expectNull(handDraw(zig, { seed }), "zigzag");
      const shallow = Array.from({ length: 9 }, (_, i) => ({ x: i * 40, y: i % 2 ? 12 : 0 }));
      expectNull(handDraw(shallow, { seed }), "shallow zigzag");
    }
  });

  it("checkmark", () => {
    for (const seed of SEEDS) {
      expectNull(handDraw([{ x: 0, y: 60 }, { x: 40, y: 110 }, { x: 140, y: 0 }], { seed }), "check");
      expectNull(handDraw([{ x: 0, y: 60 }, { x: 30, y: 90 }, { x: 200, y: 0 }], { seed }), "long check");
    }
  });

  it("half circle and shorter arcs", () => {
    for (const seed of SEEDS) {
      expectNull(handDraw(ellipseIdeal({ cx: 0, cy: 0, rx: 100, ry: 100, start: seed, sweep: 0.5 }), { seed }), "half circle");
      expectNull(handDraw(ellipseIdeal({ cx: 0, cy: 0, rx: 150, ry: 150, start: seed, sweep: 0.15 }), { seed }), "gentle arc");
      expectNull(handDraw(ellipseIdeal({ cx: 0, cy: 0, rx: 100, ry: 100, start: seed, sweep: 0.75 }), { seed }), "C");
    }
  });

  it("U", () => {
    const u = [
      { x: 0, y: 0 },
      ...curve((t) => ({ x: 50 - 50 * Math.cos(t * Math.PI), y: 120 + 50 * Math.sin(t * Math.PI) }), 40),
      { x: 100, y: 0 },
    ];
    for (const seed of SEEDS) {
      expectNull(handDraw(u, { seed }), "U");
      expectNull(handDraw([{ x: 0, y: 0 }, { x: 0, y: 150 }, { x: 120, y: 150 }, { x: 120, y: 0 }], { seed }), "square U");
    }
  });

  it("spiral", () => {
    for (const seed of SEEDS) {
      const turns = 1.5 + (seed % 3) * 0.5;
      const sp = curve((t) => ({
        x: (20 + 100 * t) * Math.cos(t * turns * 2 * Math.PI),
        y: (20 + 100 * t) * Math.sin(t * turns * 2 * Math.PI),
      }), 300);
      expectNull(handDraw(sp, { seed }), "spiral");
      expectNull(handDraw(reverse(sp), { seed }), "spiral inward");
    }
  });

  it("double loop around a circle is not a circle", () => {
    expectNull(handDraw(ellipseIdeal({ cx: 0, cy: 0, rx: 100, ry: 100, sweep: 2 }), { seed: 2 }), "double circle");
  });

  it("tiny dot or stroke", () => {
    expectNull([{ x: 5, y: 5 }], "single point");
    expectNull([{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }], "dot");
    expectNull(handDraw([{ x: 0, y: 0 }, { x: 15, y: 12 }], { seed: 1, wobble: 0.3, jitter: 0.2, spacing: 1 }), "tiny line");
    expectNull(handDraw(rectIdeal({ cx: 0, cy: 0, w: 14, h: 14 }), { seed: 1, wobble: 0.3, jitter: 0.2, spacing: 1 }), "tiny box");
    expectNull([], "empty");
  });

  it("triangle is not a shape", () => {
    for (const seed of SEEDS) {
      const tri = [{ x: 0, y: 150 }, { x: 90, y: 0 }, { x: 180, y: 150 }, { x: 0, y: 150 }];
      const rotated = tri.map((p) => rot(p, { x: 90, y: 90 }, seed * 0.7));
      expectNull(handDraw(rotated, { seed }), "triangle");
      const right = [{ x: 0, y: 0 }, { x: 0, y: 160 }, { x: 200, y: 160 }, { x: 0, y: 0 }];
      expectNull(handDraw(right, { seed }), "right triangle");
    }
  });

  it("back-and-forth scribble along a line", () => {
    expectNull(handDraw([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 4 }], { seed: 1 }), "back and forth");
    expectNull(handDraw([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 6 }, { x: 200, y: 10 }], { seed: 1 }), "scribble");
  });

  it("line with a long hook (J) or a right-angle bend is not an arrow", () => {
    const j = [{ x: 0, y: 0 }, ...curve((t) => ({ x: 200 + 30 * Math.sin(t * Math.PI), y: 30 - 30 * Math.cos(t * Math.PI) }), 30)];
    expectNull(handDraw(j, { seed: 3 }), "J");
    expectNull(handDraw([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 50 }], { seed: 3 }), "bend");
  });
});

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

describe("performance", () => {
  it("recognizes a ~500-point stroke well under 2ms", () => {
    const pts = handDraw(rectIdeal({ cx: 0, cy: 0, w: 600, h: 400 }), { seed: 1, spacing: 4 });
    expect(pts.length).toBeGreaterThan(400);
    for (let i = 0; i < 50; i++) recognizeShape(pts); // warm-up
    const runs = 200;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) recognizeShape(pts);
    expect((performance.now() - t0) / runs).toBeLessThan(2);
  });
});
