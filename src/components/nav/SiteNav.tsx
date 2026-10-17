"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/theme/useTheme";
import { Logo, Moon, Sun } from "@/components/workspace/icons";

// Only real destinations. Add a link here when its page exists.
const LINKS = [{ href: "/", label: "Problems" }];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-panel/85 backdrop-blur-md backdrop-saturate-150">
      <nav aria-label="Main" className="mx-auto flex h-14 w-full max-w-[1100px] items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Napkin home"
          className="-ml-1.5 inline-flex h-8 items-center gap-[7px] rounded-lg px-1.5 text-[15px] font-[650] tracking-[-0.01em] text-fg outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent)]"
        >
          <span className="text-accent">
            <Logo size={18} />
          </span>
          napkin
        </Link>
        <ul className="flex h-full items-stretch gap-1">
          {LINKS.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href} className="relative flex items-center">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-2 py-1 text-[13.5px] font-medium outline-none transition-colors duration-150 hover:text-fg focus-visible:shadow-[0_0_0_2px_var(--color-accent)] ${
                    active ? "text-fg" : "text-fg-2"
                  }`}
                >
                  {label}
                </Link>
                {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-fg" />}
              </li>
            );
          })}
        </ul>
        <span className="flex-1" />
        <ThemeToggle />
      </nav>
    </header>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`${next === "dark" ? "Dark" : "Light"} theme`}
      className="-mr-1.5 inline-grid size-8 place-items-center rounded-lg text-fg-2 outline-none transition-[color,background-color,transform] duration-150 ease-[var(--ease-out-quint)] hover:bg-hover hover:text-fg focus-visible:shadow-[0_0_0_2px_var(--color-accent)] active:scale-[0.96]"
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}
