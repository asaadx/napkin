/**
 * Pure freehand-stroke recognizer. No React, no Excalidraw imports.
 *
 * Recognized set: rectangle, diamond, database cylinder, line, arrow. Loops,
 * circles and everything else stay as ink.
 *
 * Philosophy: precision over recall. Every classifier below is a chain of
 * independent sanity checks, and any failed check returns null. A missed
 * conversion costs the user nothing; a wrong one makes the pen feel hostile.
 */

export type Point = { x: number; y: number };

/** A database cylinder: a top ellipse `capHeight` tall, vertical sides and a matching bottom arc. */
export type CylinderShape = {
  kind: "cylinder";
  /** Centre of the whole cylinder's (axis-aligned) bounding box. */
  cx: number;
  cy: number;
  width: number;
  /** Total height, from the top of the cap to the bottom of the lower arc. */
  height: number;
  /** Height of the top ellipse (also the depth of the bottom arc, doubled). */
  capHeight: number;
};

export type RecognizedShape =
  // Box shapes are centre-based and always axis-aligned.
  | { kind: "rectangle"; cx: number; cy: number; width: number; height: number }
  | { kind: "diamond"; cx: number; cy: number; width: number; height: number }
  | CylinderShape
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

/** Rectangle: mean distance to fitted boundary, as a fraction of (a+b)/2 (half-extents). */
const RECT_MEAN_ERR = 0.07;
/** Rectangle: each fitted corner must have ink within this fraction of (a+b). */
const RECT_CORNER_REACH = 0.12;
/** Rectangle: each side must be covered by ink over this fraction of its length. */
const RECT_SIDE_COVERAGE = 0.6;
/** Rectangle: boxes tilted up to this much are straightened; beyond it, null (or a diamond). */
const RECT_MAX_TILT = 25 * DEG;

/** Diamond: each vertex must sit within this fraction of the box's extent from its side's midpoint. */
const DIAMOND_VERTEX_OFFSET = 0.1;
/** Diamond: mean / max distance to the fitted rhombus, as a fraction of the centre-to-edge distance. */
const DIAMOND_MEAN_ERR = 0.08;
const DIAMOND_MAX_ERR = 0.25;
/** Diamond: each edge must be covered by ink over this fraction of its length. */
const DIAMOND_EDGE_COVERAGE = 0.6;

/** Closed shapes: minor/major and minimum minor extent (px). */
const MIN_ASPECT = 0.06;
const MIN_MINOR = 12;

/** Two-stroke cylinder: minimum cap width (px). */
const CYL_MIN_WIDTH = 40;

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

