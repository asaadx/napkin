import { Wordmark } from "./Wordmark";

export function TopBar({ title }: { title: string }) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-4 border-b border-neutral-200 px-4 dark:border-neutral-800">
      <Wordmark className="text-lg" />
      <span className="text-neutral-300 dark:text-neutral-700">/</span>
      <span className="truncate text-sm font-medium">{title}</span>
      <div className="ml-auto">
        <button
          type="button"
          disabled
          title="Coming soon"
          className="cursor-not-allowed rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-400 dark:border-neutral-800 dark:text-neutral-600"
        >
          Submit for grading <span className="text-xs">(coming soon)</span>
        </button>
      </div>
    </div>
  );
}
