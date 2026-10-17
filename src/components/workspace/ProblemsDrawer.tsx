"use client";

import { useRef } from "react";
import { ProblemList, type PromptSummary } from "@/components/problems/ProblemList";
import { Close } from "./icons";
import { useDialog } from "./useDialog";

export function ProblemsDrawer({
  open,
  onClose,
  prompts,
  currentSlug,
}: {
  open: boolean;
  onClose: () => void;
  prompts: PromptSummary[];
  currentSlug: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useDialog(open, onClose, panel);

  return (
    <div
      data-open={open || undefined}
      inert={!open}
      className="group/drawer invisible fixed inset-0 z-50 transition-[visibility] delay-200 duration-0 data-[open]:visible data-[open]:delay-0"
    >
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(10,10,12,0.22)] opacity-0 transition-opacity duration-200 group-data-[open]/drawer:opacity-100"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal={open || undefined}
        data-napkin-modal={open || undefined}
        aria-label="Problems"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-[min(420px,100%)] -translate-x-full flex-col bg-panel shadow-[1px_0_0_var(--color-line),24px_0_48px_-24px_rgba(0,0,0,0.2)] outline-none transition-[translate] duration-200 ease-out-quint group-data-[open]/drawer:translate-x-0 group-data-[open]/drawer:duration-300 group-data-[open]/drawer:ease-drawer"
      >
        <header className="flex h-[54px] shrink-0 items-center gap-2 border-b border-line pl-[22px] pr-2.5">
          <h2 className="font-semibold">Problems</h2>
          <span className="font-mono text-[12px] text-fg-3">{prompts.length}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close problems"
            className="press ml-auto inline-grid size-8 place-items-center rounded-full text-fg-2 hover:bg-hover hover:text-fg"
          >
            <Close />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ProblemList
            variant="drawer"
            prompts={prompts}
            currentSlug={currentSlug}
            onNavigate={onClose}
          />
        </div>
      </div>
    </div>
  );
}
