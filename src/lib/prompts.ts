import "server-only";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type Prompt = {
  slug: string;
  title: string;
  difficulty: Difficulty;
  summary: string;
  functional: string[];
  nonFunctional: string[];
  scale: string[];
  hints: string[];
  body: string;
};

const PROMPTS_DIR = path.join(process.cwd(), "prompts");

function requireString(data: Record<string, unknown>, key: string, file: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`[prompts] ${file}: missing or invalid required field "${key}"`);
  }
  return value.trim();
}

function optionalList(data: Record<string, unknown>, key: string, file: string): string[] {
  const value = data[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" && typeof v !== "number")) {
    throw new Error(`[prompts] ${file}: field "${key}" must be a list of strings`);
  }
  return value.map((v) => String(v).trim()).filter(Boolean);
}

function parsePromptFile(file: string): Prompt {
  const raw = fs.readFileSync(path.join(PROMPTS_DIR, file), "utf8");
  const { data, content } = matter(raw);

  const slug = requireString(data, "slug", file);
  const fileSlug = file.replace(/\.md$/, "");
  if (slug !== fileSlug) {
    throw new Error(`[prompts] ${file}: slug "${slug}" must match file name "${fileSlug}"`);
  }

  const difficulty = requireString(data, "difficulty", file).toLowerCase();
  if (!DIFFICULTIES.includes(difficulty as Difficulty)) {
    throw new Error(
      `[prompts] ${file}: difficulty must be one of ${DIFFICULTIES.join(", ")} (got "${difficulty}")`,
    );
  }

  return {
    slug,
    title: requireString(data, "title", file),
    difficulty: difficulty as Difficulty,
    summary: requireString(data, "summary", file),
    functional: optionalList(data, "functional", file),
    nonFunctional: optionalList(data, "non_functional", file),
    scale: optionalList(data, "scale", file),
    hints: optionalList(data, "hints", file),
    body: content.trim(),
  };
}

export function getAllPrompts(): Prompt[] {
  if (!fs.existsSync(PROMPTS_DIR)) return [];
  return fs
    .readdirSync(PROMPTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map(parsePromptFile)
    .sort(
      (a, b) =>
        DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty) ||
        a.title.localeCompare(b.title),
    );
}

export function getPrompt(slug: string): Prompt | null {
  return getAllPrompts().find((p) => p.slug === slug) ?? null;
}
