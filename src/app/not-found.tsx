import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center gap-3 px-6 py-16">
      <p className="text-sm font-medium text-neutral-500">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">That prompt doesn&apos;t exist.</h1>
      <Link href="/" className="text-sm underline underline-offset-2">
        Back to all prompts
      </Link>
    </main>
  );
}
