"use client";

import { useCallback, useSyncExternalStore } from "react";
import { THEME_KEY } from "./script";

export type Theme = "light" | "dark";

const CHANGE = "napkin:themechange";
const DARK_MQ = "(prefers-color-scheme: dark)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(DARK_MQ);
  mq.addEventListener("change", cb);
  window.addEventListener(CHANGE, cb);
  // Another tab changed the override.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    applyOverride(e.newValue === "light" || e.newValue === "dark" ? e.newValue : null);
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    mq.removeEventListener("change", cb);
    window.removeEventListener(CHANGE, cb);
    window.removeEventListener("storage", onStorage);
  };
}

function applyOverride(theme: Theme | null) {
  const root = document.documentElement;
  if (theme) root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
}

/** The theme actually showing: the manual override if set, else the system's. */
export function resolvedTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia(DARK_MQ).matches ? "dark" : "light";
}

/**
 * Resolved app theme plus a toggle. Toggling stores an explicit override; if the
 * override would equal the system theme we clear it instead, so the app keeps
 * following the system from then on.
 */
export function useTheme() {
  const theme = useSyncExternalStore<Theme>(subscribe, resolvedTheme, () => "light");

  const setTheme = useCallback((next: Theme) => {
    const system: Theme = window.matchMedia(DARK_MQ).matches ? "dark" : "light";
    const override = next === system ? null : next;
    applyOverride(override);
    try {
      if (override) window.localStorage.setItem(THEME_KEY, override);
      else window.localStorage.removeItem(THEME_KEY);
    } catch {
      // Private mode: the toggle still works for this page view.
    }
    window.dispatchEvent(new Event(CHANGE));
  }, []);

  const toggle = useCallback(() => setTheme(resolvedTheme() === "dark" ? "light" : "dark"), [setTheme]);

  return { theme, setTheme, toggle };
}
