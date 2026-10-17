"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { PromptSummary } from "@/components/problems/ProblemList";
import { Scratchpad } from "@/components/Scratchpad";
import { VoiceDock } from "@/components/voice/VoiceDock";
import { useGrading } from "@/lib/grading";
import type { Prompt } from "@/lib/prompts";
import { ProblemsDrawer } from "./ProblemsDrawer";
import { PromptPill } from "./PromptPill";
import { QuickSwitcher } from "./QuickSwitcher";
import { SideCard, type SideTab } from "./SideCard";
import { TopBar } from "./TopBar";
import { useShortcuts } from "./useShortcuts";

export function Workspace({ prompt, prompts }: { prompt: Prompt; prompts: PromptSummary[] }) {
  const router = useRouter();
  const { submissions, status, submit } = useGrading();

  const [sideOpen, setSideOpen] = useState(true);
  const [tab, setTab] = useState<SideTab>("description");
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const index = prompts.findIndex((p) => p.slug === prompt.slug);
  const go = useCallback((slug: string) => router.push(`/practice/${slug}`), [router]);

  const shuffle = () => {
    const others = prompts.filter((p) => p.slug !== prompt.slug);
    if (others.length) go(others[Math.floor(Math.random() * others.length)].slug);
  };

  const onSubmit = () => {
    setTab("submissions");
    setSideOpen(true);
    void submit();
  };

  useShortcuts({
    onPalette: () => {
      setDrawerOpen(false);
      setPaletteOpen((o) => !o);
    },
    onTogglePrompt: () => setSideOpen((o) => !o),
  });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-app">
      <TopBar
        index={index}
        total={prompts.length}
        grading={status === "grading"}
        onProblems={() => setDrawerOpen(true)}
        onPrev={() => index > 0 && go(prompts[index - 1].slug)}
        onNext={() => index >= 0 && index < prompts.length - 1 && go(prompts[index + 1].slug)}
        onShuffle={shuffle}
        onPalette={() => setPaletteOpen(true)}
        onSubmit={onSubmit}
      />

      <div className="relative flex min-h-0 flex-1">
        <SideCard
          prompt={prompt}
          open={sideOpen}
          tab={tab}
          onTab={setTab}
          onCollapse={() => setSideOpen(false)}
          hintsRevealed={hintsRevealed}
          onRevealHint={() => setHintsRevealed((n) => Math.min(n + 1, prompt.hints.length))}
          submissionCount={submissions.length}
        />

        <main className="relative min-w-0 flex-1">
          <Scratchpad slug={prompt.slug} />
          <PromptPill
            title={prompt.title}
            difficulty={prompt.difficulty}
            visible={!sideOpen}
            onOpen={() => setSideOpen(true)}
          />
          <VoiceDock slug={prompt.slug} />
        </main>
      </div>

      <ProblemsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        prompts={prompts}
        currentSlug={prompt.slug}
      />
      {paletteOpen && (
        <QuickSwitcher
          prompts={prompts}
          currentSlug={prompt.slug}
          onClose={() => setPaletteOpen(false)}
          onOpen={(slug) => {
            setPaletteOpen(false);
            if (slug !== prompt.slug) go(slug);
          }}
        />
      )}
    </div>
  );
}

/** Static shell shown while the route's params resolve (same frame, no content). */
export function WorkspaceSkeleton() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-app" aria-busy="true">
      <div className="h-[54px] shrink-0 border-b border-line bg-panel" />
      <div className="flex min-h-0 flex-1">
        <div className="w-[364px] shrink-0 border-r border-line p-3 max-sm:hidden">
          <div className="h-full rounded-xl bg-panel shadow-[0_0_0_1px_var(--color-line)]" />
        </div>
        <div className="flex-1" />
      </div>
    </div>
  );
}
