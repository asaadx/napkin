import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePromptSource } from "./promptFormat";

const valid = `---
title: Design a URL Shortener
slug: url-shortener
difficulty: Easy
summary: Short links.
functional:
  - Users can submit a long URL and get back a short link
  - Visiting a short link redirects
rounds:
  - title: Scale it
    interviewer: "Now say we're doing 100M new URLs a day."
    constraints:
      - 100M new URLs per day
      - "Read-to-write ratio of about 100:1"
  - title: Make it reliable
    interviewer: "A data center goes down."
    constraints: [Redirects stay up at 99.99%]
clarifying:
  - id: scale
    question: "What scale should I design for?"
    answer: "About 100M new URLs a day."
    round: 2
  - id: availability
    question: "How available?"
    answer: "99.99% for redirects."
    round: 3
hints:
  - Estimate first.
---
We want a URL shortener. Analytics is out of scope.
`;

const parse = (src: string, file = "url-shortener.md") => () => parsePromptSource(src, file);
const replace = (from: string | RegExp, to: string) => valid.replace(from, to);

describe("parsePromptSource", () => {
  it("parses format v2 and synthesizes round 1", () => {
    const p = parsePromptSource(valid, "url-shortener.md");
    expect(p.difficulty).toBe("easy");
    expect(p.rounds).toHaveLength(3);
    expect(p.rounds[0]).toEqual({
      index: 1,
      title: "Core design",
      interviewer: "We want a URL shortener. Analytics is out of scope.",
      constraints: p.functional,
    });
    expect(p.rounds[1]).toEqual({
      index: 2,
      title: "Scale it",
      interviewer: "Now say we're doing 100M new URLs a day.",
      constraints: ["100M new URLs per day", "Read-to-write ratio of about 100:1"],
    });
    expect(p.rounds[2].index).toBe(3);
    expect(p.clarifying.map((q) => [q.id, q.round])).toEqual([
      ["scale", 2],
      ["availability", 3],
    ]);
    expect(p.hints).toEqual(["Estimate first."]);
    expect(p).not.toHaveProperty("nonFunctional");
    expect(p).not.toHaveProperty("scale");
  });

  it("treats clarifying as optional", () => {
    const src = valid.replace(/clarifying:[\s\S]*?(?=hints:)/, "");
    expect(parsePromptSource(src, "url-shortener.md").clarifying).toEqual([]);
  });

  it("names the file in errors", () => {
    expect(parse(valid, "other.md")).toThrow(/\[prompts\] other\.md: slug "url-shortener" must match/);
  });

  it("rejects the removed v1 keys", () => {
    expect(parse(replace("hints:", "scale:\n  - 1M\nhints:"))).toThrow(/url-shortener\.md: field "scale" was removed/);
    expect(parse(replace("hints:", "non_functional:\n  - fast\nhints:"))).toThrow(/"non_functional" was removed/);
  });

  it("requires rounds", () => {
    const src = valid.replace(/rounds:[\s\S]*?(?=clarifying:)/, "");
    expect(parse(src)).toThrow(/field "rounds" must be a non-empty list/);
    expect(parse(replace(/rounds:[\s\S]*?(?=clarifying:)/, "rounds: oops\n"))).toThrow(/"rounds" must be/);
  });

  it("validates each round", () => {
    expect(parse(replace("  - title: Make it reliable\n", "  - interviewer2: x\n"))).toThrow(
      /rounds\[1\]\.title/,
    );
    expect(parse(replace("constraints: [Redirects stay up at 99.99%]", "constraints: []"))).toThrow(
      /"rounds\[1\]\.constraints" must be a non-empty list/,
    );
    expect(parse(replace("constraints: [Redirects stay up at 99.99%]", "constraints: [{a: 1}]"))).toThrow(
      /rounds\[1\]\.constraints" must be a list of strings/,
    );
  });

  it("rejects duplicate clarifying ids", () => {
    expect(parse(replace("id: availability", "id: scale"))).toThrow(/duplicate clarifying id "scale"/);
  });

  it("rejects non-kebab-case ids", () => {
    expect(parse(replace("id: availability", "id: Avail_ability"))).toThrow(/kebab-case/);
  });

  it("keeps clarifying rounds within 2..N", () => {
    expect(parse(replace("round: 3", "round: 4"))).toThrow(/"clarifying\[1\]\.round" must be an integer from 2 to 3 \(got 4\)/);
    expect(parse(replace("round: 2", "round: 1"))).toThrow(/clarifying\[0\]\.round/);
    expect(parse(replace("round: 2", 'round: "2"'))).toThrow(/clarifying\[0\]\.round/);
  });

  it("requires clarifying question and answer", () => {
    expect(parse(replace('    answer: "99.99% for redirects."\n', ""))).toThrow(/clarifying\[1\]\.answer/);
  });
});

// Runs against the real prompt files once they are in format v2.
const dir = path.join(process.cwd(), "prompts");
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
const v2 = files.filter((f) => /^rounds:/m.test(fs.readFileSync(path.join(dir, f), "utf8")));

describe.skipIf(v2.length === 0)("prompts/*.md (format v2)", () => {
  it.each(v2)("%s parses with 3-4 rounds and 3-4 clarifying questions", (file) => {
    const p = parsePromptSource(fs.readFileSync(path.join(dir, file), "utf8"), file);
    expect(p.rounds.length).toBeGreaterThanOrEqual(3);
    expect(p.rounds.length).toBeLessThanOrEqual(4);
    expect(p.clarifying.length).toBeGreaterThanOrEqual(3);
    expect(p.clarifying.length).toBeLessThanOrEqual(4);
  });
});
