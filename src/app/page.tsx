import { PromptCard } from "@/components/PromptCard";
import { getAllPrompts } from "@/lib/prompts";

export default function Home() {
  const prompts = getAllPrompts();
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <header className="mb-10">
        <h1 className="text-4xl font-semibold tracking-tight">napkin</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Practice system design interviews. Pick a prompt, sketch it out, talk it through.
        </p>
      </header>
      {prompts.length === 0 ? (
        <p className="text-sm text-neutral-500">No prompts yet. Add one to the prompts/ directory.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {prompts.map((p) => (
            <li key={p.slug} className="contents">
              <PromptCard prompt={p} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
