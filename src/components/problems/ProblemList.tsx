"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent, type MouseEvent } from "react";
import type { PromptSummary } from "./summaries";
import { useAttempted } from "./useAttempted";

export type { PromptSummary } from "./summaries";

type Difficulty = PromptSummary["difficulty"];
type SortKey = "title" | "difficulty";
type Sort = { key: SortKey; dir: 1 | -1 } | null;

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };
const DIFF_TEXT: Record<Difficulty, string> = { easy: "text-easy", medium: "text-medium", hard: "text-hard" };
const LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };


export function ProblemList({
  prompts,
  variant,
  currentSlug,
  onNavigate,
}: {
  prompts: PromptSummary[];
  variant: "page" | "drawer";
  currentSlug?: string;
  onNavigate?: () => void;
}): JSX.Element {
  const router = useRouter();
  const drawer = variant === "drawer";
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [sort, setSort] = useState<Sort>(null);
  const deferredQuery = useDeferredValue(query);

  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const attempted = useAttempted(useMemo(() => prompts.map((p) => p.slug), [prompts]));

  const counts = useMemo(() => {
    const c: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
    for (const p of prompts) c[p.difficulty]++;
    return c;
  }, [prompts]);

  const rows = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const out = prompts.filter(
      (p) =>
        (!difficulty || p.difficulty === difficulty) &&
        (!q || p.title.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q)),
    );
    if (sort) {
      out.sort((a, b) =>
        sort.key === "title"
          ? a.title.localeCompare(b.title) * sort.dir
          : (RANK[a.difficulty] - RANK[b.difficulty]) * sort.dir || a.title.localeCompare(b.title),
      );
    }
    return out;
  }, [prompts, deferredQuery, difficulty, sort]);

  // Drawer: focus search on open and bring the current problem into view.
  useEffect(() => {
    if (!drawer) return;
    searchRef.current?.focus({ preventScroll: true });
    listRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [drawer]);

  const rowLinks = () => Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-row]") ?? []);

  function onListKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    const links = rowLinks();
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    let next: number | null = null;
    if (e.key === "ArrowDown") next = Math.min(i + 1, links.length - 1);
    else if (e.key === "ArrowUp") {
      if (i === 0) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      next = i - 1;
    } else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = links.length - 1;
    if (next === null) return;
    e.preventDefault();
    links[next]?.focus();
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      rowLinks()[0]?.focus();
    } else if (e.key === "Enter") {
      const first = rows[0];
      if (!first) return;
      e.preventDefault();
      router.push(`/practice/${first.slug}`);
      onNavigate?.();
    } else if (e.key === "Escape" && query) {
      // Clear first; a second Escape bubbles up (e.g. to close the drawer).
      e.stopPropagation();
      setQuery("");
    }
  }

  function handleRowClick(e: MouseEvent<HTMLAnchorElement>) {
    // Opening in a new tab shouldn't close the drawer.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    onNavigate?.();
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  }

  function clearFilters() {
    setQuery("");
    setDifficulty(null);
    searchRef.current?.focus();
  }

  const filtersActive = Boolean(query || difficulty);
  const attemptedCount = prompts.filter((p) => attempted.has(p.slug)).length;

  const search = (
    <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-panel px-2.5 text-fg-3 shadow-[inset_0_0_0_1px_var(--color-line)] transition-shadow duration-150 focus-within:shadow-[inset_0_0_0_1px_var(--color-accent)]">
      <SearchIcon />
      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onSearchKeyDown}
        placeholder="Search problems"
        aria-label="Search problems"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-3 sm:text-[13.5px] [&::-webkit-search-cancel-button]:hidden"
      />
    </label>
  );

  const select = (
    <div className={`relative shrink-0 ${drawer ? "w-28" : "w-32 sm:w-40"}`}>
      <select
        value={difficulty ?? ""}
        onChange={(e) => setDifficulty((e.target.value || null) as Difficulty | null)}
        aria-label="Filter by difficulty"
        className={`h-9 w-full cursor-pointer appearance-none rounded-lg bg-panel pr-8 pl-3 text-base font-medium shadow-[inset_0_0_0_1px_var(--color-line)] outline-none transition-shadow duration-150 hover:bg-hover focus-visible:shadow-[inset_0_0_0_1px_var(--color-accent)] sm:text-[13.5px] ${
          difficulty ? DIFF_TEXT[difficulty] : "text-fg"
        }`}
      >
        <option value="">All</option>
        {DIFFICULTIES.map((d) => (
          <option key={d} value={d} disabled={counts[d] === 0}>
            {LABEL[d]}
          </option>
        ))}
      </select>
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-fg-3"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );

  const empty =
    prompts.length === 0 ? (
      <p className="px-4 py-10 text-center text-sm text-fg-3">No prompts yet. Add one to the prompts/ directory.</p>
    ) : (
      <div className="px-4 py-10 text-center text-sm text-fg-3">
        No problems match these filters.{" "}
        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-fg-3"
          >
            Clear filters
          </button>
        )}
      </div>
    );

  if (drawer) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-3 pt-3 pb-2.5">
          {search}
          {select}
        </div>
        {rows.length === 0 ? (
          empty
        ) : (
          <ul ref={listRef} onKeyDown={onListKeyDown} className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
            {rows.map((p) => {
              const current = p.slug === currentSlug;
              return (
                <li key={p.slug}>
                  <Link
                    data-row
                    href={`/practice/${p.slug}`}
                    onClick={handleRowClick}
                    aria-current={current ? "page" : undefined}
                    title={p.summary}
                    className={`group flex h-10 items-center gap-2.5 rounded-lg px-2 text-sm outline-none transition-colors duration-150 focus-visible:shadow-[inset_0_0_0_1.5px_var(--color-accent)] ${
                      current ? "bg-accent-soft" : "hover:bg-hover focus-visible:bg-hover"
                    }`}
                  >
                    <StatusIcon attempted={attempted.has(p.slug)} />
                    <span
                      className={`min-w-0 flex-1 truncate ${current ? "font-medium text-accent" : "text-fg group-hover:text-accent"}`}
                    >
                      {p.title}
                    </span>
                    <span className={`shrink-0 text-xs font-medium ${DIFF_TEXT[p.difficulty]}`}>
                      {LABEL[p.difficulty]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  const grid =
    "grid grid-cols-[1.75rem_minmax(0,1fr)_4.5rem] items-center gap-x-3 px-3 sm:grid-cols-[2rem_minmax(0,1fr)_6.5rem] sm:px-4";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Problems</h1>
          <span className="text-[13px] text-fg-3 tabular-nums" aria-live="polite">
            {rows.length === prompts.length
              ? `${prompts.length} ${prompts.length === 1 ? "problem" : "problems"}`
              : `${rows.length} of ${prompts.length} problems`}
          </span>
        </div>
        <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] text-fg-3 tabular-nums">
          {DIFFICULTIES.map((d) => (
            <div key={d} className="flex items-baseline gap-1.5">
              <dt className={DIFF_TEXT[d]}>{LABEL[d]}</dt>
              <dd className="font-medium text-fg-2">{counts[d]}</dd>
            </div>
          ))}
          <div className="flex items-baseline gap-1.5 border-l border-line pl-4">
            <dt>Attempted</dt>
            <dd className="font-medium text-fg-2">
              {attemptedCount}
              <span className="text-fg-3">/{prompts.length}</span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="mb-3 flex items-center gap-2">
        {search}
        {select}
      </div>

      <div className="overflow-hidden rounded-xl bg-panel shadow-[inset_0_0_0_1px_var(--color-line)]">
        <div className={`${grid} h-10 border-b border-line text-[13px] font-medium text-fg-3`}>
          <span className="text-[12px]">
            <span className="sr-only">Status</span>
          </span>
          <SortButton label="Title" sortKey="title" sort={sort} onClick={toggleSort} />
          <SortButton label="Difficulty" sortKey="difficulty" sort={sort} onClick={toggleSort} />
        </div>

        {rows.length === 0 ? (
          empty
        ) : (
          <ul ref={listRef} onKeyDown={onListKeyDown}>
            {rows.map((p) => (
              <li key={p.slug} className="border-b border-line last:border-b-0 even:bg-panel-2/50">
                <Link
                  data-row
                  href={`/practice/${p.slug}`}
                  onClick={handleRowClick}
                  className={`${grid} group h-12 outline-none transition-colors duration-150 hover:bg-hover focus-visible:bg-hover focus-visible:shadow-[inset_0_0_0_1.5px_var(--color-accent)]`}
                >
                  <StatusIcon attempted={attempted.has(p.slug)} />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-[14px] font-medium text-fg transition-colors duration-150 group-hover:text-accent">
                      {p.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-fg-3">{p.summary}</span>
                  </span>
                  <span className={`text-[13px] font-medium ${DIFF_TEXT[p.difficulty]}`}>{LABEL[p.difficulty]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SortButton({
  label,
  sortKey,
  sort,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onClick: (k: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  const state = active ? (sort.dir === 1 ? "ascending" : "descending") : "not sorted";
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      aria-label={`Sort by ${label.toLowerCase()} (${state})`}
      className={`inline-flex items-center gap-1 justify-self-start rounded outline-none transition-colors duration-150 hover:text-fg focus-visible:text-fg focus-visible:shadow-[0_0_0_2px_var(--color-accent)] ${
        active ? "text-fg" : ""
      }`}
    >
      {label}
      <SortIcon dir={active ? sort.dir : 0} />
    </button>
  );
}

function StatusIcon({ attempted }: { attempted: boolean }) {
  if (!attempted) return <span aria-hidden className="size-4" />;
  return (
    <span className="text-medium" title="Attempted">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 3.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" />
      </svg>
      <span className="sr-only">Attempted</span>
    </span>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="shrink-0">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function SortIcon({ dir }: { dir: 1 | -1 | 0 }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m3.5 4.5 2.5-2.5 2.5 2.5" opacity={dir === -1 ? 0.3 : dir === 1 ? 1 : 0.5} />
      <path d="m3.5 7.5 2.5 2.5 2.5-2.5" opacity={dir === 1 ? 0.3 : dir === -1 ? 1 : 0.5} />
    </svg>
  );
}
