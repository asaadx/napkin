/**
 * The grader's output contract. Mirrors the JSON schema at the end of
 * `system-prompt.md` field for field, so the real AI grader can drop in later.
 */

export const DIMENSION_NAMES = [
  "Requirements & scoping",
  "Estimation",
  "High-level design",
  "Data model & APIs",
  "Scaling & reliability",
  "Trade-offs & communication",
] as const;

export type DimensionName = (typeof DIMENSION_NAMES)[number];

export type LevelSignal = "below bar" | "mid-level" | "senior" | "staff";

/** 1 = missing or incorrect, 2 = shallow, 3 = solid, 4 = strong with trade-offs. */
export type DimensionScore = 1 | 2 | 3 | 4;

export type GradeDimension = {
  name: DimensionName;
  score: DimensionScore;
  evidence: string;
  feedback: string;
};

export type Improvement = {
  issue: string;
  what_strong_looks_like: string;
};

export type GradeResult = {
  insufficient: boolean;
  /** 0 to 100. 0 when `insufficient`. */
  overall_score: number;
  /** Empty when `insufficient`. */
  level_signal: LevelSignal | "";
  headline: string;
  /** All six rubric dimensions in rubric order; empty when `insufficient`. */
  dimensions: GradeDimension[];
  /** At most 2. */
  strengths: string[];
  /** At most 3, ordered by impact. */
  top_improvements: Improvement[];
  next_drill: string;
};

export type Submission = {
  id: string;
  /** Epoch milliseconds. */
  createdAt: number;
  durationMs: number;
  transcriptWords: number;
  shapeCount: number;
  result: GradeResult;
  /** Always true until real AI grading ships. */
  mocked: true;
};

/** The parts of a prompt the grader reads. A subset of the server-side `Prompt`. */
export type GradingPrompt = {
  title: string;
  functional?: string[];
  nonFunctional?: string[];
  scale?: string[];
};
