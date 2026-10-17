/**
 * Pure transcript assembly for the Web Speech API.
 *
 * A recording is a series of recognition *sessions*: Chrome ends recognition on
 * its own after silence or ~60s, and we start a fresh one while the user is
 * still recording. Each session numbers its results from 0, so we track how
 * many of the current session's results we've already committed, and drop text
 * that a new session (or a session ending) would otherwise add twice.
 */

export type Segment = {
  text: string;
  /** Milliseconds since the start of the recording. */
  startedAtMs: number;
};

/** A plain copy of one `SpeechRecognitionResult` (its best alternative). */
export type RecognitionResult = {
  transcript: string;
  isFinal: boolean;
};

export type TranscriptState = {
  segments: Segment[];
  /** Not-yet-final text of the current session. */
  interim: string;
  /** Recognition session the state below belongs to, or null between sessions. */
  sessionId: number | null;
  /** Results of the current session already moved into `segments`. */
  committed: number;
  /** When each result index of the current session was first heard. */
  firstSeenAtMs: number[];
  /** No final text committed yet in this session (used to dedupe on restart). */
  freshSession: boolean;
};

export type TranscriptAction =
  | { type: "restore"; segments: Segment[] }
  | { type: "sessionStart"; sessionId: number }
  | { type: "result"; sessionId: number; results: RecognitionResult[]; atMs: number }
  | { type: "sessionEnd"; sessionId: number; atMs: number }
  | { type: "reset" };

export const initialTranscript: TranscriptState = {
  segments: [],
  interim: "",
  sessionId: null,
  committed: 0,
  firstSeenAtMs: [],
  freshSession: true,
};

const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const normalize = (text: string) =>
  clean(text)
    .toLowerCase()
    .replace(/[.,!?;:]+$/g, "");

/** True if `text` repeats the last committed segment (a restart re-emitting it). */
function repeatsLast(segments: Segment[], text: string): boolean {
  const last = segments.at(-1);
  return !!last && normalize(last.text) === normalize(text);
}

function interimFrom(results: RecognitionResult[], from: number): string {
  return clean(
    results
      .slice(from)
      .filter((r) => !r.isFinal)
      .map((r) => r.transcript)
      .join(" "),
  );
}

export function transcriptReducer(
  state: TranscriptState,
  action: TranscriptAction,
): TranscriptState {
  switch (action.type) {
    case "restore":
      return { ...initialTranscript, segments: action.segments };

    case "reset":
      return initialTranscript;

    case "sessionStart":
      return {
        ...state,
        interim: "",
        sessionId: action.sessionId,
        committed: 0,
        firstSeenAtMs: [],
        freshSession: true,
      };

    case "result": {
      if (action.sessionId !== state.sessionId) return state;
      const { results, atMs } = action;

      const firstSeenAtMs = state.firstSeenAtMs.slice();
      for (let i = firstSeenAtMs.length; i < results.length; i++) firstSeenAtMs[i] = atMs;

      // Finals arrive as a contiguous prefix; commit the ones we haven't yet.
      let committed = state.committed;
      let freshSession = state.freshSession;
      const segments = state.segments.slice();
      while (committed < results.length && results[committed].isFinal) {
        const text = clean(results[committed].transcript);
        const duplicate = freshSession && repeatsLast(segments, text);
        if (text && !duplicate) {
          segments.push({ text, startedAtMs: firstSeenAtMs[committed] ?? atMs });
        }
        if (text) freshSession = false;
        committed++;
      }

      return {
        ...state,
        segments: committed === state.committed ? state.segments : segments,
        interim: interimFrom(results, committed),
        committed,
        firstSeenAtMs,
        freshSession,
      };
    }

    case "sessionEnd": {
      if (action.sessionId !== state.sessionId) return state;
      // Some engines (notably Safari) end without finalizing the last words.
      const text = state.interim;
      const keep = text && !repeatsLast(state.segments, text);
      return {
        ...state,
        segments: keep
          ? [
              ...state.segments,
              { text, startedAtMs: state.firstSeenAtMs[state.committed] ?? action.atMs },
            ]
          : state.segments,
        interim: "",
        sessionId: null,
        committed: 0,
        firstSeenAtMs: [],
        freshSession: true,
      };
    }
  }
}

/** Validates segments read back from storage. */
export function parseSegments(value: unknown): Segment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (s): s is Segment =>
      !!s &&
      typeof s === "object" &&
      typeof (s as Segment).text === "string" &&
      typeof (s as Segment).startedAtMs === "number" &&
      Number.isFinite((s as Segment).startedAtMs),
  );
}

/** "m:ss" for an elapsed time in milliseconds. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
