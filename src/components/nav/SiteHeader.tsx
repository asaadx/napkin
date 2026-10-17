"use client";

import type { ReactNode } from "react";
import { Wordmark } from "@/components/Wordmark";
import { useTheme } from "@/components/theme/useTheme";
import { Moon, Sun } from "@/components/workspace/icons";

/**
 * `actions` sit just left of the theme toggle (the landing page puts its call to action there).
 * `pill` rounds the theme toggle fully, to match the landing page's pill buttons.
 */
export function SiteHeader({ actions, pill = false }: { actions?: ReactNode; pill?: boolean } = {}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-panel/85 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-14 w-full max-w-[1100px] items-center justify-between gap-6 px-4 sm:px-6">
        <Wordmark className="-ml-1.5" />
        <div className="flex items-center gap-1.5">
          {actions}
          <ThemeToggle pill={pill} />
        </div>
      </div>
    </header>
  );
}

function ThemeToggle({ pill }: { pill: boolean }) {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`${next === "dark" ? "Dark" : "Light"} theme`}
      className={`-mr-1.5 inline-grid size-8 place-items-center ${pill ? "rounded-full" : "rounded-lg"} text-fg-2 outline-none transition-[color,background-color,transform] duration-150 ease-[var(--ease-out-quint)] hover:bg-hover hover:text-fg focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96]`}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}
