import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DIFFICULTIES, parsePromptSource, type Prompt } from "./promptFormat";

export { DIFFICULTIES, FIRST_ROUND_TITLE } from "./promptFormat";
export type { ClarifyingQuestion, Difficulty, Prompt, Round } from "./promptFormat";

const PROMPTS_DIR = path.join(process.cwd(), "prompts");

function parsePromptFile(file: string): Prompt {
  return parsePromptSource(fs.readFileSync(path.join(PROMPTS_DIR, file), "utf8"), file);
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
