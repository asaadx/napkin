import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { toPromptSummaries } from "@/components/problems/summaries";
import { Workspace, WorkspaceSkeleton } from "@/components/workspace/Workspace";
import { GradingProvider } from "@/lib/grading";
import { getAllPrompts, getPrompt } from "@/lib/prompts";

export function generateStaticParams() {
  return getAllPrompts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/practice/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const prompt = getPrompt(slug);
  return { title: prompt ? `${prompt.title} · Napkin` : "Not found · Napkin" };
}

/**
 * The page itself stays URL-independent so it can be part of the shared App
 * Shell; the `params` read happens inside <Suspense> (Cache Components +
 * partial prefetching otherwise flag "URL data outside of Suspense").
 */
export default function PracticePage({ params }: PageProps<"/practice/[slug]">) {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <PracticeWorkspace params={params} />
    </Suspense>
  );
}

async function PracticeWorkspace({ params }: Pick<PageProps<"/practice/[slug]">, "params">) {
  const { slug } = await params;
  const prompt = getPrompt(slug);
  if (!prompt) notFound();
  const prompts = toPromptSummaries(getAllPrompts());

  return (
    <GradingProvider
      key={slug}
      slug={slug}
      prompt={{
        title: prompt.title,
        functional: prompt.functional,
        rounds: prompt.rounds,
        clarifying: prompt.clarifying,
      }}
    >
      <Workspace prompt={prompt} prompts={prompts} />
    </GradingProvider>
  );
}
