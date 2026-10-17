/**
 * Pure geometry helpers that sit between Excalidraw elements and the shape
 * recognizer in `@/lib/shapes`. No Excalidraw runtime imports here, so this
 * module runs (and is tested) without a browser.
 */
import type { Point, RecognizedShape } from "@/lib/shapes";

type LocalPoint = readonly [number, number];
/** Excalidraw arrowhead style ("arrow", "triangle", ...). */
export type ArrowheadName = string;

/** The subset of an Excalidraw element with a `points` array that we read. */
export type PointsElementLike = {
  x: number;
  y: number;
  angle: number;
  points: readonly LocalPoint[];
};

/** Appearance carried over from the freehand stroke to the converted shape. */
export type StrokeStyle = {
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
};

/**
 * Plain element props, shaped to be accepted by Excalidraw's
 * `convertToExcalidrawElements` (an `ExcalidrawElementSkeleton`).
 */
export type ShapeSkeleton =
  | ({
      type: "rectangle" | "diamond" | "ellipse";
      x: number;
      y: number;
      width: number;
      height: number;
      angle: number;
      roughness: number;
      backgroundColor: string;
      fillStyle: "solid";
      strokeStyle: "solid";
      roundness: { type: number } | null;
      groupIds?: string[];
    } & StrokeStyle)
  | ({
      type: "line" | "arrow";
      x: number;
      y: number;
      width: number;
      height: number;
      angle: number;
      points: [number, number][];
      roughness: number;
      backgroundColor: string;
      fillStyle: "solid";
      strokeStyle: "solid";
      roundness: { type: number } | null;
      startArrowhead: ArrowheadName | null;
      endArrowhead: ArrowheadName | null;
      groupIds?: string[];
    } & StrokeStyle);

const TAU = Math.PI * 2;
/** Excalidraw's ROUNDNESS.ADAPTIVE_RADIUS (rectangles) and PROPORTIONAL_RADIUS (lines, diamonds). */
const ROUNDNESS_ADAPTIVE = 3;
const ROUNDNESS_PROPORTIONAL = 2;

export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const a = angle % TAU;
  return a < 0 ? a + TAU : a;
}

function rotate(p: Point, c: Point, angle: number): Point {
  if (!angle) return p;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/**
 * Excalidraw stores `points` relative to the element's x/y and rotates the
 * element around the centre of the points' bounding box. Returns the points in
 * scene coordinates, in drawing order.
 */
export function elementPointsToScene(el: PointsElementLike): Point[] {
  if (el.points.length === 0) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of el.points) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  const center = { x: el.x + (minX + maxX) / 2, y: el.y + (minY + maxY) / 2 };
  return el.points.map(([px, py]) =>
    rotate({ x: el.x + px, y: el.y + py }, center, el.angle),
  );
}

/** First and last point of a line/arrow element, in scene coordinates. */
export function linearEndpoints(el: PointsElementLike): { start: Point; end: Point } | null {
  if (el.points.length < 2) return null;
  const scene = elementPointsToScene(el);
  return { start: scene[0], end: scene[scene.length - 1] };
}

/** Segments used to trace the bottom arc of a cylinder. */
const CYLINDER_ARC_SEGMENTS = 8;

/**
 * The open outline of a cylinder's body, relative to the top of its left
 * side: down the left side, along the lower half of the bottom ellipse, and
 * up the right side. Drawn as a curved line, so the points next to each
 * side/arc junction are spaced like the arc's own points; uneven spacing makes
 * the curve overshoot into a hook there.
 */
export function cylinderBodyPoints(width: number, height: number, capHeight: number): [number, number][] {
  const rx = width / 2;
  const ry = Math.min(capHeight, height) / 2;
  const side = Math.max(0, height - 2 * ry);
  const arc: [number, number][] = [];
  for (let i = 0; i <= CYLINDER_ARC_SEGMENTS; i++) {
    const t = Math.PI - (Math.PI * i) / CYLINDER_ARC_SEGMENTS; // left (π) → bottom (π/2) → right (0)
    arc.push([rx + rx * Math.cos(t), side + ry * Math.sin(t)]);
  }
  const chord = Math.hypot(arc[1][0] - arc[0][0], arc[1][1] - arc[0][1]);
  const pts: [number, number][] = [];
  if (side > 0) pts.push([0, 0]);
  if (side > 2 * chord) pts.push([0, side - chord]);
  pts.push(...arc);
  if (side > 2 * chord) pts.push([width, side - chord]);
  if (side > 0) pts.push([width, 0]);
  return pts.map(([x, y]) => [clean(x), clean(y)]);
}

const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);

