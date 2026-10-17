import Link from "next/link";
import type { Prompt } from "@/lib/prompts";
import { DifficultyBadge } from "./DifficultyBadge";

export function PromptCard({ prompt }: { prompt: Prompt }) {
  return (
    <Link
      href={`/practice/${prompt.slug}`}
      className="group flex flex-col gap-2 rounded-lg border border-neutral-200 p-4 transition-colors hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-600 dark:hover:bg-neutral-900"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium group-hover:underline">{prompt.title}</h2>
        <DifficultyBadge difficulty={prompt.difficulty} />
      </div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{prompt.summary}</p>
    </Link>
  );
}
