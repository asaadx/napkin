/**
 * Prompt file format v2: types and a pure parser (no fs, no "server-only"), so
 * it can be unit-tested. `src/lib/prompts.ts` reads the files and calls this.
 */
import matter from "gray-matter";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type Round = { index: number; title: string; interviewer: string; constraints: string[] };
export type ClarifyingQuestion = { id: string; question: string; answer: string; round: number };
export type Prompt = {
  slug: string;
  title: string;
  difficulty: Difficulty;
  summary: string;
  functional: string[];
  /** Includes a synthesized round 1 ("Core design") built from `functional` and the body. */
  rounds: Round[];
  clarifying: ClarifyingQuestion[];
  hints: string[];
  body: string;
};

export const FIRST_ROUND_TITLE = "Core design";

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Keys from format v1 that moved into `rounds` / `clarifying`. */
const REMOVED_KEYS: Record<string, string> = {
  non_functional: "move non-functional requirements into a later round's constraints",
  scale: "move scale numbers into a later round's constraints or a clarifying answer",
};

type Data = Record<string, unknown>;

const fail = (file: string, message: string): never => {
  throw new Error(`[prompts] ${file}: ${message}`);
};

function requireString(data: Data, key: string, file: string, where = ""): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "") {
    fail(file, `missing or invalid required field "${where}${key}"`);
  }
  return (value as string).trim();
}

function stringList(value: unknown, label: string, file: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" && typeof v !== "number")) {
    fail(file, `field "${label}" must be a list of strings`);
  }
  return (value as unknown[]).map((v) => String(v).trim()).filter(Boolean);
}

const isObject = (v: unknown): v is Data => !!v && typeof v === "object" && !Array.isArray(v);

function parseRounds(value: unknown, file: string): Omit<Round, "index">[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(file, `field "rounds" must be a non-empty list of { title, interviewer, constraints }`);
  }
  return (value as unknown[]).map((r, i) => {
    const where = `rounds[${i}].`;
    if (!isObject(r)) return fail(file, `"rounds[${i}]" must be an object with title, interviewer and constraints`);
    const constraints = stringList(r.constraints, `${where}constraints`, file);
    if (!constraints.length) fail(file, `"${where}constraints" must be a non-empty list of strings`);
    return {
      title: requireString(r, "title", file, where),
      interviewer: requireString(r, "interviewer", file, where),
      constraints,
    };
  });
}

function parseClarifying(value: unknown, totalRounds: number, file: string): ClarifyingQuestion[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(file, `field "clarifying" must be a list of { id, question, answer, round }`);
  const seen = new Set<string>();
  return (value as unknown[]).map((q, i) => {
    const where = `clarifying[${i}].`;
    if (!isObject(q)) return fail(file, `"clarifying[${i}]" must be an object with id, question, answer and round`);
    const id = requireString(q, "id", file, where);
    if (!KEBAB.test(id)) fail(file, `"${where}id" must be kebab-case (got "${id}")`);
    if (seen.has(id)) fail(file, `duplicate clarifying id "${id}"`);
    seen.add(id);
    const round = q.round;
    if (typeof round !== "number" || !Number.isInteger(round) || round < 2 || round > totalRounds) {
      fail(file, `"${where}round" must be an integer from 2 to ${totalRounds} (got ${JSON.stringify(round)})`);
    }
    return {
      id,
      question: requireString(q, "question", file, where),
      answer: requireString(q, "answer", file, where),
      round: round as number,
    };
  });
}

/** Parses one prompt file's source. `file` is the file name, e.g. "url-shortener.md". */
export function parsePromptSource(raw: string, file: string): Prompt {
  const { data, content } = matter(raw);

  for (const [key, fix] of Object.entries(REMOVED_KEYS)) {
    if (key in data) fail(file, `field "${key}" was removed in format v2; ${fix}`);
  }

  const slug = requireString(data, "slug", file);
  const fileSlug = file.replace(/\.md$/, "");
  if (slug !== fileSlug) fail(file, `slug "${slug}" must match file name "${fileSlug}"`);

  const difficulty = requireString(data, "difficulty", file).toLowerCase();
  if (!DIFFICULTIES.includes(difficulty as Difficulty)) {
    fail(file, `difficulty must be one of ${DIFFICULTIES.join(", ")} (got "${difficulty}")`);
  }

  const body = content.trim();
  const functional = stringList(data.functional, "functional", file);
  const later = parseRounds(data.rounds, file);
  const rounds: Round[] = [
    { index: 1, title: FIRST_ROUND_TITLE, interviewer: body, constraints: functional },
    ...later.map((r, i) => ({ index: i + 2, ...r })),
  ];

  return {
    slug,
    title: requireString(data, "title", file),
    difficulty: difficulty as Difficulty,
    summary: requireString(data, "summary", file),
    functional,
    rounds,
    clarifying: parseClarifying(data.clarifying, rounds.length, file),
    hints: stringList(data.hints, "hints", file),
    body,
  };
}
