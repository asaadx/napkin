"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { PromptSummary } from "@/components/problems/ProblemList";
import { Search } from "./icons";
import { useDialog } from "./useDialog";

const DIFF_COLOR = { easy: "text-easy", medium: "text-medium", hard: "text-hard" } as const;

type Match = { prompt: PromptSummary; score: number; hits: number[] };

/**
 * Subsequence fuzzy match. Rewards consecutive runs and word starts, so "urls"
 * ranks "URL Shortener" above "Rate Limiter". Returns null when not all of the
 * query's characters appear in order.
 */
export function fuzzyMatch(query: string, text: string): { score: number; hits: number[] } | null {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return { score: 0, hits: [] };
  const t = text.toLowerCase();
  const hits: number[] = [];
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    const wordStart = found === 0 || /[\s\-_/]/.test(t[found - 1]);
    score += 1 + (found === prev + 1 ? 3 : 0) + (wordStart ? 2 : 0);
    score -= Math.min(found - ti, 6) * 0.1;
    hits.push(found);
    prev = found;
    ti = found + 1;
  }
  return { score, hits };
}

function Highlighted({ text, hits }: { text: string; hits: number[] }) {
  if (hits.length === 0) return <>{text}</>;
  const set = new Set(hits);
  return (
    <>
      {Array.from(text, (ch, i) =>
        set.has(i) ? (
          <mark key={i} className="bg-transparent font-semibold text-fg">
            {ch}
          </mark>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </>
  );
}

/** Rendered only while open: a fresh mount resets the query and selection. */
export function QuickSwitcher({
  prompts,
  currentSlug,
  onClose,
  onOpen,
}: {
  prompts: PromptSummary[];
  currentSlug: string;
  onClose: () => void;
  onOpen: (slug: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  useDialog(true, onClose, panel, input);

  const matches = useMemo<Match[]>(() => {
    const out: Match[] = [];
    for (const prompt of prompts) {
      const m = fuzzyMatch(query, prompt.title);
      if (m) out.push({ prompt, ...m });
    }
    // Stable: equal scores keep the list's own (difficulty, title) order.
    return query.trim() ? out.sort((a, b) => b.score - a.score) : out;
  }, [prompts, query]);

  const clamped = Math.min(active, Math.max(0, matches.length - 1));

  const move = (delta: number) => {
    if (matches.length === 0) return;
    const next = (clamped + delta + matches.length) % matches.length;
    setActive(next);
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${next}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = matches[clamped];
      if (pick) onOpen(pick.prompt.slug);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-center px-4 pt-[14vh]">
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-[rgba(10,10,12,0.22)]" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        data-napkin-modal
        aria-label="Switch problem"
        className="relative flex max-h-[min(460px,70vh)] w-full max-w-[560px] flex-col self-start overflow-hidden rounded-xl bg-panel shadow-pop"
      >
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line px-4">
          <span className="text-fg-3">
            <Search />
          </span>
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a problem…"
            aria-label="Search problems"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={matches[clamped] ? `${listId}-${clamped}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-3"
          />
          <kbd className="rounded-[5px] px-[5px] font-mono text-[11px] leading-[18px] text-fg-3 shadow-[inset_0_0_0_1px_var(--color-line)]">
            esc
          </kbd>
        </div>
        <ul ref={list} id={listId} role="listbox" aria-label="Problems" className="overflow-y-auto p-1.5">
          {matches.length === 0 && (
            <li className="px-3 py-8 text-center text-fg-2">No problems match “{query}”.</li>
          )}
          {matches.map(({ prompt, hits }, i) => (
            <li
              key={prompt.slug}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === clamped}
              onMouseMove={() => i !== clamped && setActive(i)}
              onClick={() => onOpen(prompt.slug)}
              className={`flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 ${
                i === clamped ? "bg-hover" : ""
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-fg-2">
                <Highlighted text={prompt.title} hits={hits} />
              </span>
              {prompt.slug === currentSlug && (
                <span className="text-[12px] text-fg-3">Current</span>
              )}
              <span className={`text-[12.5px] font-medium capitalize ${DIFF_COLOR[prompt.difficulty]}`}>
                {prompt.difficulty}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
