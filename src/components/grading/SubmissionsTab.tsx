"use client";

import { useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useGrading, type GradeDimension, type GradeResult, type Submission } from "@/lib/grading";
import { formatElapsed } from "@/lib/voice";

/**
 * The Submissions tab: the latest graded attempt as a LeetCode-style result
 * panel, then a list of past attempts. Lives in a ~340px side card that
 * already scrolls, so this component never sets its own overflow.
 */
export function SubmissionsTab() {
  const { submissions, status } = useGrading();
  const grading = status === "grading";

  // null = follow the newest submission. A new submission resets the selection.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const latestId = submissions[0]?.id;
  const [seenLatestId, setSeenLatestId] = useState(latestId);
  if (latestId !== seenLatestId) {
    setSeenLatestId(latestId);
    setSelectedId(null);
  }
  const selected = submissions.find((s) => s.id === selectedId) ?? submissions[0];
  const topRef = useRef<HTMLDivElement>(null);

  const open = (id: string) => {
    setSelectedId(id === latestId ? null : id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    topRef.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div ref={topRef} className="flex scroll-mt-4 flex-col gap-3 p-4 text-[13px] text-fg">
      <GradingStyles />
      <MockNote />
      {grading ? (
        <GradingSkeleton />
      ) : selected ? (
        <Result key={selected.id} submission={selected} isLatest={selected.id === latestId} />
      ) : (
        <EmptyState />
      )}
      {submissions.length > 0 && (
        <History
          submissions={submissions}
          selectedId={grading ? null : (selected?.id ?? null)}
          onOpen={open}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function MockNote() {
  return (
    <p className="flex items-center gap-1.5 text-[11.5px] leading-4 text-fg-3">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-medium" />
      Mock grading: real AI grading coming soon
    </p>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[10px] px-6 py-12 text-center shadow-[inset_0_0_0_1px_var(--color-line)]">
      <span className="mb-1 grid size-9 place-items-center rounded-full bg-panel-2 text-fg-3">
        <ClipboardIcon />
      </span>
      <p className="text-[14px] font-medium text-fg">Submit your attempt to get graded.</p>
      <p className="max-w-[240px] text-[12.5px] leading-5 text-fg-2">
        Your sketch and transcript are scored against a six-part system design rubric.
      </p>
    </div>
  );
}

function GradingSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">Grading your attempt</span>
      <div className="flex flex-col gap-2">
        <Bone className="h-6 w-28" />
        <Bone className="h-3 w-44" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Card className="flex flex-col gap-2">
          <Bone className="h-3 w-12" />
          <Bone className="h-7 w-20" />
        </Card>
        <Card className="flex flex-col gap-2">
          <Bone className="h-3 w-14" />
          <Bone className="h-7 w-16" />
        </Card>
      </div>
      <Bone className="h-3.5 w-full" />
      <Bone className="h-3.5 w-3/4" />
      <Card className="flex flex-col gap-3.5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="flex justify-between">
              <Bone className="h-3" style={{ width: `${48 + ((i * 17) % 30)}%` }} />
              <Bone className="h-3 w-7" />
            </div>
            <Bone className="h-1.5 w-full" />
          </div>
        ))}
      </Card>
      <p className="text-center text-[12px] text-fg-3">Reading your sketch and transcript…</p>
    </div>
  );
}

