import { describe, expect, it } from "vitest";
import {
  elementPointsToScene,
  findArrowheadTarget,
  linearEndpoints,
  cylinderBodyPoints,
  normalizeAngle,
  shapeToSkeletons,
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

describe("shapeToSkeletons", () => {
  it("converts a centre-based rectangle to an axis-aligned top-left box", () => {
    const s = shapeToSkeletons({ kind: "rectangle", cx: 100, cy: 60, width: 80, height: 40 }, style);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      type: "rectangle",
      x: 60,
      y: 40,
      width: 80,
      height: 40,
      angle: 0,
      roughness: 1,
      strokeColor: "#1e1e1e",
      strokeWidth: 2,
      opacity: 80,
      backgroundColor: "transparent",
    });
    expect(s[0].groupIds).toBeUndefined();
  });

  it("converts a diamond to an Excalidraw diamond with its bounding box", () => {
    const [d] = shapeToSkeletons({ kind: "diamond", cx: 0, cy: 0, width: -120, height: 80 }, style);
    expect(d).toMatchObject({ type: "diamond", x: -60, y: -40, width: 120, height: 80, angle: 0 });
  });

  it("converts a cylinder to a grouped ellipse (top) and line (sides + bottom arc)", () => {
    const cyl = { kind: "cylinder", cx: 200, cy: 150, width: 160, height: 200, capHeight: 40 } as const;
    const parts = shapeToSkeletons(cyl, style, { groupId: "g1" });
    expect(parts.map((p) => p.type)).toEqual(["ellipse", "line"]);
    const [top, body] = parts;
    expect(top).toMatchObject({ x: 120, y: 50, width: 160, height: 40, angle: 0, groupIds: ["g1"], roughness: 1, strokeColor: "#1e1e1e" });
    expect(body).toMatchObject({ x: 120, y: 70, angle: 0, groupIds: ["g1"], roughness: 1, startArrowhead: null, endArrowhead: null });
    if (body.type !== "line") throw new Error("expected line");
    // Starts at the top of the left side, ends at the top of the right side, and reaches the bottom.
    expect(body.points[0]).toEqual([0, 0]);
    expect(body.points[body.points.length - 1]).toEqual([160, 0]);
    const ys = body.points.map(([, y]) => y);
    const xs = body.points.map(([x]) => x);
    expect(Math.max(...ys)).toBeCloseTo(180, 6); // 200 total - half the cap
    expect(body.height).toBeCloseTo(180, 6);
    expect(body.width).toBe(160);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(160);
    // In scene space the body spans exactly the cylinder's box.
    expect(body.y + Math.max(...ys)).toBeCloseTo(cyl.cy + cyl.height / 2, 6);
  });

  it("gives each cylinder its own group id by default", () => {
    const cyl = { kind: "cylinder", cx: 0, cy: 0, width: 100, height: 120, capHeight: 30 } as const;
    const a = shapeToSkeletons(cyl, style);
    const b = shapeToSkeletons(cyl, style);
    expect(a[0].groupIds).toHaveLength(1);
    expect(a[0].groupIds).toEqual(a[1].groupIds);
    expect(a[0].groupIds).not.toEqual(b[0].groupIds);
  });

  it("converts a line to an origin and relative points", () => {
    const [s] = shapeToSkeletons(
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
    const [s] = shapeToSkeletons(
      { kind: "arrow", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      style,
    );
    expect(s).toMatchObject({ type: "arrow", startArrowhead: null, endArrowhead: "arrow" });
  });
});

describe("cylinderBodyPoints", () => {
  it("traces straight sides joined by the lower half of the cap ellipse", () => {
    const pts = cylinderBodyPoints(100, 150, 30);
    const side = 150 - 30; // side length between the cap's centre line and the bottom ellipse's
    for (const [x, y] of pts) {
      if (y <= side) {
        // On a side: x is exactly 0 or the full width.
        expect(x === 0 || x === 100).toBe(true);
      } else {
        // On the bottom arc: on the ellipse centred (50, side) with radii (50, 15).
        expect(((x - 50) / 50) ** 2 + ((y - side) / 15) ** 2).toBeCloseTo(1, 6);
      }
    }
    // Left side is drawn top to bottom, right side bottom to top.
    const firstArc = pts.findIndex(([, y]) => y > side);
    expect(pts.slice(0, firstArc).every(([x]) => x === 0)).toBe(true);
    expect(pts[pts.length - 1]).toEqual([100, 0]);
  });

  it("degrades to a bare arc when the cylinder is no taller than its cap", () => {
    const pts = cylinderBodyPoints(100, 20, 40);
    expect(Math.max(...pts.map(([, y]) => y))).toBeCloseTo(10, 6);
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
