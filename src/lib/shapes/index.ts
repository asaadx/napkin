/**
 * Pure freehand-stroke recognizer. No React, no Excalidraw imports.
 *
 * Philosophy: precision over recall. Every classifier below is a chain of
 * independent sanity checks, and any failed check returns null. A missed
 * conversion costs the user nothing; a wrong one makes the pen feel hostile.
 */

export type Point = { x: number; y: number };

export type RecognizedShape =
  // Center-based so rotation is unambiguous. angle is in radians, clockwise, as in Excalidraw.
  // Snap angle to 0 when within ~10° of axis-aligned (also treat ~90° as 0 with width/height swapped).
  | { kind: "rectangle"; cx: number; cy: number; width: number; height: number; angle: number }
  | { kind: "ellipse"; cx: number; cy: number; width: number; height: number; angle: number }
  | { kind: "line"; start: Point; end: Point }
  | { kind: "arrow"; start: Point; end: Point }; // head is at `end`

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

/** Strokes whose bounding-box diagonal is below this are ignored entirely. */
const MIN_DIAGONAL = 24;
/** Closed shapes must be at least this big (diagonal), so small "o"s stay ink. */
const MIN_CLOSED_DIAGONAL = 50;
/** Points per resampled stroke. */
const N = 128;

/** Line: chord / path length. */
const LINE_MIN_STRAIGHTNESS = 0.97;
/** Line: max perpendicular deviation allowed, as a fraction of the chord (plus 1px). */
const LINE_MAX_DEVIATION = 0.05;
/** Line: any stroke inside this band (fraction of chord, plus 1.5px) counts as straight. */
const LINE_TIGHT_DEVIATION = 0.025;
/** Lines within this angle of horizontal / vertical are snapped. */
const LINE_SNAP = 8 * DEG;

/** Closed: start–end gap (after overshoot trimming) / path length. */
const CLOSED_MAX_GAP = 0.12;
/** Overshoot trimming may discard at most this fraction of the path at each end. */
const OVERSHOOT_WINDOW = 0.15;

/** Ellipse: mean and max |normalized radius - 1|. */
const ELLIPSE_MEAN_ERR = 0.06;
const ELLIPSE_MAX_ERR = 0.22;

/** Rectangle: mean distance to fitted boundary, as a fraction of (a+b)/2 (half-extents). */
const RECT_MEAN_ERR = 0.07;
/** Rectangle: each fitted corner must have ink within this fraction of (a+b). */
const RECT_CORNER_REACH = 0.12;
/** Rectangle: each side must be covered by ink over this fraction of its length. */
const RECT_SIDE_COVERAGE = 0.6;

/** Closed shapes: minor/major and minimum minor extent (px). */
const MIN_ASPECT = 0.06;
const MIN_MINOR = 12;

/** Snap rect/ellipse rotation to axis-aligned within this angle. */
const ROTATION_SNAP = 10 * DEG;
/** Snap to square / circle when |w/h - 1| is within this. */
const ASPECT_SNAP = 0.1;

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(pts: Point[], from = 0, to = pts.length - 1): number {
  let len = 0;
  for (let i = from + 1; i <= to; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push({ x: p.x, y: p.y });
  }
  return out;
}

function bboxDiagonal(pts: Point[]): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

/** Resample a polyline to `n` points evenly spaced by arc length. */
function resample(pts: Point[], n: number): Point[] {
  const total = pathLength(pts);
  if (pts.length < 2 || total === 0) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const step = total / (n - 1);
  const out: Point[] = [{ ...pts[0] }];
  let acc = 0;
  let prev = pts[0];
  let i = 1;
  while (i < pts.length && out.length < n - 1) {
    const cur = pts[i];
    const d = dist(prev, cur);
    if (acc + d >= step && d > 0) {
      const t = (step - acc) / d;
      const q = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) };
      out.push(q);
      prev = q;
      acc = 0;
    } else {
      acc += d;
      prev = cur;
      i++;
    }
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] });
  return out;
}

