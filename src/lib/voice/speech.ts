/**
 * Minimal Web Speech API typings (TypeScript's DOM lib doesn't ship them) and
 * browser helpers. Safe to import on the server: nothing touches `window` at
 * module load.
 */

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: SpeechRecognitionResultLike };
}

export interface SpeechRecognitionErrorEventLike {
  readonly error: string;
  readonly message?: string;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const UNSUPPORTED_MESSAGE =
  "Live transcript needs Chrome, Edge or Safari. Your browser doesn't support speech recognition.";

/**
 * User-facing message for a recognition error, or null for errors we ignore
 * and keep recording through.
 */
export function speechErrorMessage(code: string): string | null {
  switch (code) {
    case "no-speech":
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.";
    case "audio-capture":
      return "No microphone was found, or it's in use by another app. Check your input device and try again.";
    case "network":
      return "Speech recognition needs an internet connection (your browser sends audio to its speech service). Check your connection and try again.";
    case "language-not-supported":
      return "Speech recognition doesn't support your browser's language setting.";
    default:
      return `Speech recognition stopped unexpectedly (${code}). Try again.`;
  }
}
