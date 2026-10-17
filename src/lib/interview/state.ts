/** Pure interview-state helpers: no React, no storage, no clock. */

export type InterviewState = {
  /** 1-based current round. */
  round: number;
  /** Clarifying question ids asked so far, in the order asked. */
  asked: string[];
  /** Epoch ms each round started, keyed by round number. Round 1 is not recorded (it starts with the attempt). */
  roundStartedAt: Record<number, number>;
};

/** Shared default; treat as read-only (the helpers below never mutate). */
export const DEFAULT_INTERVIEW: InterviewState = { round: 1, asked: [], roundStartedAt: {} };

export const interviewStorageKey = (slug: string) => `napkin:interview:${slug}`;

const clamp = (round: number, total: number) => Math.min(Math.max(1, Math.floor(round)), Math.max(1, Math.floor(total)));

/** Parses a stored value; anything missing or malformed falls back to the default. */
export function parseInterview(raw: string | null | undefined): InterviewState {
  if (!raw) return DEFAULT_INTERVIEW;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_INTERVIEW;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return DEFAULT_INTERVIEW;
  const d = data as Partial<Record<keyof InterviewState, unknown>>;
  const round = typeof d.round === "number" && Number.isFinite(d.round) && d.round >= 1 ? Math.floor(d.round) : 1;
  const asked = Array.isArray(d.asked)
    ? [...new Set(d.asked.filter((id): id is string => typeof id === "string" && id !== ""))]
    : [];
  const roundStartedAt: Record<number, number> = {};
  if (d.roundStartedAt && typeof d.roundStartedAt === "object" && !Array.isArray(d.roundStartedAt)) {
    for (const [k, v] of Object.entries(d.roundStartedAt)) {
      const n = Number(k);
      if (Number.isInteger(n) && n >= 1 && typeof v === "number" && Number.isFinite(v)) roundStartedAt[n] = v;
    }
  }
  return { round, asked, roundStartedAt };
}

export function serializeInterview(state: InterviewState): string {
  return JSON.stringify(state);
}

/** The state as seen by a prompt with `totalRounds` rounds (a stored round past the end is clamped). */
export function clampInterview(state: InterviewState, totalRounds: number): InterviewState {
  const round = clamp(state.round, totalRounds);
  return round === state.round ? state : { ...state, round };
}

/** Moves to the next round, capped at `totalRounds`, recording when it started. Returns `state` unchanged at the cap. */
export function advanceRound(state: InterviewState, totalRounds: number, now: number): InterviewState {
  const current = clamp(state.round, totalRounds);
  const next = clamp(current + 1, totalRounds);
  if (next === current) return current === state.round ? state : { ...state, round: current };
  return { ...state, round: next, roundStartedAt: { ...state.roundStartedAt, [next]: now } };
}

/** Records a clarifying question as asked. Idempotent: returns `state` unchanged if already asked. */
export function markAsked(state: InterviewState, id: string): InterviewState {
  if (!id || state.asked.includes(id)) return state;
  return { ...state, asked: [...state.asked, id] };
}
