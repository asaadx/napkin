import { describe, expect, it } from "vitest";
import { summarizeScene } from "./scene";

describe("summarizeScene", () => {
  it("handles missing or malformed scenes", () => {
    expect(summarizeScene(null)).toEqual({ shapeKinds: [], labels: [] });
    expect(summarizeScene({ elements: "nope" })).toEqual({ shapeKinds: [], labels: [] });
  });

  it("skips deleted elements, folds bound text into labels, and spots cylinders", () => {
    const s = summarizeScene({
      elements: [
        { type: "rectangle", id: "a" },
        { type: "text", text: "API  server", containerId: "a" },
        { type: "arrow" },
        { type: "rectangle", isDeleted: true },
        { type: "ellipse", groupIds: ["g1"] },
        { type: "line", groupIds: ["g1"] },
        { type: "text", text: "note to self" },
      ],
    });
    expect(s.shapeKinds).toEqual(["rectangle", "arrow", "cylinder", "text"]);
    expect(s.labels).toEqual(["API server", "note to self"]);
  });
});