function Bone({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={`ng-bone rounded-[5px] bg-panel-2 ${className}`} style={style} />;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-[10px] bg-panel p-3.5 shadow-[inset_0_0_0_1px_var(--color-line)] ${className}`}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result panel
// ---------------------------------------------------------------------------

const LEVEL: Record<string, { label: string; tone: string }> = {
  staff: { label: "Staff signal", tone: "text-easy" },
  senior: { label: "Senior signal", tone: "text-easy" },
  "mid-level": { label: "Mid-level signal", tone: "text-medium" },
  "below bar": { label: "Below bar", tone: "text-hard" },
};

const SHORT_LEVEL: Record<string, string> = {
  staff: "Staff",
  senior: "Senior",
  "mid-level": "Mid-level",
  "below bar": "Below bar",
};

function levelOf(result: GradeResult) {
  if (result.insufficient) return { label: "Not enough to grade", tone: "text-fg-2" };
  return LEVEL[result.level_signal] ?? { label: "Graded", tone: "text-fg" };
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const shortDateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

function Result({ submission, isLatest }: { submission: Submission; isLatest: boolean }) {
  const r = submission.result;
  const level = levelOf(r);
  const duration = submission.durationMs > 0 ? formatElapsed(submission.durationMs) : "–";

  return (
    <article className="ng-enter flex flex-col gap-3" aria-label="Grading result">
      <header className="flex flex-col gap-0.5">
        <h3 className={`text-[20px] font-semibold tracking-[-0.01em] ${level.tone}`}>{level.label}</h3>
        <p className="text-[12px] text-fg-3">
          {isLatest ? "Latest · " : ""}
          {dateFmt.format(submission.createdAt)}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2.5">
        <Card>
          <p className="mb-1 text-[12px] text-fg-2">Score</p>
          <p className="text-[26px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">
            {r.insufficient ? "–" : r.overall_score}
            <span className="ml-1 text-[13px] font-medium text-fg-3">/ 100</span>
          </p>
        </Card>
        <Card>
          <p className="mb-1 text-[12px] text-fg-2">Session</p>
          <p className="text-[26px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">{duration}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-fg-3 tabular-nums">
            {submission.transcriptWords} words · {submission.shapeCount} shapes
          </p>
        </Card>
      </div>

      <p className="text-[13.5px] leading-[1.55] text-fg">{r.headline}</p>

      {r.dimensions.length > 0 && (
        <Card>
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <h4 className="font-semibold">Rubric</h4>
            <span className="text-[12px] text-fg-3">Tap a row for evidence</span>
          </div>
          <ul className="-mx-1.5 flex flex-col">
            {r.dimensions.map((d, i) => (
              <RubricRow key={d.name} dimension={d} index={i} />
            ))}
          </ul>
        </Card>
      )}

      {(r.strengths.length > 0 || r.top_improvements.length > 0) && (
        <Card className="flex flex-col gap-3.5">
          {r.strengths.length > 0 && (
            <section>
              <h4 className="mb-2 flex items-center gap-1.5 font-semibold text-easy">
                <CheckIcon />
                What went well
              </h4>
              <ul className="flex list-disc flex-col gap-1.5 pl-4 leading-[1.5] text-fg-2 marker:text-fg-3">
                {r.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </section>
          )}
          {r.top_improvements.length > 0 && (
            <section>
              <h4 className="mb-2 flex items-center gap-1.5 font-semibold text-medium">
                <ArrowUpIcon />
                To improve
              </h4>
              <ol className="flex flex-col gap-2.5">
                {r.top_improvements.map((imp, i) => (
                  <li key={imp.issue} className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-1.5 leading-[1.5]">
                    <span className="font-mono text-[11.5px] leading-[19.5px] text-fg-3">{i + 1}</span>
                    <p className="font-medium text-fg">{imp.issue}</p>
                    <p className="col-start-2 text-fg-2">{imp.what_strong_looks_like}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </Card>
      )}

      {r.next_drill && (
        <div className="rounded-[10px] bg-accent-soft p-3.5">
          <h4 className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.01em] text-accent uppercase">
            <TargetIcon />
            Next drill
          </h4>
          <p className="leading-[1.5] text-fg">{r.next_drill}</p>
        </div>
      )}
    </article>
  );
}

const BAR_TONE: Record<number, string> = { 1: "bg-hard", 2: "bg-medium", 3: "bg-easy", 4: "bg-easy" };

function RubricRow({ dimension: d, index }: { dimension: GradeDimension; index: number }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full flex-col gap-1.5 rounded-md px-1.5 py-1.5 text-left transition-[background-color,scale] duration-150 ease-[var(--ease-out-quint)] hover:bg-hover active:scale-[0.99]"
      >
        <span className="flex w-full items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{d.name}</span>
          <span className="text-[12px] text-fg-2 tabular-nums">
            {d.score}
            <span className="text-fg-3"> / 4</span>
          </span>
          <ChevronIcon
            className={`text-fg-3 transition-transform duration-200 ease-[var(--ease-out-quint)] ${open ? "rotate-180" : ""}`}
          />
        </span>
        <span className="flex w-full gap-1" role="img" aria-label={`${d.score} out of 4`}>
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2">
              {n <= d.score && (
                <span
                  className={`ng-seg block h-full rounded-full ${BAR_TONE[d.score]}`}
                  style={{ animationDelay: `${index * 45 + n * 35}ms` }}
                />
              )}
            </span>
          ))}
        </span>
      </button>
      <div
        id={panelId}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[var(--ease-out-quint)] ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-1.5 px-1.5 pt-1 pb-2.5 text-[12.5px] leading-[1.5]">
            <p className="border-l-2 border-line pl-2 text-fg-2">{d.evidence}</p>
            <p className="text-fg">{d.feedback}</p>
          </div>
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function History({
  submissions,
  selectedId,
  onOpen,
}: {
  submissions: Submission[];
  selectedId: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="mt-2 flex flex-col gap-1.5">
      <h4 className="flex items-baseline justify-between px-0.5 font-semibold">
        All submissions
        <span className="font-mono text-[11.5px] font-normal text-fg-3">{submissions.length}</span>
      </h4>
      <ul className="overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_var(--color-line)]">
        {submissions.map((s, i) => {
          const level = levelOf(s.result);
          const on = s.id === selectedId;
          return (
            <li key={s.id} className={i ? "border-t border-line" : ""}>
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                aria-current={on ? "true" : undefined}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-[background-color] duration-150 ease-[var(--ease-out-quint)] hover:bg-hover ${on ? "bg-panel-2" : ""}`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate font-medium ${level.tone}`}>
                    {s.result.insufficient ? "Not graded" : (SHORT_LEVEL[s.result.level_signal] ?? "Graded")}
                  </span>
                  <span className="text-[11.5px] text-fg-3 tabular-nums">
                    {shortDateFmt.format(s.createdAt)}
                    {s.durationMs > 0 ? ` · ${formatElapsed(s.durationMs)}` : ""}
                  </span>
                </span>
                <span className="font-mono text-[13px] text-fg-2 tabular-nums">
                  {s.result.insufficient ? "–" : s.result.overall_score}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Motion and icons
// ---------------------------------------------------------------------------

/** Keyframes Tailwind can't express inline. Hoisted and deduped by React 19. */
function GradingStyles() {
  return (
    <style href="napkin-grading" precedence="default">{`
      .ng-bone { position: relative; overflow: hidden; }
      .ng-bone::after {
        content: ""; position: absolute; inset: 0;
        background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-fg) 6%, transparent), transparent);
        transform: translateX(-100%);
        animation: ng-shimmer 1.3s linear infinite;
      }
      @keyframes ng-shimmer { to { transform: translateX(100%); } }
      .ng-seg { transform-origin: left center; animation: ng-grow 420ms var(--ease-out-quint) both; }
      @keyframes ng-grow { from { transform: scaleX(0.2); opacity: 0; } }
      .ng-enter { animation: ng-enter 260ms var(--ease-out-quint) both; }
      @keyframes ng-enter { from { opacity: 0; transform: translateY(4px); } }
      @media (prefers-reduced-motion: reduce) {
        .ng-bone::after { animation: none; opacity: 0; }
        .ng-seg { animation: none; }
        .ng-enter { animation-name: ng-fade; }
        @keyframes ng-fade { from { opacity: 0; } }
      }
    `}</style>
  );
}

type IconProps = { className?: string };
const Svg = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    className={`block shrink-0 ${className}`}
  >
    {children}
  </svg>
);
const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);
const ArrowUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 17 17 7M8 7h9v9" />
  </Svg>
);
const TargetIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </Svg>
);
const ChevronIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
const ClipboardIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 13l2 2 4-4" />
  </svg>
);
