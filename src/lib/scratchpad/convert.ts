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
      type: "rectangle" | "ellipse";
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
    } & StrokeStyle);

const TAU = Math.PI * 2;
/** Excalidraw's ROUNDNESS.ADAPTIVE_RADIUS (rectangles) and PROPORTIONAL_RADIUS (lines). */
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

/**
 * Converts a recognized shape (centre-based, scene coordinates) into Excalidraw
 * element props (top-left of the unrotated box plus angle; linear elements as
 * an origin plus relative points).
 */
export function shapeToSkeleton(shape: RecognizedShape, style: StrokeStyle): ShapeSkeleton {
  const common = {
    strokeColor: style.strokeColor,
    strokeWidth: style.strokeWidth,
    opacity: style.opacity,
    roughness: 1,
    backgroundColor: "transparent",
    fillStyle: "solid" as const,
    strokeStyle: "solid" as const,
  };

  if (shape.kind === "rectangle" || shape.kind === "ellipse") {
    const width = Math.abs(shape.width);
    const height = Math.abs(shape.height);
    return {
      ...common,
      type: shape.kind,
      x: shape.cx - width / 2,
      y: shape.cy - height / 2,
      width,
      height,
      angle: normalizeAngle(shape.angle),
      roundness: shape.kind === "rectangle" ? { type: ROUNDNESS_ADAPTIVE } : null,
    };
  }

  return linearSkeleton(shape.kind, shape.start, shape.end, common, {
    startArrowhead: null,
    endArrowhead: shape.kind === "arrow" ? "arrow" : null,
  });
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
