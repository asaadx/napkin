"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// Keys written by the scratchpad and the voice panel. Either existing means the prompt was attempted.
const KEYS = [(slug: string) => `napkin:scene:${slug}`, (slug: string) => `napkin:transcript:${slug}`];

function subscribe(onChange: () => void) {
  // "storage" covers other tabs; focus/visibility cover returning to this tab after practicing.
  window.addEventListener("storage", onChange);
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}

function isAttempted(slug: string): boolean {
  try {
    return KEYS.some((key) => {
      const raw = window.localStorage.getItem(key(slug));
      return raw !== null && raw !== "";
    });
  } catch {
    return false;
  }
}

/** Slugs with saved work in localStorage. Empty on the server and during hydration. */
export function useAttempted(slugs: readonly string[]): ReadonlySet<string> {
  const slugKey = slugs.join("\n");
  // Snapshot is a string so useSyncExternalStore can compare it by value.
  const getSnapshot = useCallback(
    () =>
      slugKey
        .split("\n")
        .filter((s) => s && isAttempted(s))
        .join("\n"),
    [slugKey],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "");
  return useMemo(() => new Set(snapshot ? snapshot.split("\n") : []), [snapshot]);
}
