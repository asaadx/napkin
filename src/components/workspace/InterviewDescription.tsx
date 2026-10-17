"use client";

import { useEffect, useId, useRef, useState } from "react";
import Markdown from "react-markdown";
import { DifficultyBadge } from "@/components/DifficultyBadge";
import type { useInterview } from "@/lib/interview";
import type { ClarifyingQuestion, Prompt, Round } from "@/lib/prompts";
import { ArrowRight, ChevronDown, Flag, More, Restart } from "./icons";

export type Interview = ReturnType<typeof useInterview>;

/**
 * The Description tab as an interview: only what the interviewer has said so
 * far is on screen. Past rounds fold away, the current round is the focus,
 * and clarifying questions sit underneath, answered only when asked.
 */
export function InterviewDescription({ prompt, interview }: { prompt: Prompt; interview: Interview }) {
  const { round, totalRounds, isLastRound, nextRound, asked, ask, reset } = interview;
  const rounds = prompt.rounds;
  const current = rounds[Math.min(round, rounds.length) - 1] ?? rounds[0];
  const past = rounds.slice(0, Math.max(0, round - 1));

  // Only animate and scroll when the user advances, never on load or hydration.
  const [advancedTo, setAdvancedTo] = useState<number | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (advancedTo === null) return;
    const card = cardRef.current;
    const scroller = card?.closest<HTMLElement>('[role="tabpanel"]');
    if (!card || !scroller) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top =
      card.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12;
    scroller.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  }, [advancedTo]);

  const onNext = () => {
    nextRound();
    setAdvancedTo(Math.min(round + 1, totalRounds));
  };

  return (
    <div className="px-[22px] pb-7 pt-[22px]">
      <InterviewStyles />
      <h1 className="mb-2.5 text-[22px] font-semibold leading-[1.25] tracking-[-0.015em] text-balance">
        {prompt.title}
      </h1>
      <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
        <DifficultyBadge difficulty={prompt.difficulty} />
      </div>
      <p className="text-fg-2">{prompt.summary}</p>

      {current && (
        <RoundProgress round={round} total={totalRounds} title={current.title}>
          <InterviewMenu
            onRestart={() => {
              reset();
              setAdvancedTo(null);
            }}
          />
        </RoundProgress>
      )}

      {past.length > 0 && (
        <ul className="mt-3 overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_var(--color-line)]">
          {past.map((r, i) => (
            <PastRound key={r.index} round={r} first={i === 0} />
          ))}
        </ul>
      )}

      {current && (
        <article
          key={current.index}
          ref={cardRef}
          aria-label={`Round ${current.index}: ${current.title}`}
          className={`mt-3 rounded-[12px] bg-panel p-3.5 shadow-[inset_0_0_0_1px_var(--color-line)] ${
            advancedTo === current.index ? "nr-enter" : ""
          }`}
        >
          <InterviewerLine round={current} />
          <RoundRequirements round={current} />
        </article>
      )}

      {isLastRound ? (
        <p className="mt-3 flex items-center gap-2 px-0.5 text-[12.5px] text-fg-3">
          <Flag size={14} />
          Final round. Submit when you&apos;re ready.
        </p>
      ) : (
        <button
          type="button"
          onClick={onNext}
          className="press mt-3 flex h-[38px] w-full items-center gap-2 rounded-[10px] bg-accent-soft px-3 font-medium text-accent hover:bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)]"
        >
          Next round
          <span className="ml-auto font-mono text-[11.5px] font-normal tabular-nums opacity-70">
            {round + 1}/{totalRounds}
          </span>
          <ArrowRight size={15} />
        </button>
      )}

      {prompt.clarifying.length > 0 && (
        <AskTheInterviewer questions={prompt.clarifying} asked={asked} round={round} onAsk={ask} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`mb-2 text-[11.5px] font-medium uppercase tracking-[0.07em] text-fg-3 ${className}`}>
      {children}
    </h3>
  );
}

