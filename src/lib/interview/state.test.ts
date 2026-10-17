import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTERVIEW,
  advanceRound,
  clampInterview,
  interviewStorageKey,
  markAsked,
  parseInterview,
  serializeInterview,
} from "./state";

describe("parseInterview", () => {
  it("defaults on missing, corrupt or wrong-shaped input", () => {
    for (const raw of [null, undefined, "", "not json", "[]", "42", "null"]) {
      expect(parseInterview(raw)).toEqual({ round: 1, asked: [], roundStartedAt: {} });
    }
  });

  it("round-trips a saved state", () => {
    const s = { round: 3, asked: ["scale", "availability"], roundStartedAt: { 2: 1000, 3: 2000 } };
    expect(parseInterview(serializeInterview(s))).toEqual(s);
  });

  it("drops bad fields and duplicate ids", () => {
    const raw = JSON.stringify({ round: -2, asked: ["a", 3, "a", "", "b"], roundStartedAt: { 2: "x", foo: 1, 3: 5 } });
    expect(parseInterview(raw)).toEqual({ round: 1, asked: ["a", "b"], roundStartedAt: { 3: 5 } });
  });
});

describe("advanceRound", () => {
  it("moves forward and records the start time", () => {
    const s = advanceRound(DEFAULT_INTERVIEW, 4, 1234);
    expect(s).toEqual({ round: 2, asked: [], roundStartedAt: { 2: 1234 } });
    expect(advanceRound(s, 4, 5678)).toEqual({ round: 3, asked: [], roundStartedAt: { 2: 1234, 3: 5678 } });
  });

  it("caps at the last round without changing state", () => {
    const last = { round: 3, asked: [], roundStartedAt: { 2: 1, 3: 2 } };
    expect(advanceRound(last, 3, 99)).toBe(last);
  });

  it("clamps a stored round past the end", () => {
    expect(advanceRound({ round: 9, asked: [], roundStartedAt: {} }, 3, 1).round).toBe(3);
  });

  it("does not mutate its input", () => {
    const s = { round: 1, asked: [], roundStartedAt: {} };
    advanceRound(s, 3, 1);
    expect(s).toEqual({ round: 1, asked: [], roundStartedAt: {} });
  });
});

describe("markAsked", () => {
  it("appends a new id", () => {
    expect(markAsked(DEFAULT_INTERVIEW, "scale").asked).toEqual(["scale"]);
  });

  it("is idempotent", () => {
    const s = markAsked(DEFAULT_INTERVIEW, "scale");
    expect(markAsked(s, "scale")).toBe(s);
    expect(markAsked(s, "")).toBe(s);
  });
});

describe("clampInterview", () => {
  it("keeps the same object when in range", () => {
    const s = { round: 2, asked: [], roundStartedAt: {} };
    expect(clampInterview(s, 3)).toBe(s);
    expect(clampInterview(s, 1).round).toBe(1);
  });
});

it("uses the agreed storage key", () => {
  expect(interviewStorageKey("url-shortener")).toBe("napkin:interview:url-shortener");
});
