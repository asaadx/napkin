"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { loadTranscript } from "../voice/storage";
import { mockGrade } from "./mockGrade";
import { sceneStorageKey, summarizeScene } from "./scene";
import type { GradeResult, GradingPrompt, Submission } from "./types";


/** How long the mock pretends to think. Long enough to read as work, short enough not to annoy. */
const GRADING_DELAY_MS = 1200;
/** Keep storage bounded; older attempts drop off the end. */
const MAX_SUBMISSIONS = 50;

export const submissionsStorageKey = (slug: string) => `napkin:submissions:${slug}`;

// ---------------------------------------------------------------------------
// Submissions store (localStorage, shared across hook instances)
// ---------------------------------------------------------------------------

const EMPTY: Submission[] = [];
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: Submission[] }>();

function isSubmission(v: unknown): v is Submission {
  const s = v as Submission;
  return (
    !!s &&
    typeof s === "object" &&
    typeof s.id === "string" &&
    typeof s.createdAt === "number" &&
    !!s.result &&
    typeof s.result === "object" &&
    Array.isArray((s.result as GradeResult).dimensions)
  );
}

function readSubmissions(slug: string): Submission[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(submissionsStorageKey(slug));
  } catch {
    // Storage blocked; behave as if there's nothing saved.
  }
  const hit = cache.get(slug);
  if (hit && hit.raw === raw) return hit.value;
  let value = EMPTY;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      value = Array.isArray(parsed) ? parsed.filter(isSubmission) : EMPTY;
    } catch {
      value = EMPTY;
    }
  }
  cache.set(slug, { raw, value });
  return value;
}

function writeSubmissions(slug: string, submissions: Submission[]) {
  const raw = JSON.stringify(submissions.slice(0, MAX_SUBMISSIONS));
  try {
    window.localStorage.setItem(submissionsStorageKey(slug), raw);
    cache.delete(slug);
  } catch {
    // Storage full or blocked: keep the result in memory for this session.
    cache.set(slug, { raw: null, value: submissions });
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith("napkin:submissions:")) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function readScene(slug: string): unknown {
  try {
    const raw = window.localStorage.getItem(sceneStorageKey(slug));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let idCounter = 0;
const newId = (now: number) => `${now.toString(36)}-${(idCounter++).toString(36)}`;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export type GradingStatus = "idle" | "grading";

export type GradingContextValue = {
  /** Newest first. */
  submissions: Submission[];
  status: GradingStatus;
  submit: () => Promise<void>;
};

const GradingContext = createContext<GradingContextValue | null>(null);

export function GradingProvider({
  slug,
  prompt,
  children,
}: {
  slug: string;
  /** The prompt being graded. Optional, but without it requirement coverage can't be checked. */
  prompt?: GradingPrompt;
  children: ReactNode;
}) {
  const submissions = useSyncExternalStore(
    subscribe,
    () => readSubmissions(slug),
    () => EMPTY,
  );
  const [status, setStatus] = useState<GradingStatus>("idle");
  const busy = useRef(false);

  const submit = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus("grading");
    try {
      // Wait first, so the scratchpad's debounced save has landed before we read it.
      await new Promise((r) => setTimeout(r, GRADING_DELAY_MS));
      const transcript = loadTranscript(slug);
      const transcriptText = transcript.segments.map((s) => s.text).join(" ");
      const scene = summarizeScene(readScene(slug));
      const result = mockGrade({
        prompt: prompt ?? { title: slug.replace(/-/g, " ") },
        transcriptText,
        shapeKinds: scene.shapeKinds,
        diagramLabels: scene.labels,
        durationMs: transcript.elapsedMs,
      });
      const now = Date.now();
      const submission: Submission = {
        id: newId(now),
        createdAt: now,
        durationMs: transcript.elapsedMs,
        transcriptWords: transcriptText.split(/\s+/).filter(Boolean).length,
        shapeCount: scene.shapeKinds.filter((k) => k !== "text").length,
        result,
        mocked: true,
      };
      writeSubmissions(slug, [submission, ...readSubmissions(slug)]);
    } finally {
      busy.current = false;
      setStatus("idle");
    }
  }, [slug, prompt]);

  const value = useMemo(() => ({ submissions, status, submit }), [submissions, status, submit]);
  return <GradingContext.Provider value={value}>{children}</GradingContext.Provider>;
}

export function useGrading(): GradingContextValue {
  const ctx = useContext(GradingContext);
  if (!ctx) throw new Error("useGrading must be used inside <GradingProvider>");
  return ctx;
}
