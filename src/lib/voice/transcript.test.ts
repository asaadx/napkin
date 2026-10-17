import { describe, expect, it } from "vitest";
import {
  formatElapsed,
  initialTranscript,
  parseSegments,
  transcriptReducer,
  type RecognitionResult,
  type TranscriptAction,
  type TranscriptState,
} from "./transcript";
import { speechErrorMessage } from "./speech";

const run = (actions: TranscriptAction[], from: TranscriptState = initialTranscript) =>
  actions.reduce(transcriptReducer, from);

const fin = (transcript: string): RecognitionResult => ({ transcript, isFinal: true });
const tmp = (transcript: string): RecognitionResult => ({ transcript, isFinal: false });
const result = (sessionId: number, atMs: number, ...results: RecognitionResult[]) =>
  ({ type: "result", sessionId, atMs, results }) as const;

describe("transcriptReducer", () => {
  it("shows interim text, then commits it once final", () => {
    const s1 = run([
      { type: "sessionStart", sessionId: 1 },
      result(1, 500, tmp("we need a")),
      result(1, 900, tmp("we need a load balancer")),
    ]);
    expect(s1.segments).toEqual([]);
    expect(s1.interim).toBe("we need a load balancer");

    const s2 = run([result(1, 1400, fin(" We need a load balancer."))], s1);
    expect(s2.segments).toEqual([{ text: "We need a load balancer.", startedAtMs: 500 }]);
    expect(s2.interim).toBe("");
  });

  it("does not re-commit finals when later events repeat the full result list", () => {
    const s = run([
      { type: "sessionStart", sessionId: 1 },
      result(1, 100, fin("first")),
      result(1, 200, fin("first"), tmp("sec")),
      result(1, 300, fin("first"), fin("second")),
      result(1, 400, fin("first"), fin("second"), tmp("third")),
    ]);
    expect(s.segments.map((x) => x.text)).toEqual(["first", "second"]);
    expect(s.segments[1].startedAtMs).toBe(200);
    expect(s.interim).toBe("third");
  });

  it("keeps result indexes per session across an auto-restart", () => {
    const s = run([
      { type: "sessionStart", sessionId: 1 },
      result(1, 100, fin("use a hash")),
      { type: "sessionEnd", sessionId: 1, atMs: 60_000 },
      { type: "sessionStart", sessionId: 2 },
      result(2, 61_000, tmp("then base62")),
      result(2, 62_000, fin("then base62 encode it")),
    ]);
    expect(s.segments).toEqual([
      { text: "use a hash", startedAtMs: 100 },
      { text: "then base62 encode it", startedAtMs: 61_000 },
    ]);
  });

  it("drops a restarted session re-emitting the last segment", () => {
    const s = run([
      { type: "sessionStart", sessionId: 1 },
      result(1, 100, fin("Cache hot keys.")),
      { type: "sessionEnd", sessionId: 1, atMs: 200 },
      { type: "sessionStart", sessionId: 2 },
      result(2, 300, fin("cache hot keys")),
      result(2, 400, fin("cache hot keys"), fin("in Redis")),
    ]);
    expect(s.segments.map((x) => x.text)).toEqual(["Cache hot keys.", "in Redis"]);
  });

  it("allows saying the same thing twice within a session", () => {
    const s = run([
      { type: "sessionStart", sessionId: 1 },
      result(1, 100, fin("okay")),
      result(1, 200, fin("okay"), fin("okay")),
    ]);
    expect(s.segments.map((x) => x.text)).toEqual(["okay", "okay"]);
  });

  it("commits leftover interim text when a session ends without finalizing", () => {
    const s = run([
      { type: "sessionStart", sessionId: 1 },
      result(1, 100, fin("shard by user")),
      result(1, 800, fin("shard by user"), tmp("and replicate")),
      { type: "sessionEnd", sessionId: 1, atMs: 900 },
    ]);
    expect(s.segments).toEqual([
      { text: "shard by user", startedAtMs: 100 },
      { text: "and replicate", startedAtMs: 800 },
    ]);
    expect(s.interim).toBe("");
    expect(s.sessionId).toBeNull();
  });

  it("does not commit leftover interim that duplicates the last segment", () => {
    const s = run([
      { type: "sessionStart", sessionId: 1 },
      result(1, 100, fin("done"), tmp("done")),
      { type: "sessionEnd", sessionId: 1, atMs: 200 },
    ]);
    expect(s.segments.map((x) => x.text)).toEqual(["done"]);
  });

  it("ignores events from a stale session", () => {
    const s = run([
      { type: "sessionStart", sessionId: 2 },
      result(1, 100, fin("late words")),
      { type: "sessionEnd", sessionId: 1, atMs: 200 },
    ]);
    expect(s.segments).toEqual([]);
    expect(s.sessionId).toBe(2);
  });

  it("skips empty finals", () => {
    const s = run([
      { type: "sessionStart", sessionId: 1 },
      result(1, 100, fin("   "), fin("hello")),
    ]);
    expect(s.segments.map((x) => x.text)).toEqual(["hello"]);
  });

  it("restores and resets", () => {
    const restored = run([{ type: "restore", segments: [{ text: "hi", startedAtMs: 5 }] }]);
    expect(restored.segments).toHaveLength(1);
    expect(transcriptReducer(restored, { type: "reset" })).toEqual(initialTranscript);
  });
});

describe("parseSegments", () => {
  it("keeps only well-formed segments", () => {
    expect(
      parseSegments([
        { text: "ok", startedAtMs: 1 },
        { text: 3, startedAtMs: 1 },
        { text: "no time" },
        null,
        "str",
      ]),
    ).toEqual([{ text: "ok", startedAtMs: 1 }]);
    expect(parseSegments({})).toEqual([]);
  });
});

describe("formatElapsed", () => {
  it("formats m:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(9_999)).toBe("0:09");
    expect(formatElapsed(125_000)).toBe("2:05");
  });
});

describe("speechErrorMessage", () => {
  it("ignores no-speech and aborted, explains the rest", () => {
    expect(speechErrorMessage("no-speech")).toBeNull();
    expect(speechErrorMessage("aborted")).toBeNull();
    expect(speechErrorMessage("not-allowed")).toMatch(/microphone/i);
    expect(speechErrorMessage("network")).toMatch(/internet/i);
    expect(speechErrorMessage("audio-capture")).toMatch(/microphone/i);
  });
});