function RoundProgress({
  round,
  total,
  title,
  children,
}: {
  round: number;
  total: number;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-[18px]">
      <div className="mb-2 flex items-center gap-1.5 text-[12.5px]">
        <span className="font-medium text-fg tabular-nums">
          Round {round} of {total}
        </span>
        <span className="text-fg-3">·</span>
        <span className="min-w-0 flex-1 truncate text-fg-2">{title}</span>
        {children}
      </div>
      <div className="flex gap-1" role="img" aria-label={`Round ${round} of ${total}`}>
        {Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          const tone = n < round ? "bg-fg-3" : n === round ? "bg-accent" : "bg-panel-2";
          return (
            <span
              key={n}
              className={`h-1 flex-1 rounded-full transition-colors duration-200 ease-out-quint ${tone}`}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Round 1's requirements read as a list; later rounds as LeetCode-style constraint blocks. */
function RoundRequirements({ round }: { round: Round }) {
  if (round.constraints.length === 0) return null;
  if (round.index === 1) {
    return (
      <section className="mt-3.5">
        <Eyebrow>Functional requirements</Eyebrow>
        <ul className="grid list-disc gap-[5px] pl-[18px] marker:text-fg-3">
          {round.constraints.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section className="mt-3.5">
      <Eyebrow>Constraints</Eyebrow>
      <Constraints items={round.constraints} />
    </section>
  );
}

function Constraints({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-1.5">
      {items.map((s) => (
        <li
          key={s}
          className="rounded-lg bg-panel-2 px-3 py-[7px] font-mono text-[12.5px] leading-[1.55] text-fg"
        >
          {s}
        </li>
      ))}
    </ul>
  );
}

function InterviewerLine({ round }: { round: Round }) {
  return (
    <figure>
      <figcaption className="mb-2 flex items-center gap-2 text-[12px] text-fg-2">
        <span
          aria-hidden
          className="grid size-[22px] place-items-center rounded-full bg-accent-soft text-[10.5px] font-semibold text-accent"
        >
          IN
        </span>
        <span className="font-medium text-fg">Interviewer</span>
      </figcaption>
      <blockquote className="border-l-2 border-[color-mix(in_srgb,var(--color-accent)_35%,transparent)] pl-3 text-[13.5px] leading-[1.6] text-fg">
        {round.index === 1 ? (
          <div className="prompt-body">
            <Markdown>{round.interviewer}</Markdown>
          </div>
        ) : (
          <p>{round.interviewer}</p>
        )}
      </blockquote>
    </figure>
  );
}

function PastRound({ round, first }: { round: Round; first: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <li className={first ? "" : "border-t border-line"}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-2.5 px-3 text-left text-[13px] transition-colors duration-150 hover:bg-hover"
      >
        <span className="font-mono text-[11.5px] text-fg-3 tabular-nums">{round.index}</span>
        <span className="min-w-0 flex-1 truncate text-fg-2">{round.title}</span>
        <span className="text-[11.5px] text-fg-3 tabular-nums">
          {round.constraints.length} {round.index === 1 ? "req" : "constraint"}
          {round.constraints.length === 1 ? "" : "s"}
        </span>
        <span
          className={`text-fg-3 transition-transform duration-200 ease-out-quint ${open ? "rotate-180" : ""}`}
        >
          <ChevronDown size={14} />
        </span>
      </button>
      <div
        id={panelId}
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out-quint ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-3 pb-3 pt-0.5">
            {round.index === 1 ? (
              <ul className="grid list-disc gap-[5px] pl-[18px] text-[13px] marker:text-fg-3">
                {round.constraints.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              <Constraints items={round.constraints} />
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function AskTheInterviewer({
  questions,
  asked,
  round,
  onAsk,
}: {
  questions: ClarifyingQuestion[];
  asked: string[];
  round: number;
  onAsk: (id: string) => void;
}) {
  // Answers asked in this session reveal with motion; ones restored from storage don't.
  const [fresh, setFresh] = useState<string[]>([]);
  const remaining = questions.filter((q) => !asked.includes(q.id)).length;

  return (
    <section className="mt-7">
      <div className="mb-2 flex items-baseline justify-between">
        <Eyebrow className="mb-0">Ask the interviewer</Eyebrow>
        {remaining > 0 && (
          <span className="text-[11.5px] text-fg-3 tabular-nums">{remaining} left</span>
        )}
      </div>
      <ul className="grid gap-1.5">
        {questions.map((q) => {
          const isAsked = asked.includes(q.id);
          if (!isAsked) {
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => {
                    setFresh((f) => [...f, q.id]);
                    onAsk(q.id);
                  }}
                  className="press group flex w-full items-start gap-2 rounded-[10px] px-3 py-2 text-left text-[13px] leading-[1.5] text-fg-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-hover hover:text-fg"
                >
                  <span className="min-w-0 flex-1">{q.question}</span>
                  <span className="mt-px shrink-0 text-[11.5px] font-medium text-fg-3 transition-colors duration-150 group-hover:text-accent">
                    Ask
                  </span>
                </button>
              </li>
            );
          }
          const early = q.round > round;
          return (
            <li
              key={q.id}
              className="rounded-[10px] bg-panel-2 px-3 py-2 text-[13px] leading-[1.5]"
            >
              <p className="text-fg-2">{q.question}</p>
              <div className={fresh.includes(q.id) ? "nr-reveal grid" : "grid"}>
                <div className="min-h-0 overflow-hidden">
                  <p className="mt-1.5 flex gap-2 text-fg">
                    <span
                      aria-hidden
                      className="mt-[3px] grid size-4 shrink-0 place-items-center rounded-full bg-accent-soft text-[8.5px] font-semibold text-accent"
                    >
                      IN
                    </span>
                    <span className="min-w-0 flex-1">
                      {q.answer}
                      {early && (
                        <span className="ml-1.5 inline-block rounded-full px-1.5 align-[1px] text-[10.5px] font-medium text-medium shadow-[inset_0_0_0_1px_currentColor]">
                          revealed early
                        </span>
                      )}
                    </span>
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Overflow menu beside the round progress. Restarting asks once before it clears progress. */
function InterviewMenu({ onRestart }: { onRestart: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const close = (refocus = false) => {
    setOpen(false);
    setConfirming(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      setConfirming(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Interview options"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? close() : setOpen(true))}
        className="press -my-1 inline-grid size-7 place-items-center rounded-full text-fg-3 hover:bg-hover hover:text-fg"
      >
        <More />
      </button>
      <div
        id={menuId}
        role="menu"
        inert={!open}
        data-open={open || undefined}
        className="invisible absolute right-0 top-[calc(100%+4px)] z-10 w-[212px] origin-top-right scale-[0.97] rounded-[10px] bg-panel p-1 opacity-0 shadow-pop transition-[opacity,scale,visibility] duration-150 ease-out-quint data-[open]:visible data-[open]:scale-100 data-[open]:opacity-100"
      >
        {confirming ? (
          <div className="p-2">
            <p className="text-[13px] font-medium text-fg">Restart this interview?</p>
            <p className="mt-0.5 text-[12px] leading-[1.45] text-fg-2">
              Back to round 1, and asked questions are cleared. Your sketch stays.
            </p>
            <div className="mt-2.5 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => close(true)}
                className="press h-7 rounded-md px-2.5 text-[12.5px] text-fg-2 hover:bg-hover hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  onRestart();
                  close(true);
                }}
                className="press h-7 rounded-md bg-hard px-2.5 text-[12.5px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--color-hard)_88%,#000)]"
              >
                Restart
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            role="menuitem"
            onClick={() => setConfirming(true)}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-fg-2 hover:bg-hover hover:text-fg"
          >
            <Restart size={14} />
            Restart interview
          </button>
        )}
      </div>
    </div>
  );
}

/** Keyframes Tailwind can't express inline. Hoisted and deduped by React 19. */
function InterviewStyles() {
  return (
    <style href="napkin-interview" precedence="default">{`
      .nr-enter { animation: nr-enter 240ms var(--ease-out-quint) both; }
      @keyframes nr-enter { from { opacity: 0; transform: translateY(8px) scale(0.99); } }
      .nr-reveal { animation: nr-reveal 220ms var(--ease-out-quint) both; }
      @keyframes nr-reveal { from { grid-template-rows: 0fr; opacity: 0; } to { grid-template-rows: 1fr; opacity: 1; } }
      @media (prefers-reduced-motion: reduce) {
        .nr-enter, .nr-reveal { animation-name: nr-fade; animation-duration: 150ms; }
        @keyframes nr-fade { from { opacity: 0; } }
      }
    `}</style>
  );
}
