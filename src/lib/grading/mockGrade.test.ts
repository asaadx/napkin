import { describe, expect, it } from "vitest";
import { mockGrade, quote, revealedScope, type MockGradeInput } from "./mockGrade";
import { DIMENSION_NAMES, type GradingPrompt } from "./types";

const functional = [
  "Users can create a short link from a long URL",
  "Visiting a short link redirects to the original URL",
  "Users can set an optional custom alias",
];

const prompt: GradingPrompt = {
  title: "Design a URL Shortener",
  functional,
  rounds: [
    { index: 1, title: "Core design", constraints: functional },
    { index: 2, title: "Scale it", constraints: ["100M new links per month", "Read to write ratio of 100:1"] },
    {
      index: 3,
      title: "Make it fast and safe",
      constraints: ["Redirects complete in under 50ms (p99)", "Short codes must not be guessable"],
    },
  ],
  clarifying: [
    { id: "scale", question: "What scale should I design for?", answer: "About 100M new links a month.", round: 2 },
    { id: "latency", question: "How fast do redirects need to be?", answer: "Under 50ms at p99.", round: 3 },
    { id: "analytics", question: "Do we need click analytics?", answer: "No, that's out of scope.", round: 2 },
  ],
};

const strongTranscript = `Let me start with requirements. Users create a short link from a long URL,
visiting the short link redirects to the original URL, and a custom alias is optional. I'll assume
analytics is out of scope. Non-functional: redirects under 50 milliseconds p99, and short codes must
not be guessable. Quick estimate: 100 million new links per month is about 40 writes per second, and
with a 100 to 1 read ratio that's roughly 4000 reads per second. Storage is 500 bytes times 1.2 billion
links a year, so around 600 gigabytes per year. The request goes to a load balancer, then a stateless
service tier, then a cache in front of the database. The API is POST /links and GET /{code}. Schema is
a table keyed by short code as the primary key, because the hot query is a lookup by code. I'd go with
Cassandra rather than Postgres because it's a key-value access pattern and scales horizontally. We shard
by short code with consistent hashing, keep three replicas across availability zones, and failover
on a node failure. Hot keys get absorbed by the Redis cache. The trade-off is consistency versus
latency; a new link might take a moment to replicate, which is fine. Then for code generation I'd use
pre-allocated ranges instead of hashing, so codes aren't guessable. Finally, to summarize the design.`;

const base = (over: Partial<MockGradeInput> = {}): MockGradeInput => ({
  prompt,
  transcriptText: "",
  shapeKinds: [],
  durationMs: 20 * 60_000,
  round: 3,
  ...over,
});

