import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-app">
      <header className="flex h-[54px] shrink-0 items-center border-b border-line bg-panel px-[18px]">
        <Wordmark />
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-3 px-6 py-16">
        <p className="font-mono text-[12.5px] text-fg-3">404</p>
        <h1 className="text-[24px] font-semibold tracking-[-0.015em]">
          That prompt doesn&apos;t exist.
        </h1>
        <p className="text-fg-2">It may have been renamed or removed.</p>
        <Link
          href="/"
          className="press mt-2 inline-flex h-8 items-center rounded-full bg-panel px-3.5 font-medium shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-hover"
        >
          Back to all problems
        </Link>
      </main>
    </div>
  );
}