/** Perpendicular distance from p to the infinite line through a, b. */
function perpDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return dist(p, a);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/** Douglas–Peucker; returns indices of kept vertices. */
function douglasPeucker(pts: Point[], tol: number): number[] {
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = -1, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDistSegment(pts[i], pts[s], pts[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && maxD > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(i);
  return out;
}

/** Distance from p to the segment a-b. */
function perpDistSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Angle between two vectors, in [0, π]. */
function angleBetween(ax: number, ay: number, bx: number, by: number): number {
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la === 0 || lb === 0) return 0;
  const c = (ax * bx + ay * by) / (la * lb);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/**
 * Is pts[from..to] a straight run? Either it stays inside a tight band around
 * its chord (visually straight no matter how it wiggles), or it is both
 * nearly as short as its chord and inside a looser band.
 */
function isStraight(pts: Point[], from: number, to: number): boolean {
  const a = pts[from], b = pts[to];
  const chord = dist(a, b);
  if (chord === 0) return false;
  let maxDev = 0;
  for (let i = from + 1; i < to; i++) maxDev = Math.max(maxDev, perpDist(pts[i], a, b));
  if (maxDev <= LINE_TIGHT_DEVIATION * chord + 1.5) return true;
  if (maxDev > LINE_MAX_DEVIATION * chord + 1) return false;
  // Measure path length on a coarse subsample so per-point jitter doesn't
  // count against straightness, while zigzags and bends still do.
  const step = Math.max(1, Math.round((to - from) / 24));
  let len = 0;
  let prev = a;
  for (let i = from + step; ; i += step) {
    const p = pts[Math.min(i, to)];
    len += dist(prev, p);
    prev = p;
    if (i >= to) break;
  }
  return chord / len >= LINE_MIN_STRAIGHTNESS;
}

/** Signed winding number of the closed polygon `pts` around `c`. */
function winding(pts: Point[], c: Point): { turns: number; backtrack: number } {
  let total = 0;
  let pos = 0, neg = 0;
  let prev = Math.atan2(pts[pts.length - 1].y - c.y, pts[pts.length - 1].x - c.x);
  for (const p of pts) {
    const a = Math.atan2(p.y - c.y, p.x - c.x);
    let d = a - prev;
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    total += d;
    if (d > 0) pos += d;
    else neg -= d;
    prev = a;
  }
  const turns = total / (2 * Math.PI);
  const backtrack = (turns >= 0 ? neg : pos) / Math.max(1e-9, pos + neg);
  return { turns, backtrack };
}

function centroid(pts: Point[]): Point {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}

const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);

/** Normalize a rotation (both shapes are symmetric under a half turn) and snap to axis-aligned. */
function snapRotation(theta: number, width: number, height: number) {
  let t = ((theta % Math.PI) + Math.PI) % Math.PI; // [0, π)
  // A rotation by π/2 is the same shape with width/height swapped.
  if (t >= Math.PI / 2) { t -= Math.PI / 2; [width, height] = [height, width]; }
  // Now t in [0, π/2).
  if (t <= ROTATION_SNAP) return { angle: 0, width, height };
  if (t >= Math.PI / 2 - ROTATION_SNAP) return { angle: 0, width: height, height: width };
  return { angle: t, width, height };
}

function snapAspect(width: number, height: number) {
  const r = width / height;
  if (Math.abs(r - 1) <= ASPECT_SNAP) {
    const s = (width + height) / 2;
    return { width: s, height: s };
  }
  return { width, height };
}

// ---------------------------------------------------------------------------
// Closed shapes
// ---------------------------------------------------------------------------

/**
 * Find the closing of a (nearly) closed stroke, tolerating overshoot past the
 * start corner and undershoot short of it. Returns the trimmed loop, or null.
 */
function findLoop(r: Point[]): Point[] | null {
  const n = r.length;
  const w = Math.floor(n * OVERSHOOT_WINDOW);
  let best = Infinity, bs = 0, be = n - 1;
  for (let s = 0; s <= w; s++) {
    for (let e = n - 1; e >= n - 1 - w; e--) {
      const d = dist(r[s], r[e]);
      // Tiny penalty per trimmed sample so we only trim when it actually helps.
      const score = d + (s + (n - 1 - e)) * 1e-3;
      if (score < best) { best = score; bs = s; be = e; }
    }
  }
  const loop = r.slice(bs, be + 1);
  const len = pathLength(loop);
  if (len === 0) return null;
  if (dist(loop[0], loop[loop.length - 1]) / len > CLOSED_MAX_GAP) return null;
  return loop;
}

function fitEllipse(loop: Point[]): RecognizedShape | null {
  const c0 = centroid(loop);
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of loop) {
    const dx = p.x - c0.x, dy = p.y - c0.y;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cos = Math.cos(theta), sin = Math.sin(theta);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  const uv = loop.map((p) => {
    const dx = p.x - c0.x, dy = p.y - c0.y;
    const u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
    return [u, v] as const;
  });
  const a = (maxU - minU) / 2, b = (maxV - minV) / 2;
  if (a <= 0 || b <= 0) return null;
  if (Math.min(a, b) / Math.max(a, b) < MIN_ASPECT || 2 * Math.min(a, b) < MIN_MINOR) return null;
  const cu = (maxU + minU) / 2, cv = (maxV + minV) / 2;
  let sum = 0, max = 0;
  for (const [u, v] of uv) {
    const e = Math.abs(Math.hypot((u - cu) / a, (v - cv) / b) - 1);
    sum += e;
    if (e > max) max = e;
  }
  if (sum / uv.length > ELLIPSE_MEAN_ERR || max > ELLIPSE_MAX_ERR) return null;

  const cx = c0.x + cu * cos - cv * sin;
  const cy = c0.y + cu * sin + cv * cos;
  const snapped = snapRotation(theta, 2 * a, 2 * b);
  const size = snapAspect(snapped.width, snapped.height);
  const isCircle = size.width === size.height;
  return {
    kind: "ellipse", cx, cy, width: size.width, height: size.height,
    angle: isCircle ? 0 : clean(snapped.angle),
  };
}

function fitRectangle(loop: Point[]): RecognizedShape | null {
  // Orientation: edge directions of a rectangle agree modulo 90°, so average 4φ.
  let sc = 0, ss = 0;
  for (let i = 1; i < loop.length; i++) {
    const dx = loop[i].x - loop[i - 1].x, dy = loop[i].y - loop[i - 1].y;
    const w = Math.hypot(dx, dy);
    if (w === 0) continue;
    const phi = Math.atan2(dy, dx);
    sc += w * Math.cos(4 * phi);
    ss += w * Math.sin(4 * phi);
  }
  // Edges must actually agree; a circle/triangle has no dominant 4-fold direction.
  const totalLen = pathLength(loop);
  if (Math.hypot(sc, ss) / totalLen < 0.45) return null;
  const theta = Math.atan2(ss, sc) / 4;
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const uv = loop.map((p) => [p.x * cos + p.y * sin, -p.x * sin + p.y * cos] as const);

  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [u, v] of uv) {
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  // Refine each side to the median of the ink assigned to it, so wobble and
  // stray overshoot don't inflate the box beyond what the user intended.
  for (let iter = 0; iter < 2; iter++) {
    const sides: number[][] = [[], [], [], []]; // left, right, top, bottom
    for (const [u, v] of uv) {
      const d = [Math.abs(u - minU), Math.abs(u - maxU), Math.abs(v - minV), Math.abs(v - maxV)];
      let k = 0;
      for (let j = 1; j < 4; j++) if (d[j] < d[k]) k = j;
      sides[k].push(k < 2 ? u : v);
    }
    if (sides.some((s) => s.length < 3)) return null;
    const med = sides.map((s) => {
      s.sort((x, y) => x - y);
      return s[Math.floor(s.length / 2)];
    });
    [minU, maxU, minV, maxV] = med;
    if (maxU <= minU || maxV <= minV) return null;
  }

  const a = (maxU - minU) / 2, b = (maxV - minV) / 2;
  if (Math.min(a, b) / Math.max(a, b) < MIN_ASPECT || 2 * Math.min(a, b) < MIN_MINOR) return null;
  const cu = (maxU + minU) / 2, cv = (maxV + minV) / 2;

  // Boundary distance + per-side coverage.
  let sum = 0;
  const cover: [number, number][] = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
  const corners = [[-a, -b], [a, -b], [a, b], [-a, b]];
  const cornerReach = [Infinity, Infinity, Infinity, Infinity];
  for (const [u0, v0] of uv) {
    const u = u0 - cu, v = v0 - cv;
    const ou = Math.abs(u) - a, ov = Math.abs(v) - b;
    const d = ou > 0 || ov > 0 ? Math.hypot(Math.max(ou, 0), Math.max(ov, 0)) : Math.min(-ou, -ov);
    sum += d;
    // Which side is this point on?
    const near = Math.abs(ou) < Math.abs(ov);
    const k = near ? (u < 0 ? 0 : 1) : v < 0 ? 2 : 3;
    const t = k < 2 ? v : u;
    if (t < cover[k][0]) cover[k][0] = t;
    if (t > cover[k][1]) cover[k][1] = t;
    for (let j = 0; j < 4; j++) {
      const cd = Math.hypot(u - corners[j][0], v - corners[j][1]);
      if (cd < cornerReach[j]) cornerReach[j] = cd;
    }
  }
  if (sum / uv.length > RECT_MEAN_ERR * ((a + b) / 2)) return null;
  for (let k = 0; k < 4; k++) {
    const sideLen = k < 2 ? 2 * b : 2 * a;
    if (!(cover[k][1] - cover[k][0] >= RECT_SIDE_COVERAGE * sideLen)) return null;
  }
  if (cornerReach.some((d) => d > RECT_CORNER_REACH * (a + b))) return null;

  const cx = cu * cos - cv * sin;
  const cy = cu * sin + cv * cos;
  const snapped = snapRotation(theta, 2 * a, 2 * b);
  const size = snapAspect(snapped.width, snapped.height);
  return { kind: "rectangle", cx, cy, width: size.width, height: size.height, angle: clean(snapped.angle) };
}

function recognizeClosed(r: Point[]): RecognizedShape | null {
  const loopRaw = findLoop(r);
  if (!loopRaw) return null;
  if (bboxDiagonal(loopRaw) < MIN_CLOSED_DIAGONAL) return null;
  const loop = resample(loopRaw, 96);
  // Must go around exactly once, without doubling back much.
  const { turns, backtrack } = winding(loop, centroid(loop));
  if (Math.abs(Math.round(turns)) !== 1 || Math.abs(turns - Math.round(turns)) > 0.1) return null;
  if (backtrack > 0.06) return null;
  // Rectangle checks demand ink in four corners, which an ellipse never has, so
  // try it first; the ellipse checks reject anything with corners.
  return fitRectangle(loop) ?? fitEllipse(loop);
}

// ---------------------------------------------------------------------------
// Open shapes
// ---------------------------------------------------------------------------

function snapLine(start: Point, end: Point): { start: Point; end: Point } {
  const dx = end.x - start.x, dy = end.y - start.y;
  const a = Math.abs(Math.atan2(dy, dx)); // [0, π]
  if (a <= LINE_SNAP || a >= Math.PI - LINE_SNAP) {
    const y = (start.y + end.y) / 2;
    return { start: { x: start.x, y }, end: { x: end.x, y } };
  }
  if (Math.abs(a - Math.PI / 2) <= LINE_SNAP) {
    const x = (start.x + end.x) / 2;
    return { start: { x, y: start.y }, end: { x, y: end.y } };
  }
  return { start: { ...start }, end: { ...end } };
}

function recognizeOpen(r: Point[]): RecognizedShape | null {
  const n = r.length;
  // The tip (of a line or arrow) is the point farthest from the start: barbs
  // always point back toward the tail, so they can never be farther.
  // A stroke that returns to the tip (tip → barb → tip → barb) may come back
  // a hair farther out, so take the first arrival near the max distance.
  let far = 0;
  for (let i = 0; i < n; i++) far = Math.max(far, dist(r[0], r[i]));
  const near = far - Math.max(4, 0.04 * far);
  let t = 0;
  while (t < n - 1 && dist(r[0], r[t]) < near) t++;
  // The tip is the farthest point of that first arrival run (robust to jitter).
  for (let i = t + 1, best = dist(r[0], r[t]); i < n && dist(r[0], r[i]) >= near; i++) {
    const d = dist(r[0], r[i]);
    if (d > best) { best = d; t = i; }
  }
  if (t < 2 || !isStraight(r, 0, t)) return null;
  const shaft = dist(r[0], r[t]);
  const headLen = pathLength(r, t, n - 1);

  // A line, or a line with a tiny pen-lift tail.
  if (headLen <= 0.08 * shaft) {
    let tailOk = true;
    for (let i = t; i < n; i++) if (dist(r[i], r[t]) > Math.max(0.04 * shaft, 3)) tailOk = false;
    if (!tailOk) return null;
    return { kind: "line", ...snapLine(r[0], r[t]) };
  }

  return detectSingleStrokeHead(r, t, shaft, headLen);
}

function detectSingleStrokeHead(r: Point[], t: number, shaft: number, headLen: number): RecognizedShape | null {
  const tip = r[t];
  // Unit vector pointing from the tip back along the shaft.
  const bx = (r[0].x - tip.x) / shaft, by = (r[0].y - tip.y) / shaft;
  if (headLen > 1.3 * shaft) return null;

  const head = r.slice(t);
  let maxHead = 0;
  for (const p of head) {
    const d = dist(p, tip);
    if (d > maxHead) maxHead = d;
    // Never past the tip, and never sprawling.
    const forward = -((p.x - tip.x) * bx + (p.y - tip.y) * by);
    if (forward > 0.06 * shaft + 2) return null;
    if (d > 0.5 * shaft) return null;
  }
  if (maxHead < 0.08 * shaft || head.length < 3) return null;

  const idx = douglasPeucker(head, 0.12 * maxHead);
  if (idx.length > 5) return null; // tip + at most 4 vertices: B1, tip, B2, (tail)
  const verts = idx.slice(1).map((i) => head[i]);
  const barbs: { len: number; ang: number; side: number }[] = [];
  for (const v of verts) {
    const vx = v.x - tip.x, vy = v.y - tip.y;
    const len = Math.hypot(vx, vy);
    if (len >= 0.5 * maxHead) {
      barbs.push({ len, ang: angleBetween(vx, vy, bx, by), side: Math.sign(bx * vy - by * vx) });
    } else if (v !== verts[verts.length - 1] && len > 0.35 * maxHead) {
      return null; // an intermediate vertex that is neither a barb end nor back at the tip
    }
  }
  if (barbs.length === 0 || barbs.length > 2) return null;
  if (barbs.length === 1) {
    const [b] = barbs;
    if (b.ang < 15 * DEG || b.ang > 60 * DEG || b.len > 0.45 * shaft) return null;
  } else {
    const [b1, b2] = barbs;
    if (b1.side === b2.side || b1.side === 0) return null;
    for (const b of barbs) if (b.ang < 12 * DEG || b.ang > 70 * DEG) return null;
    const ratio = b1.len / b2.len;
    if (ratio < 0.4 || ratio > 2.5) return null;
  }
  // Each DP segment must be a good straight approximation of its ink (DP
  // guarantees ≤ tol), and the head ink must not wander: path ≈ polyline length.
  let poly = 0;
  for (let i = 1; i < idx.length; i++) poly += dist(head[idx[i - 1]], head[idx[i]]);
  if (pathLength(head) > 1.25 * poly + 2) return null;


  return { kind: "arrow", ...snapLine(r[0], tip) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Classify a single freehand stroke (scene coordinates, in drawing order). Return null unless confident. */
export function recognizeShape(points: Point[]): RecognizedShape | null {
  const pts = dedupe(points);
  if (pts.length < 2) return null;
  if (bboxDiagonal(pts) < MIN_DIAGONAL) return null;
  const r = resample(pts, N);
  const len = pathLength(r);
  if (len === 0) return null;

  // Open strokes are tried first: a line/arrow test is cheap and its
  // straightness requirement rules out anything that also looks closed.
  const open = recognizeOpen(r);
  if (open) return open;
  return recognizeClosed(r);
}

/** Second-stroke arrowhead: is `points` a "V"/caret drawn near one end of `line`, pointing outward along it?
 *  Returns which endpoint it caps, or null. Used to upgrade an already-converted line to an arrow. */
export function detectArrowhead(points: Point[], line: { start: Point; end: Point }): "start" | "end" | null {
  const pts = dedupe(points);
  if (pts.length < 3) return null;
  const lineLen = dist(line.start, line.end);
  if (lineLen < MIN_DIAGONAL) return null;
  const diag = bboxDiagonal(pts);
  if (diag < 8) return null;
  const r = resample(pts, 64);

  // Apex = point farthest from the chord between the V's two arm ends.
  const p0 = r[0], p1 = r[r.length - 1];
  let apexI = -1, apexD = -1;
  for (let i = 1; i < r.length - 1; i++) {
    const d = perpDistSegment(r[i], p0, p1);
    if (d > apexD) { apexD = d; apexI = i; }
  }
  if (apexI < 3 || apexI > r.length - 4) return null;
  const apex = r[apexI];
  const arm1 = dist(apex, p0), arm2 = dist(apex, p1);
  if (arm1 < 6 || arm2 < 6) return null;
  const armRatio = arm1 / arm2;
  if (armRatio < 0.4 || armRatio > 2.5) return null;
  // Both arms straight.
  for (const [s, e, len] of [[0, apexI, arm1], [apexI, r.length - 1, arm2]] as const) {
    for (let i = s + 1; i < e; i++) if (perpDistSegment(r[i], r[s], r[e]) > 0.15 * len + 1.5) return null;
    if (pathLength(r, s, e) > 1.15 * len + 2) return null;
  }
  const opening = angleBetween(p0.x - apex.x, p0.y - apex.y, p1.x - apex.x, p1.y - apex.y);
  if (opening < 20 * DEG || opening > 130 * DEG) return null;
  const armAvg = (arm1 + arm2) / 2;
  if (armAvg > 0.6 * lineLen) return null;

  // Direction the V points: from the middle of its open end toward the apex.
  const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const px = apex.x - mid.x, py = apex.y - mid.y;

  let best: "start" | "end" | null = null;
  let bestD = Infinity;
  for (const which of ["start", "end"] as const) {
    const e = which === "end" ? line.end : line.start;
    const o = which === "end" ? line.start : line.end;
    const dx = (e.x - o.x) / lineLen, dy = (e.y - o.y) / lineLen;
    const near = dist(apex, e);
    if (near > Math.max(16, 0.6 * armAvg)) continue;
    if (angleBetween(px, py, dx, dy) > 40 * DEG) continue;
    // Arms must straddle the line.
    const s0 = dx * (p0.y - apex.y) - dy * (p0.x - apex.x);
    const s1 = dx * (p1.y - apex.y) - dy * (p1.x - apex.x);
    if (Math.sign(s0) === Math.sign(s1)) continue;
    if (near < bestD) { bestD = near; best = which; }
  }
  return best;
}
