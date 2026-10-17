import { parseSegments, type Segment } from "./transcript";

export type SavedTranscript = { segments: Segment[]; elapsedMs: number };

export const transcriptStorageKey = (slug: string) => `napkin:transcript:${slug}`;

/** Reads the saved transcript for a prompt; empty if missing, corrupt or storage is blocked. */
export function loadTranscript(slug: string): SavedTranscript {
  try {
    const raw = window.localStorage.getItem(transcriptStorageKey(slug));
    if (!raw) return { segments: [], elapsedMs: 0 };
    const data = JSON.parse(raw) as Partial<SavedTranscript> | unknown[];
    // Accept a bare segment array too.
    if (Array.isArray(data)) return { segments: parseSegments(data), elapsedMs: 0 };
    const segments = parseSegments(data?.segments);
    const elapsed = Number(data?.elapsedMs);
    const lastStart = segments.at(-1)?.startedAtMs ?? 0;
    return {
      segments,
      elapsedMs: Number.isFinite(elapsed) && elapsed > 0 ? Math.max(elapsed, lastStart) : lastStart,
    };
  } catch {
    return { segments: [], elapsedMs: 0 };
  }
}

export function saveTranscript(slug: string, transcript: SavedTranscript): void {
  try {
    window.localStorage.setItem(transcriptStorageKey(slug), JSON.stringify(transcript));
  } catch {
    // Storage full or unavailable; the transcript just won't survive a reload.
  }
}

export function clearTranscript(slug: string): void {
  try {
    window.localStorage.removeItem(transcriptStorageKey(slug));
  } catch {
    // Nothing to clear.
  }
}