function randomGroupId(): string {
  return `cyl-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/**
 * Converts a recognized shape (centre-based, scene coordinates) into the
 * Excalidraw element props that draw it. Box shapes become one element; a
 * cylinder becomes an ellipse (the top) plus a line (sides and bottom arc)
 * sharing one group id, so it selects and moves as one shape.
 */
export function shapeToSkeletons(
  shape: RecognizedShape,
  style: StrokeStyle,
  options: { groupId?: string } = {},
): ShapeSkeleton[] {
  const common = {
    strokeColor: style.strokeColor,
    strokeWidth: style.strokeWidth,
    opacity: style.opacity,
    roughness: 1,
    backgroundColor: "transparent",
    fillStyle: "solid" as const,
    strokeStyle: "solid" as const,
  };

  if (shape.kind === "rectangle" || shape.kind === "diamond") {
    const width = Math.abs(shape.width);
    const height = Math.abs(shape.height);
    return [
      {
        ...common,
        type: shape.kind,
        x: shape.cx - width / 2,
        y: shape.cy - height / 2,
        width,
        height,
        angle: 0,
        roundness: { type: shape.kind === "rectangle" ? ROUNDNESS_ADAPTIVE : ROUNDNESS_PROPORTIONAL },
      },
    ];
  }

  if (shape.kind === "cylinder") {
    const width = Math.abs(shape.width);
    const height = Math.abs(shape.height);
    const capHeight = Math.min(Math.abs(shape.capHeight), height);
    const left = shape.cx - width / 2;
    const top = shape.cy - height / 2;
    const groupIds = [options.groupId ?? randomGroupId()];
    const points = cylinderBodyPoints(width, height, capHeight);
    let maxY = 0;
    for (const [, y] of points) maxY = Math.max(maxY, y);
    return [
      {
        ...common,
        type: "ellipse",
        x: left,
        y: top,
        width,
        height: capHeight,
        angle: 0,
        roundness: null,
        groupIds,
      },
      {
        ...common,
        type: "line",
        x: left,
        y: top + capHeight / 2,
        width,
        height: maxY,
        angle: 0,
        points,
        roundness: { type: ROUNDNESS_PROPORTIONAL },
        startArrowhead: null,
        endArrowhead: null,
        groupIds,
      },
    ];
  }

  return [
    linearSkeleton(shape.kind, shape.start, shape.end, common, {
      startArrowhead: null,
      endArrowhead: shape.kind === "arrow" ? "arrow" : null,
    }),
  ];
}

/** Builds line/arrow props from two scene-space endpoints. */
export function linearSkeleton(
  type: "line" | "arrow",
  start: Point,
  end: Point,
  appearance: StrokeStyle & { roughness?: number },
  heads: { startArrowhead: ArrowheadName | null; endArrowhead: ArrowheadName | null },
): Extract<ShapeSkeleton, { type: "line" | "arrow" }> {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return {
    strokeColor: appearance.strokeColor,
    strokeWidth: appearance.strokeWidth,
    opacity: appearance.opacity,
    roughness: appearance.roughness ?? 1,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeStyle: "solid",
    type,
    x: start.x,
    y: start.y,
    width: Math.abs(dx),
    height: Math.abs(dy),
    angle: 0,
    points: [
      [0, 0],
      [dx, dy],
    ],
    roundness: { type: ROUNDNESS_PROPORTIONAL },
    startArrowhead: heads.startArrowhead,
    endArrowhead: heads.endArrowhead,
  };
}

export type ArrowheadCandidate = {
  id: string;
  start: Point;
  end: Point;
};

export type ArrowheadMatch = {
  id: string;
  side: "start" | "end";
};

function bounds(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Distance from a point to an axis-aligned box (0 if inside). */
function distanceToBox(p: Point, b: ReturnType<typeof bounds>): number {
  const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX);
  const dy = Math.max(b.minY - p.y, 0, p.y - b.maxY);
  return Math.hypot(dx, dy);
}

/**
 * Picks which line (if any) a new stroke is an arrowhead for. The `preferred`
 * candidate (the most recently converted line) is tried first regardless of
 * distance; every other candidate must have an endpoint within `maxGap` of the
 * stroke's bounding box. Nearer candidates are tried first.
 */
export function findArrowheadTarget(
  stroke: Point[],
  candidates: ArrowheadCandidate[],
  detect: (points: Point[], line: { start: Point; end: Point }) => "start" | "end" | null,
  options: { preferredId?: string | null; maxGap?: number } = {},
): ArrowheadMatch | null {
  if (stroke.length < 2 || candidates.length === 0) return null;
  const box = bounds(stroke);
  const size = Math.hypot(box.maxX - box.minX, box.maxY - box.minY);
  const maxGap = options.maxGap ?? Math.max(24, size);

  const scored = candidates
    .map((c) => ({
      c,
      gap: Math.min(distanceToBox(c.start, box), distanceToBox(c.end, box)),
    }))
    .filter(({ c, gap }) => c.id === options.preferredId || gap <= maxGap)
    .sort((a, b) => {
      if (a.c.id === options.preferredId) return -1;
      if (b.c.id === options.preferredId) return 1;
      return a.gap - b.gap;
    });

  for (const { c } of scored) {
    const side = detect(stroke, { start: c.start, end: c.end });
    if (side) return { id: c.id, side };
  }
  return null;
}
