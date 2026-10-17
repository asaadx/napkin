import type { Prompt } from "@/lib/prompts";

/** The slice of a prompt the problem list needs. Safe to pass from a server component to a client one. */
export type PromptSummary = {
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  summary: string;
};

/**
 * Server-safe: no fs, no "use client". Usage in a server component:
 *   import { getAllPrompts } from "@/lib/prompts";
 *   const prompts = toPromptSummaries(getAllPrompts());
 */
export function toPromptSummaries(prompts: readonly Prompt[]): PromptSummary[] {
  return prompts.map(({ slug, title, difficulty, summary }) => ({ slug, title, difficulty, summary }));
}