// ---------------------------------------------------------------------------
// Closed shapes
// ---------------------------------------------------------------------------

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function bbox(pts: Point[]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Approximate distance from (u, v) to the axis-aligned ellipse with radii
 * (a, b) centred at the origin (Sampson distance: first-order, but accurate
 * near the curve, which is all a tolerance check needs).
 */
function ellipseDistance(u: number, v: number, a: number, b: number): number {
  const f = (u / a) ** 2 + (v / b) ** 2 - 1;
  const g = 2 * Math.hypot(u / (a * a), v / (b * b));
  return g === 0 ? Math.min(a, b) : Math.abs(f) / g;
}

/** Distance from (u, v) to the boundary of the axis-aligned rectangle with half-extents (a, b). */
function rectDistance(u: number, v: number, a: number, b: number): number {
  const ou = Math.abs(u) - a, ov = Math.abs(v) - b;
  return ou > 0 || ov > 0 ? Math.hypot(Math.max(ou, 0), Math.max(ov, 0)) : Math.min(-ou, -ov);
}

/** Distance from (u, v) to the boundary of a rectangle with half-extents (a, b) and corner radius r. */
function roundedRectDistance(u: number, v: number, a: number, b: number, r: number): number {
  const qx = Math.abs(u) - (a - r), qy = Math.abs(v) - (b - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return Math.abs(outside + Math.min(Math.max(qx, qy), 0) - r);
}

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

/** A closed stroke that goes around exactly once without doubling back. Returns it resampled, or null. */
function closedLoop(r: Point[], minDiagonal: number): Point[] | null {
  const loopRaw = findLoop(r);
  if (!loopRaw) return null;
  if (bboxDiagonal(loopRaw) < minDiagonal) return null;
  const loop = resample(loopRaw, 96);
  const { turns, backtrack } = winding(loop, centroid(loop));
  if (Math.abs(Math.round(turns)) !== 1 || Math.abs(turns - Math.round(turns)) > 0.1) return null;
  if (backtrack > 0.06) return null;
  return loop;
}

/** A box, possibly drawn tilted by up to RECT_MAX_TILT; always returned axis-aligned. */
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
  const theta = Math.atan2(ss, sc) / 4; // (-45°, 45°]
  if (Math.abs(theta) > RECT_MAX_TILT) return null;
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
    sum += rectDistance(u, v, a, b);
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

  // Straighten: keep the drawn side lengths, drop the tilt.
  const cx = cu * cos - cv * sin;
  const cy = cu * sin + cv * cos;
  return { kind: "rectangle", cx: clean(cx), cy: clean(cy), width: 2 * a, height: 2 * b };
}

/** A rhombus whose four corners sit at the midpoints of its bounding box's sides. */
function fitDiamond(loop: Point[]): RecognizedShape | null {
  const box = bbox(loop);
  const W = box.maxX - box.minX, H = box.maxY - box.minY;
  if (Math.min(W, H) / Math.max(W, H) < 0.2 || Math.min(W, H) < 2 * MIN_MINOR) return null;
  const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
  const a = W / 2, b = H / 2;

  // The extreme ink in each direction is a vertex, and must be near that side's midpoint.
  let top = loop[0], bottom = loop[0], left = loop[0], right = loop[0];
  for (const p of loop) {
    if (p.y < top.y) top = p;
    if (p.y > bottom.y) bottom = p;
    if (p.x < left.x) left = p;
    if (p.x > right.x) right = p;
  }
  if (Math.abs(top.x - cx) > DIAMOND_VERTEX_OFFSET * W) return null;
  if (Math.abs(bottom.x - cx) > DIAMOND_VERTEX_OFFSET * W) return null;
  if (Math.abs(left.y - cy) > DIAMOND_VERTEX_OFFSET * H) return null;
  if (Math.abs(right.y - cy) > DIAMOND_VERTEX_OFFSET * H) return null;

  // Every point near the rhombus |u|/a + |v|/b = 1, and all four edges inked.
  const k = (a * b) / Math.hypot(a, b); // centre-to-edge distance
  let sum = 0, max = 0;
  const cover: [number, number][] = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
  for (const p of loop) {
    const u = p.x - cx, v = p.y - cy;
    const d = Math.abs(Math.abs(u) / a + Math.abs(v) / b - 1) * k;
    sum += d;
    if (d > max) max = d;
    const q = (u >= 0 ? 0 : 1) + (v >= 0 ? 2 : 0);
    const t = Math.abs(u) / a; // 0 at the top/bottom vertex, 1 at the left/right vertex
    if (t < cover[q][0]) cover[q][0] = t;
    if (t > cover[q][1]) cover[q][1] = t;
  }
  if (sum / loop.length > DIAMOND_MEAN_ERR * k || max > DIAMOND_MAX_ERR * k) return null;
  if (cover.some(([lo, hi]) => !(hi - lo >= DIAMOND_EDGE_COVERAGE))) return null;
  return { kind: "diamond", cx, cy, width: W, height: H };
}

/**
 * Single-stroke "can": a closed outline with straight vertical sides and a
 * convex elliptical arc at the top and bottom. Must fit that model clearly
 * better than both a plain rectangle and a plain ellipse.
 */
function fitCan(loop: Point[]): CylinderShape | null {
  const box = bbox(loop);
  const W = box.maxX - box.minX, H = box.maxY - box.minY;
  if (W < CYL_MIN_WIDTH || H < 0.5 * W || H > 4 * W) return null;
  const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
  const a = W / 2;
  const scale = (W + H) / 4;

  const canDist = (p: Point, c: number) => {
    const u = p.x - cx;
    const yt = box.minY + c, yb = box.maxY - c;
    if (p.y < yt) return ellipseDistance(u, p.y - yt, a, c);
    if (p.y > yb) return ellipseDistance(u, p.y - yb, a, c);
    return Math.min(Math.abs(u + a), Math.abs(u - a));
  };
  const cMin = 0.1 * W, cMax = Math.min(0.4 * W, 0.32 * H);
  if (cMax <= cMin) return null;
  let bestC = cMin, bestMean = Infinity;
  for (let i = 0; i <= 24; i++) {
    const c = cMin + ((cMax - cMin) * i) / 24;
    let s = 0;
    for (const p of loop) s += canDist(p, c);
    if (s / loop.length < bestMean) { bestMean = s / loop.length; bestC = c; }
  }
  const c = bestC;
  // The caps must visibly curve, and not be a pill's semicircles.
  if (c < 0.13 * W || c > cMax - (cMax - cMin) / 24 + 1e-9) return null;
  if (bestMean > 0.03 * scale) return null;
  let max = 0;
  for (const p of loop) max = Math.max(max, canDist(p, c));
  if (max > 0.12 * scale) return null;

  // Both sides inked along most of the straight band.
  const yt = box.minY + c, yb = box.maxY - c;
  const band = yb - yt;
  if (band < 0.35 * H) return null;
  const sideCover = [[Infinity, -Infinity], [Infinity, -Infinity]];
  for (const p of loop) {
    if (p.y < yt || p.y > yb) continue;
    const s = p.x < cx ? 0 : 1;
    sideCover[s][0] = Math.min(sideCover[s][0], p.y);
    sideCover[s][1] = Math.max(sideCover[s][1], p.y);
  }
  if (sideCover.some(([lo, hi]) => !(hi - lo >= 0.7 * band))) return null;

  // Clearly better than the nearest ellipse, and, judged on the caps alone
  // (where the two models differ), than the nearest rounded rectangle.
  const b = H / 2;
  let ellMean = 0;
  for (const p of loop) ellMean += ellipseDistance(p.x - cx, p.y - cy, a, b);
  ellMean /= loop.length;
  const capPts = loop.filter((p) => p.y < yt || p.y > yb);
  let canCap = 0;
  for (const p of capPts) canCap += canDist(p, c) ** 2;
  let rectCap = Infinity;
  for (let i = 0; i <= 24; i++) {
    const rr = (Math.min(a, b) * i) / 24;
    let s = 0;
    for (const p of capPts) s += roundedRectDistance(p.x - cx, p.y - cy, a, b, rr) ** 2;
    rectCap = Math.min(rectCap, s);
  }
  const rectRatio = Math.sqrt(rectCap / Math.max(1e-9, canCap));
  if (rectRatio < 1.1 || ellMean < 2 * bestMean) return null;

  // Caps sag toward the sides (a box's flat top and bottom don't).
  const sags: [number[], number[]] = [[], []];
  for (const p of loop) {
    const t = Math.abs(p.x - cx) / a;
    if (t < 0.65 || t > 0.9) continue;
    if (p.y < yt) sags[0].push(p.y - box.minY);
    else if (p.y > yb) sags[1].push(box.maxY - p.y);
  }
  for (const s of sags) {
    if (s.length < 2) return null;
    s.sort((x, y) => x - y);
    const median = s[Math.floor(s.length / 2)];
    if (median < Math.max(0.25 * c, 0.04 * W)) return null;
  }

  return { kind: "cylinder", cx, cy, width: W, height: H, capHeight: 2 * c };
}

function recognizeClosed(r: Point[]): RecognizedShape | null {
  const loop = closedLoop(r, MIN_CLOSED_DIAGONAL);
  if (!loop) return null;
  // Each fitter demands features the others' shapes lack (vertices at the
  // side midpoints; straight sides with curved caps; four corners), so the
  // order only matters for borderline input.
  return fitDiamond(loop) ?? fitCan(loop) ?? fitRectangle(loop);
}

// ---------------------------------------------------------------------------
// Two-stroke cylinder
// ---------------------------------------------------------------------------

type Cap = Box & { cx: number; cy: number; rx: number; ry: number };

/** A flat, roughly elliptical, axis-aligned loop: the top of a cylinder. */
function asCap(points: Point[]): Cap | null {
  const pts = dedupe(points);
  if (pts.length < 3 || bboxDiagonal(pts) < CYL_MIN_WIDTH) return null;
  const loop = closedLoop(resample(pts, N), CYL_MIN_WIDTH);
  if (!loop) return null;
  const box = bbox(loop);
  const rx = (box.maxX - box.minX) / 2, ry = (box.maxY - box.minY) / 2;
  if (2 * rx < CYL_MIN_WIDTH || ry / rx < 0.08 || ry / rx > 0.7) return null;
  const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
  const scale = (rx + ry) / 2;
  let sum = 0, max = 0;
  for (const p of loop) {
    const d = ellipseDistance(p.x - cx, p.y - cy, rx, ry);
    sum += d;
    if (d > max) max = d;
  }
  if (sum / loop.length > 0.08 * scale || max > 0.3 * scale) return null;
  return { ...box, cx, cy, rx, ry };
}

/** Fraction of movement along an axis that goes the wrong way. */
function backtrackRatio(pts: Point[], from: number, to: number, axis: "x" | "y", sign: 1 | -1): number {
  let good = 0, bad = 0;
  for (let i = from + 1; i <= to; i++) {
    const d = (pts[i][axis] - pts[i - 1][axis]) * sign;
    if (d > 0) good += d;
    else bad -= d;
  }
  return bad / Math.max(1e-9, good + bad);
}

/** A "U" hanging from the cap's left and right extremes: the sides and bottom of a cylinder. Returns its lowest y. */
function asBody(points: Point[], cap: Cap): number | null {
  const pts = dedupe(points);
  if (pts.length < 3) return null;
  const r = resample(pts, 64);
  // Orient it to run left side → bottom → right side.
  const path = r[0].x <= r[r.length - 1].x ? r : [...r].reverse();
  const n = path.length;
  const L = path[0], R = path[n - 1];
  const W = 2 * cap.rx;
  const tolX = 0.2 * W, tolY = cap.ry + 0.15 * W;
  if (Math.abs(L.x - cap.minX) > tolX || Math.abs(R.x - cap.maxX) > tolX) return null;
  if (Math.abs(L.y - cap.cy) > tolY || Math.abs(R.y - cap.cy) > tolY) return null;

  const box = bbox(path);
  if (box.minX < cap.minX - tolX || box.maxX > cap.maxX + tolX) return null;
  if (box.minY < cap.minY - 0.15 * W) return null;
  const bottom = box.maxY;
  const D = bottom - cap.cy;
  if (D < Math.max(1.8 * cap.ry, 0.25 * W, 20) || D > 5 * W) return null;

  // Down, across, up: the lowest point splits it into two monotone halves.
  let k = 0;
  for (let i = 1; i < n; i++) if (path[i].y > path[k].y) k = i;
  if (k < 0.15 * n || k > 0.85 * n) return null;
  if (backtrackRatio(path, 0, k, "y", 1) > 0.2) return null;
  if (backtrackRatio(path, k, n - 1, "y", -1) > 0.2) return null;
  if (backtrackRatio(path, 0, n - 1, "x", 1) > 0.25) return null;

  // Vertical sides: each half crosses two depth levels at about the same x, far apart.
  const xAt = (from: number, to: number, step: 1 | -1, level: number) => {
    for (let i = from; i !== to; i += step) if (path[i].y >= level) return path[i].x;
    return path[to].x;
  };
  const lvl = (f: number) => cap.cy + f * D;
  const l1 = xAt(0, k, 1, lvl(0.2)), l2 = xAt(0, k, 1, lvl(0.6));
  const r1 = xAt(n - 1, k, -1, lvl(0.2)), r2 = xAt(n - 1, k, -1, lvl(0.6));
  if (Math.abs(l1 - l2) > 0.1 * W || Math.abs(r1 - r2) > 0.1 * W) return null;
  if (r2 - l2 < 0.85 * W) return null;

  // Not a scribble.
  if (pathLength(path) > 1.5 * (2 * D + W)) return null;
  return bottom;
}

function pairCylinder(capPts: Point[], bodyPts: Point[]): CylinderShape | null {
  const cap = asCap(capPts);
  if (!cap) return null;
  const bottom = asBody(bodyPts, cap);
  if (bottom === null) return null;
  const top = cap.minY;
  return {
    kind: "cylinder",
    cx: cap.cx,
    cy: (top + bottom) / 2,
    width: 2 * cap.rx,
    height: bottom - top,
    capHeight: 2 * cap.ry,
  };
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

/**
 * Two-stroke database cylinder: one stroke is a flat loop (the top ellipse),
 * the other a "U" whose ends land near the loop's left and right extremes and
 * that hangs below it. Either drawing order works. Returns null unless confident.
 */
export function detectCylinder(a: Point[], b: Point[]): CylinderShape | null {
  return pairCylinder(a, b) ?? pairCylinder(b, a);
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
