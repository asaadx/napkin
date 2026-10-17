import Markdown from "react-markdown";
import type { Prompt } from "@/lib/prompts";
import { DifficultyBadge } from "./DifficultyBadge";
import { Hints } from "./Hints";
import { RequirementList } from "./RequirementList";

export function PromptPanel({ prompt }: { prompt: Prompt }) {
  return (
    <aside className="flex w-[360px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-neutral-200 p-5 dark:border-neutral-800">
      <header className="flex flex-col gap-2">
        <div>
          <DifficultyBadge difficulty={prompt.difficulty} />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{prompt.title}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{prompt.summary}</p>
      </header>
      <RequirementList title="Functional requirements" items={prompt.functional} />
      <RequirementList title="Non-functional requirements" items={prompt.nonFunctional} />
      <RequirementList title="Scale" items={prompt.scale} />
      <Hints hints={prompt.hints} />
      {prompt.body && (
        <section className="prompt-body space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
          <Markdown>{prompt.body}</Markdown>
        </section>
      )}
    </aside>
  );
}
