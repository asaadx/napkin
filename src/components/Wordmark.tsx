import Link from "next/link";
import { Logo } from "./brand/Logo";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Napkin home"
      className={`press inline-flex h-8 items-center rounded-lg px-1.5 text-fg hover:bg-hover ${className}`}
    >
      <Logo wordmarkClassName="max-[440px]:hidden" />
    </Link>
  );
}
