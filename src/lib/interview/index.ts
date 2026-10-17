/**
 * Per-prompt interview progress: the current round and which clarifying
 * questions were asked. Persisted in localStorage under `napkin:interview:<slug>`
 * and shared by every `useInterview` instance on the page (and across tabs via
 * the `storage` event).
 *
 * `useInterview` is for client components. `readInterview` is safe anywhere:
 * on the server, or with storage blocked, it returns the default state.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  DEFAULT_INTERVIEW,
  advanceRound,
  clampInterview,
  interviewStorageKey,
  markAsked,
  parseInterview,
  serializeInterview,
  type InterviewState,
} from "./state";

export type { InterviewState } from "./state";
export { DEFAULT_INTERVIEW, interviewStorageKey } from "./state";

const listeners = new Set<() => void>();
/** Snapshot cache keyed by slug, so `useSyncExternalStore` sees a stable object until the raw value changes. */
const cache = new Map<string, { raw: string | null; value: InterviewState }>();
/** In-memory fallback for when storage is blocked or full. */
const memory = new Map<string, InterviewState>();

function readRaw(slug: string): string | null {
  try {
    return window.localStorage.getItem(interviewStorageKey(slug));
  } catch {
    return null;
  }
}

export function readInterview(slug: string): InterviewState {
  if (typeof window === "undefined") return DEFAULT_INTERVIEW;
  const fallback = memory.get(slug);
  if (fallback) return fallback;
  const raw = readRaw(slug);
  const hit = cache.get(slug);
  if (hit && hit.raw === raw) return hit.value;
  const value = parseInterview(raw);
  cache.set(slug, { raw, value });
  return value;
}

function writeInterview(slug: string, state: InterviewState | null) {
  try {
    if (state) window.localStorage.setItem(interviewStorageKey(slug), serializeInterview(state));
    else window.localStorage.removeItem(interviewStorageKey(slug));
    memory.delete(slug);
  } catch {
    // Storage blocked or full: keep progress in memory for this page.
    if (state) memory.set(slug, state);
    else memory.delete(slug);
  }
  listeners.forEach((l) => l());
}

function update(slug: string, fn: (s: InterviewState) => InterviewState) {
  const prev = readInterview(slug);
  const next = fn(prev);
  if (next !== prev) writeInterview(slug, next);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith("napkin:interview:")) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const serverSnapshot = () => DEFAULT_INTERVIEW;

export function useInterview(slug: string, totalRounds: number) {
  const stored = useSyncExternalStore(subscribe, () => readInterview(slug), serverSnapshot);
  const total = Math.max(1, Math.floor(totalRounds));
  const state = clampInterview(stored, total);

  const nextRound = useCallback(() => update(slug, (s) => advanceRound(s, total, Date.now())), [slug, total]);
  const ask = useCallback((id: string) => update(slug, (s) => markAsked(s, id)), [slug]);
  const reset = useCallback(() => writeInterview(slug, null), [slug]);

  return useMemo(
    () => ({
      round: state.round,
      totalRounds: total,
      isLastRound: state.round >= total,
      nextRound,
      asked: state.asked,
      ask,
      reset,
    }),
    [state.round, state.asked, total, nextRound, ask, reset],
  );
}
