import { describe, expect, it } from "vitest";
import {
  elementPointsToScene,
  findArrowheadTarget,
  linearEndpoints,
  normalizeAngle,
  shapeToSkeleton,
} from "./convert";

const style = { strokeColor: "#1e1e1e", strokeWidth: 2, opacity: 80 };

function close(a: { x: number; y: number }, b: { x: number; y: number }) {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
}

describe("elementPointsToScene", () => {
  it("offsets relative points by the element origin", () => {
    const pts = elementPointsToScene({
      x: 100,
      y: 50,
      angle: 0,
      points: [
        [0, 0],
        [10, -5],
        [-4, 20],
      ],
    });
    expect(pts).toEqual([
      { x: 100, y: 50 },
      { x: 110, y: 45 },
      { x: 96, y: 70 },
    ]);
  });

  it("rotates around the centre of the points' bounding box", () => {
    // Box spans x 0..20, y 0..10 -> centre (10, 5) relative, (110, 105) in scene.
    const pts = elementPointsToScene({
      x: 100,
      y: 100,
      angle: Math.PI / 2,
      points: [
        [0, 0],
        [20, 10],
      ],
    });
    // 90deg clockwise (y-down): (-10,-5) -> (5,-10); (10,5) -> (-5,10)
    close(pts[0], { x: 115, y: 95 });
    close(pts[1], { x: 105, y: 115 });
  });

  it("handles an empty stroke", () => {
    expect(elementPointsToScene({ x: 0, y: 0, angle: 0, points: [] })).toEqual([]);
  });
});

describe("linearEndpoints", () => {
  it("returns first and last scene points", () => {
    expect(
      linearEndpoints({
        x: 5,
        y: 5,
        angle: 0,
        points: [
          [0, 0],
          [3, 3],
          [10, 0],
        ],
      }),
    ).toEqual({ start: { x: 5, y: 5 }, end: { x: 15, y: 5 } });
  });

  it("is null for fewer than two points", () => {
    expect(linearEndpoints({ x: 0, y: 0, angle: 0, points: [[0, 0]] })).toBeNull();
  });
});

describe("shapeToSkeleton", () => {
  it("converts a centre-based rectangle to top-left + angle", () => {
    const s = shapeToSkeleton(
      { kind: "rectangle", cx: 100, cy: 60, width: 80, height: 40, angle: 0.3 },
      style,
    );
    expect(s).toMatchObject({
      type: "rectangle",
      x: 60,
      y: 40,
      width: 80,
      height: 40,
      angle: 0.3,
      roughness: 1,
      strokeColor: "#1e1e1e",
      strokeWidth: 2,
      opacity: 80,
      backgroundColor: "transparent",
    });
  });

  it("normalizes negative angles and sizes for ellipses", () => {
    const s = shapeToSkeleton(
      { kind: "ellipse", cx: 0, cy: 0, width: -20, height: 10, angle: -Math.PI / 2 },
      style,
    );
    expect(s.type).toBe("ellipse");
    expect(s.width).toBe(20);
    expect(s.x).toBe(-10);
    expect(s.y).toBe(-5);
    expect(s.angle).toBeCloseTo((3 * Math.PI) / 2, 9);
  });

  it("converts a line to an origin and relative points", () => {
    const s = shapeToSkeleton(
      { kind: "line", start: { x: 10, y: 20 }, end: { x: -30, y: 50 } },
      style,
    );
    expect(s).toMatchObject({
      type: "line",
      x: 10,
      y: 20,
      width: 40,
      height: 30,
      points: [
        [0, 0],
        [-40, 30],
      ],
      startArrowhead: null,
      endArrowhead: null,
    });
  });

  it("gives an arrow its head at the end", () => {
    const s = shapeToSkeleton(
      { kind: "arrow", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      style,
    );
    expect(s).toMatchObject({ type: "arrow", startArrowhead: null, endArrowhead: "arrow" });
  });
});

describe("normalizeAngle", () => {
  it("wraps into [0, 2pi)", () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0, 9);
    expect(normalizeAngle(-0.5)).toBeCloseTo(2 * Math.PI - 0.5, 9);
    expect(normalizeAngle(Number.NaN)).toBe(0);
  });
});

describe("findArrowheadTarget", () => {
  const near = { id: "near", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
  const far = { id: "far", start: { x: 1000, y: 1000 }, end: { x: 1100, y: 1000 } };
  // A small "<"-ish stroke at x≈100.
  const stroke = [
    { x: 90, y: -10 },
    { x: 100, y: 0 },
    { x: 90, y: 10 },
  ];

  it("returns the first candidate the detector accepts", () => {
    const seen: string[] = [];
    const match = findArrowheadTarget(stroke, [far, near], (_p, line) => {
      seen.push(line.start.x === 0 ? "near" : "far");
      return "end";
    });
    expect(match).toEqual({ id: "near", side: "end" });
    expect(seen).toEqual(["near"]); // far is out of range and never asked
  });

  it("tries the preferred (recent) line first even when far away", () => {
    const match = findArrowheadTarget(stroke, [near, far], () => "start", {
      preferredId: "far",
    });
    expect(match).toEqual({ id: "far", side: "start" });
  });

  it("returns null when the detector rejects everything", () => {
    expect(findArrowheadTarget(stroke, [near], () => null)).toBeNull();
    expect(findArrowheadTarget(stroke, [], () => "end")).toBeNull();
  });
});
