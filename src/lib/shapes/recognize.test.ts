import { describe, expect, it } from "vitest";
import { detectArrowhead, recognizeShape, type Point, type RecognizedShape } from "./index";

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

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

function expectBox(
  s: RecognizedShape | null,
  kind: "rectangle" | "ellipse",
  want: { cx: number; cy: number; width: number; height: number; angle?: number },
) {
  expect(s, `expected ${kind}`).not.toBeNull();
  expect(s!.kind).toBe(kind);
  const b = s as Extract<RecognizedShape, { kind: "rectangle" | "ellipse" }>;
  const scale = Math.max(want.width, want.height);
  expect(Math.abs(b.cx - want.cx)).toBeLessThan(0.1 * scale);
  expect(Math.abs(b.cy - want.cy)).toBeLessThan(0.1 * scale);
  // Width/height may come back swapped together with a 90° rotation; compare as a set.
  const got = [b.width, b.height].sort((x, y) => x - y);
  const exp = [want.width, want.height].sort((x, y) => x - y);
  expect(Math.abs(got[0] - exp[0]) / exp[0]).toBeLessThan(0.1);
  expect(Math.abs(got[1] - exp[1]) / exp[1]).toBeLessThan(0.1);
  if (want.angle !== undefined) {
    if (want.angle === 0) {
      expect(b.angle).toBe(0);
      expect(Math.abs(b.width - want.width) / want.width).toBeLessThan(0.1);
    } else {
      const period = kind === "rectangle" ? Math.PI / 2 : Math.PI;
      let d = Math.abs(b.angle - want.angle) % period;
      d = Math.min(d, period - d);
      expect(d).toBeLessThan(5 * (Math.PI / 180));
    }
  }
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
  it("wobbly square → square (all start corners, both directions)", () => {
    for (const seed of SEEDS) {
      const pts = handDraw(
        rectIdeal({ cx: 300, cy: 200, w: 160, h: 152, startCorner: (seed % 4) as 0 | 1 | 2 | 3, clockwise: seed % 2 === 0 }),
        { seed, wobble: 3, jitter: 1.5 },
      );
      const s = recognizeShape(pts);
      expectBox(s, "rectangle", { cx: 300, cy: 200, width: 156, height: 156, angle: 0 });
      const r = s as Extract<RecognizedShape, { kind: "rectangle" }>;
      expect(r.width).toBe(r.height); // snapped to a square
    }
  });

  it("wide rectangle", () => {
    for (const seed of SEEDS) {
      const pts = handDraw(rectIdeal({ cx: 500, cy: 120, w: 320, h: 90, startCorner: (seed % 4) as 0 | 1 | 2 | 3, clockwise: seed % 2 === 1 }), { seed });
      expectBox(recognizeShape(pts), "rectangle", { cx: 500, cy: 120, width: 320, height: 90, angle: 0 });
    }
  });

  it("tall rectangle keeps width/height orientation at angle 0", () => {
    const pts = handDraw(rectIdeal({ cx: 0, cy: 0, w: 80, h: 240 }), { seed: 9 });
    expectBox(recognizeShape(pts), "rectangle", { cx: 0, cy: 0, width: 80, height: 240, angle: 0 });
  });

  it("slightly tilted (6°) rectangle snaps to axis-aligned", () => {
    const pts = handDraw(rectIdeal({ cx: 200, cy: 200, w: 220, h: 120, angle: 6 * (Math.PI / 180) }), { seed: 3 });
    expectBox(recognizeShape(pts), "rectangle", { cx: 200, cy: 200, width: 220, height: 120, angle: 0 });
  });

  it("rectangle rotated ~30°", () => {
    for (const seed of SEEDS) {
      const angle = 30 * (Math.PI / 180);
      const pts = handDraw(rectIdeal({ cx: 400, cy: 300, w: 240, h: 130, angle, startCorner: (seed % 4) as 0 | 1 | 2 | 3, clockwise: seed % 2 === 0 }), { seed });
      expectBox(recognizeShape(pts), "rectangle", { cx: 400, cy: 300, width: 240, height: 130, angle });
    }
  });

  it("box with overshoot at the close", () => {
    for (const seed of SEEDS) {
      const pts = handDraw(rectIdeal({ cx: 250, cy: 250, w: 200, h: 140, overshoot: 0.25, startCorner: (seed % 4) as 0 | 1 | 2 | 3 }), { seed });
      expectBox(recognizeShape(pts), "rectangle", { cx: 250, cy: 250, width: 200, height: 140, angle: 0 });
    }
  });

  it("box with a small undershoot gap at the close", () => {
    for (const seed of SEEDS) {
      const pts = handDraw(rectIdeal({ cx: 250, cy: 250, w: 200, h: 140, overshoot: -0.15 }), { seed });
      expectBox(recognizeShape(pts), "rectangle", { cx: 250, cy: 250, width: 200, height: 140, angle: 0 });
    }
  });
});

describe("recognizeShape: ellipses", () => {
  it("circle → circle (various start angles, both directions)", () => {
    for (const seed of SEEDS) {
      const pts = handDraw(ellipseIdeal({ cx: 300, cy: 300, rx: 90, ry: 86, start: seed, clockwise: seed % 2 === 0, sweep: 1.02 }), { seed });
      const s = recognizeShape(pts);
      expectBox(s, "ellipse", { cx: 300, cy: 300, width: 176, height: 176, angle: 0 });
      const e = s as Extract<RecognizedShape, { kind: "ellipse" }>;
      expect(e.width).toBe(e.height);
    }
  });

  it("flat ellipse", () => {
    for (const seed of SEEDS) {
      const pts = handDraw(ellipseIdeal({ cx: 200, cy: 100, rx: 150, ry: 50, start: seed * 0.8, clockwise: seed % 2 === 1 }), { seed });
      expectBox(recognizeShape(pts), "ellipse", { cx: 200, cy: 100, width: 300, height: 100, angle: 0 });
    }
  });

  it("rotated ellipse keeps its rotation", () => {
    const angle = 40 * (Math.PI / 180);
    const pts = handDraw(ellipseIdeal({ cx: 0, cy: 0, rx: 140, ry: 60, angle }), { seed: 4 });
    expectBox(recognizeShape(pts), "ellipse", { cx: 0, cy: 0, width: 280, height: 120, angle });
  });

  it("lopsided circle", () => {
    for (const seed of SEEDS) {
      const pts = handDraw(ellipseIdeal({ cx: 100, cy: 100, rx: 80, ry: 80, lopsided: 0.08, start: seed, sweep: 0.97 }), { seed });
      expectBox(recognizeShape(pts), "ellipse", { cx: 100, cy: 100, width: 160, height: 160 });
    }
  });

  it("circle with overshoot", () => {
    const pts = handDraw(ellipseIdeal({ cx: 0, cy: 0, rx: 100, ry: 100, sweep: 1.12 }), { seed: 11 });
    expectBox(recognizeShape(pts), "ellipse", { cx: 0, cy: 0, width: 200, height: 200 });
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

  it("triangle is neither rectangle nor ellipse", () => {
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
