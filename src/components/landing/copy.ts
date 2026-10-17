export const CHAPTERS = [
  { lab: "01", h: "Sketch it. It snaps clean.", p: "Rough strokes become boxes, databases and arrows.", rail: "Sketch" },
  { lab: "02", h: "Talk it through.", p: "Explain your design out loud as you draw.", rail: "Talk" },
  { lab: "03", h: "The interviewer pushes back.", p: "New constraints arrive, one round at a time.", rail: "Push back" },
  { lab: "04", h: "Get graded every round.", p: "Six dimensions, and what to fix next.", rail: "Grade" },
] as const;

export const SAY = "Writes go to the API, which stores code → URL in one table.";
export const PUSH = "Now say we're taking 100M new links a day. Run the numbers for me.";
export const ROUND_ONE =
  "We want to build a URL shortener like bit.ly. Start simple: walk me through the API, the data model, and how a redirect works.";

export const DIMS: ReadonlyArray<readonly [string, number]> = [
  ["Requirements & scoping", 3],
  ["Estimation", 4],
  ["High-level design", 3],
  ["Data model & APIs", 3],
  ["Scaling & reliability", 2],
  ["Trade-offs & communication", 3],
];
