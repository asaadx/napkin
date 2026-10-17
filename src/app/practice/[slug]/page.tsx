import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PromptPanel } from "@/components/PromptPanel";
import { Scratchpad } from "@/components/Scratchpad";
import { TopBar } from "@/components/TopBar";
import { VoicePanel } from "@/components/VoicePanel";
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

export default async function PracticePage({ params }: PageProps<"/practice/[slug]">) {
  const { slug } = await params;
  const prompt = getPrompt(slug);
  if (!prompt) notFound();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar title={prompt.title} />
      <div className="flex min-h-0 flex-1">
        <PromptPanel prompt={prompt} />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <Scratchpad key={prompt.slug} slug={prompt.slug} />
          </div>
          <VoicePanel key={prompt.slug} slug={prompt.slug} />
        </main>
      </div>
    </div>
  );
}