describe("mockGrade", () => {
  it("marks an empty attempt insufficient and skips scores", () => {
    const r = mockGrade(base());
    expect(r.insufficient).toBe(true);
    expect(r.dimensions).toEqual([]);
    expect(r.overall_score).toBe(0);
    expect(r.level_signal).toBe("");
    expect(r.headline).toMatch(/nothing to grade/);
  });

  it("marks under ~60 words with a blank canvas insufficient", () => {
    const r = mockGrade(base({ transcriptText: "I would use a cache and a database for this." }));
    expect(r.insufficient).toBe(true);
    expect(r.headline).toMatch(/Only 10 words/);
  });

  it("grades a short transcript when the canvas has shapes", () => {
    const r = mockGrade(base({ transcriptText: "cache", shapeKinds: ["rectangle", "rectangle", "arrow"] }));
    expect(r.insufficient).toBe(false);
    expect(r.dimensions).toHaveLength(6);
  });

  it("returns all six dimensions in rubric order with scores 1-4", () => {
    const r = mockGrade(base({ transcriptText: strongTranscript, shapeKinds: ["rectangle", "arrow"] }));
    expect(r.dimensions.map((d) => d.name)).toEqual([...DIMENSION_NAMES]);
    for (const d of r.dimensions) {
      expect(d.score).toBeGreaterThanOrEqual(1);
      expect(d.score).toBeLessThanOrEqual(4);
      expect(d.evidence).not.toBe("");
      expect(d.feedback).not.toBe("");
    }
    expect(r.strengths.length).toBeLessThanOrEqual(2);
    expect(r.top_improvements.length).toBeLessThanOrEqual(3);
  });

  it("scores a thorough attempt well above a thin one", () => {
    const shapes = ["rectangle", "rectangle", "rectangle", "rectangle", "ellipse", "arrow", "arrow", "arrow", "arrow", "text"];
    const strong = mockGrade(base({ transcriptText: strongTranscript, shapeKinds: shapes }));
    const thin = mockGrade(
      base({
        transcriptText:
          "So there is a server and it talks to the database and that is basically it. ".repeat(6),
        shapeKinds: ["rectangle"],
      }),
    );
    expect(strong.overall_score).toBeGreaterThan(75);
    expect(["senior", "staff"]).toContain(strong.level_signal);
    expect(thin.overall_score).toBeLessThan(45);
    expect(thin.level_signal).toBe("below bar");
    expect(strong.dimensions.every((d) => d.score >= 3)).toBe(true);
  });

  it("quotes real phrases from the transcript as evidence", () => {
    const r = mockGrade(base({ transcriptText: strongTranscript, shapeKinds: ["rectangle", "arrow"] }));
    const quotes = r.dimensions.flatMap((d) => d.evidence.match(/"([^"]+)"/g) ?? []);
    expect(quotes.length).toBeGreaterThan(3);
    const flat = strongTranscript.replace(/\s+/g, " ");
    for (const q of quotes.filter((q) => !/^"(rectangle|arrow)/.test(q))) {
      expect(flat).toContain(q.slice(1, -1));
    }
  });

  it("says when a dimension wasn't covered", () => {
    const r = mockGrade(
      base({
        transcriptText: "We have a server that handles links and a client that calls it. ".repeat(6),
        shapeKinds: ["rectangle", "rectangle", "arrow"],
      }),
    );
    const est = r.dimensions.find((d) => d.name === "Estimation")!;
    expect(est.score).toBe(1);
    expect(est.evidence).toMatch(/Not covered/);
    expect(est.feedback).toContain("100M new links per month");
  });

  it("names a requirement the candidate skipped", () => {
    const r = mockGrade(
      base({ transcriptText: "Users create a short link from a long URL and visiting it redirects. ".repeat(6) }),
    );
    const req = r.dimensions[0];
    expect(req.feedback).toMatch(/custom alias|guessable|50ms/);
  });

  it("responds to the diagram", () => {
    const talk = "The client calls the service which reads from the database. ".repeat(7);
    const none = mockGrade(base({ transcriptText: talk }));
    const drawn = mockGrade(
      base({ transcriptText: talk, shapeKinds: ["rectangle", "rectangle", "rectangle", "rectangle", "arrow", "arrow", "arrow"] }),
    );
    expect(drawn.dimensions[2].score).toBeGreaterThan(none.dimensions[2].score);
    expect(drawn.dimensions[2].evidence).toMatch(/4 boxes and 3 connectors/);
  });

  it("forgives common speech-to-text mishearings", () => {
    const r = mockGrade(
      base({ transcriptText: "We add a Reddis cache and use sharting by user id with replicas. ".repeat(6) }),
    );
    expect(r.dimensions[4].evidence).toMatch(/caching/);
    expect(r.dimensions[4].evidence).toMatch(/sharding/);
  });

  it("is deterministic", () => {
    const input = base({ transcriptText: strongTranscript, shapeKinds: ["rectangle", "arrow"] });
    expect(mockGrade(input)).toEqual(mockGrade(input));
  });

  it("keeps the system prompt's tone: no exclamation marks", () => {
    const r = mockGrade(base({ transcriptText: strongTranscript, shapeKinds: ["rectangle"] }));
    expect(JSON.stringify(r)).not.toContain("!");
  });
});

describe("revealedScope", () => {
  it("reveals round 1 only by default", () => {
    const s = revealedScope(prompt);
    expect(s.constraints).toEqual(functional);
    expect(s.later).toEqual([]);
    expect(s.askedQuestions).toEqual([]);
  });

  it("adds each reached round's constraints", () => {
    const s = revealedScope(prompt, 2);
    expect(s.later).toEqual(["100M new links per month", "Read to write ratio of 100:1"]);
    expect(s.constraints).not.toContain("Short codes must not be guessable");
  });

  it("adds answers to questions asked before their round, ignoring unknown and repeated ids", () => {
    const s = revealedScope(prompt, 2, ["latency", "scale", "nope", "latency"]);
    expect(s.askedQuestions.map((q) => q.id)).toEqual(["latency", "scale"]);
    expect(s.early).toEqual(["Under 50ms at p99."]);
    expect(s.constraints.at(-1)).toBe("Under 50ms at p99.");
  });

  it("falls back to functional when rounds are missing", () => {
    expect(revealedScope({ title: "x", functional: ["a"] }, 3).constraints).toEqual(["a"]);
  });
});

describe("mockGrade with rounds", () => {
  const round1Transcript = `Let me start with requirements. Users create a short link from a long URL, visiting
the short link redirects to the original URL, and a custom alias is optional. I'll assume analytics is out
of scope. The request goes to a load balancer, then a stateless service tier, then the database. The API is
POST /links and GET /{code}. Schema is a table keyed by short code, because the hot query is a lookup by code.`;

  it("doesn't penalize constraints from rounds not reached yet", () => {
    const r1 = mockGrade(base({ transcriptText: round1Transcript, round: 1 }));
    const r3 = mockGrade(base({ transcriptText: round1Transcript, round: 3 }));
    const req1 = r1.dimensions[0];
    const req3 = r3.dimensions[0];
    expect(req1.evidence).toMatch(/Touched 3 of 3 requirements revealed so far/);
    expect(req3.evidence).toMatch(/of 7 requirements revealed so far/);
    expect(req1.score).toBeGreaterThanOrEqual(req3.score);
    expect(JSON.stringify(r1)).not.toMatch(/guessable|50ms|100M/);
    expect(r1.overall_score).toBeGreaterThan(r3.overall_score);
  });

  it("grades round 1 estimation without stated numbers", () => {
    const r = mockGrade(base({ transcriptText: round1Transcript, round: 1 }));
    const est = r.dimensions[1];
    expect(est.feedback).toMatch(/hasn't given scale numbers yet/);
  });

  it("uses a scale number revealed early by a clarifying answer", () => {
    const talk = "We have a server that handles links and a client that calls it. ".repeat(6);
    const r = mockGrade(base({ transcriptText: talk, round: 1, asked: ["scale"] }));
    expect(r.dimensions[1].feedback).toContain("About 100M new links a month.");
  });

  it("credits clarifying questions and names them in the evidence", () => {
    const talk = "The client sends a request to the service, which stores the link in the database. ".repeat(5);
    const without = mockGrade(base({ transcriptText: talk, round: 2 }));
    const withQs = mockGrade(base({ transcriptText: talk, round: 2, asked: ["scale", "analytics"] }));
    expect(withQs.dimensions[0].score).toBeGreaterThan(without.dimensions[0].score);
    expect(withQs.dimensions[0].evidence).toContain(
      'Asked the interviewer "What scale should I design for?" and "Do we need click analytics?".',
    );
    expect(without.dimensions[0].evidence).not.toMatch(/Asked the interviewer/);
    expect(without.dimensions[0].feedback).toMatch(/Asking the interviewer/);
  });

  it("ignores asked ids the prompt doesn't have", () => {
    const talk = "The client sends a request to the service, which stores the link in the database. ".repeat(5);
    const a = mockGrade(base({ transcriptText: talk, round: 2 }));
    const b = mockGrade(base({ transcriptText: talk, round: 2, asked: ["made-up"] }));
    expect(b).toEqual(a);
  });
});

describe("quote", () => {
  it("returns a short window around the match", () => {
    const q = quote("so first of all we will put a cache in front of the database to absorb reads", /\bcache\b/);
    expect(q).toBe('"will put a cache in front of the database"');
  });

  it("returns null when nothing matches", () => {
    expect(quote("nothing relevant here", /\bshard\b/)).toBeNull();
  });
});
