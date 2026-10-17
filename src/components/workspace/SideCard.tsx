"use client";

import { useId, useRef } from "react";
import Markdown from "react-markdown";
import { DifficultyBadge } from "@/components/DifficultyBadge";
import { SubmissionsTab } from "@/components/grading/SubmissionsTab";
import type { Prompt } from "@/lib/prompts";
import { Bulb, ChevronDown, Doc, History, PanelLeft } from "./icons";

export type SideTab = "description" | "hints" | "submissions";

const TABS: { id: SideTab; label: string; Icon: typeof Doc }[] = [
  { id: "description", label: "Description", Icon: Doc },
  { id: "hints", label: "Hints", Icon: Bulb },
  { id: "submissions", label: "Submissions", Icon: History },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-[18px] text-[11.5px] font-medium uppercase tracking-[0.07em] text-fg-3">
      {children}
    </h3>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="grid list-disc gap-[5px] pl-[18px] marker:text-fg-3">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Description({ prompt }: { prompt: Prompt }) {
  return (
    <div className="px-[22px] pb-7 pt-[22px]">
      <h1 className="mb-2.5 text-[22px] font-semibold leading-[1.25] tracking-[-0.015em] text-balance">
        {prompt.title}
      </h1>
      <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
        <DifficultyBadge difficulty={prompt.difficulty} />
      </div>
      <p className="text-fg-2">{prompt.summary}</p>

      {prompt.functional.length > 0 && (
        <section>
          <Eyebrow>Functional requirements</Eyebrow>
          <Bullets items={prompt.functional} />
        </section>
      )}
      {prompt.nonFunctional.length > 0 && (
        <section>
          <Eyebrow>Non-functional requirements</Eyebrow>
          <Bullets items={prompt.nonFunctional} />
        </section>
      )}
      {prompt.scale.length > 0 && (
        <section>
          <Eyebrow>Scale</Eyebrow>
          {/* LeetCode "Constraints" style: each line as its own mono block. */}
          <ul className="grid gap-1.5">
            {prompt.scale.map((s) => (
              <li
                key={s}
                className="rounded-lg bg-panel-2 px-3 py-[7px] font-mono text-[12.5px] leading-[1.55] text-fg"
              >
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}
      {prompt.body && (
        <section>
          <Eyebrow>Context</Eyebrow>
          <div className="prompt-body">
            <Markdown>{prompt.body}</Markdown>
          </div>
        </section>
      )}
    </div>
  );
}

function Hints({
  hints,
  revealed,
  onReveal,
}: {
  hints: string[];
  revealed: number;
  onReveal: () => void;
}) {
  if (hints.length === 0) {
    return (
      <div className="grid justify-items-center gap-2.5 px-6 py-12 text-center text-fg-2">
        <span className="text-fg-3">
          <Bulb size={22} />
        </span>
        No hints for this one. Trust your instincts.
      </div>
    );
  }
  return (
    <div className="px-[22px] pb-7 pt-[22px]">
      <h2 className="mb-1 text-[17px] font-semibold tracking-[-0.01em]">Hints</h2>
      <p className="mb-3.5 text-fg-2">
        Reveal one at a time, only when you&apos;re stuck. {revealed} of {hints.length} shown.
      </p>
      <ol className="grid gap-1.5">
        {hints.slice(0, revealed).map((h, i) => (
          <li
            key={i}
            className="rounded-[10px] px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--color-line)] motion-safe:animate-[rise_200ms_var(--ease-out-quint)_backwards]"
          >
            <div className="mb-1 flex items-center gap-2 text-[13px] font-medium">
              <span className="text-medium">
                <Bulb size={15} />
              </span>
              Hint {i + 1}
            </div>
            <p className="pl-[23px] text-[13px] text-fg-2">{h}</p>
          </li>
        ))}
      </ol>
      {revealed < hints.length && (
        <button
          type="button"
          onClick={onReveal}
          className="press mt-2 flex h-[38px] w-full items-center gap-2 rounded-[10px] px-3 text-left font-medium shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-hover"
        >
          <span className="text-medium">
            <Bulb size={15} />
          </span>
          Show hint {revealed + 1}
          <span className="ml-auto text-fg-3">
            <ChevronDown size={15} />
          </span>
        </button>
      )}
    </div>
  );
}

export function SideCard({
  prompt,
  open,
  tab,
  onTab,
  onCollapse,
  hintsRevealed,
  onRevealHint,
  submissionCount,
}: {
  prompt: Prompt;
  open: boolean;
  tab: SideTab;
  onTab: (tab: SideTab) => void;
  onCollapse: () => void;
  hintsRevealed: number;
  onRevealHint: () => void;
  submissionCount: number;
}) {
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + TABS.length) % TABS.length;
    onTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <aside
      aria-label="Problem"
      inert={!open}
      data-open={open || undefined}
      className="group/side relative z-30 w-0 shrink-0 overflow-hidden transition-[width] delay-200 duration-0 data-[open]:w-[364px] data-[open]:delay-0 max-sm:absolute max-sm:inset-y-0 max-sm:left-0 max-sm:data-[open]:w-full"
    >
      <div className="absolute inset-y-0 left-0 w-[364px] border-r border-line bg-app p-3 max-sm:w-full">
        <div
          className="flex h-full -translate-x-[calc(100%+12px)] flex-col overflow-hidden rounded-xl bg-panel opacity-0 shadow-[0_0_0_1px_var(--color-line)] transition-[translate,opacity] duration-200 ease-out-quint group-data-[open]/side:translate-x-0 group-data-[open]/side:opacity-100 group-data-[open]/side:duration-300 group-data-[open]/side:ease-drawer"
        >
          <div className="flex shrink-0 items-center gap-1 border-b border-line pl-2.5 pr-1.5">
            <div role="tablist" aria-label="Problem sections" className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none]">
              {TABS.map(({ id, label, Icon }, i) => {
                const selected = tab === id;
                return (
                  <button
                    key={id}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`${baseId}-tab-${id}`}
                    aria-selected={selected}
                    aria-controls={`${baseId}-panel`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => onTab(id)}
                    onKeyDown={(e) => onTabKey(e, i)}
                    className={`relative inline-flex h-[42px] items-center gap-1.5 whitespace-nowrap px-[7px] text-[13.5px] transition-colors duration-150 hover:text-fg ${
                      selected
                        ? "font-medium text-fg after:absolute after:inset-x-[7px] after:-bottom-px after:h-0.5 after:rounded-full after:bg-fg"
                        : "text-fg-2"
                    }`}
                  >
                    <span className={selected ? "text-fg" : "text-fg-3"}>
                      <Icon size={15} />
                    </span>
                    {label}
                    {id === "submissions" && submissionCount > 0 && (
                      <span className="font-mono text-[11px] text-fg-3">{submissionCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse prompt (P)"
              title="Collapse (P)"
              className="press inline-grid size-8 shrink-0 place-items-center rounded-full text-fg-2 hover:bg-hover hover:text-fg"
            >
              <PanelLeft />
            </button>
          </div>

          <div
            role="tabpanel"
            id={`${baseId}-panel`}
            aria-labelledby={`${baseId}-tab-${tab}`}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            {tab === "description" && <Description prompt={prompt} />}
            {tab === "hints" && (
              <Hints hints={prompt.hints} revealed={hintsRevealed} onReveal={onRevealHint} />
            )}
            {tab === "submissions" && <SubmissionsTab />}
          </div>
        </div>
      </div>
    </aside>
  );
}
