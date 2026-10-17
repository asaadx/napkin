"use client";

import type { Difficulty } from "@/lib/prompts";
import { ChevronDown } from "./icons";

const DIFF_COLOR: Record<Difficulty, string> = {
  easy: "text-easy",
  medium: "text-medium",
  hard: "text-hard",
};

/** The collapsed prompt card: a slim pill under Excalidraw's toolbar. */
export function PromptPill({
  title,
  difficulty,
  visible,
  onOpen,
}: {
  title: string;
  difficulty: Difficulty;
  visible: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open prompt: ${title} (P)`}
      aria-hidden={!visible || undefined}
      tabIndex={visible ? 0 : -1}
      data-hidden={!visible || undefined}
      className="absolute left-1/2 top-[68px] z-20 flex h-10 max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-panel pl-4 pr-3 shadow-float transition-[opacity,scale,translate,visibility,background-color] duration-200 ease-out-quint hover:bg-[color-mix(in_srgb,var(--color-panel)_94%,var(--color-fg))] active:scale-[0.97] data-[hidden]:invisible data-[hidden]:-translate-y-1 data-[hidden]:scale-[0.98] data-[hidden]:opacity-0 data-[hidden]:duration-150 max-sm:top-[60px]"
    >
      <span className="min-w-0 truncate font-semibold">{title}</span>
      <span className="text-fg-3">·</span>
      <span className={`text-[12.5px] font-medium capitalize ${DIFF_COLOR[difficulty]}`}>
        {difficulty}
      </span>
      <span className="text-fg-3">
        <ChevronDown size={15} />
      </span>
      <kbd className="rounded-[5px] px-[5px] font-mono text-[11px] leading-[18px] text-fg-3 shadow-[inset_0_0_0_1px_var(--color-line)] max-sm:hidden">
        P
      </kbd>
    </button>
  );
}
