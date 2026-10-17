import Link from "next/link";
import { Logo } from "./workspace/icons";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Napkin home"
      className={`press inline-flex h-8 items-center gap-[7px] rounded-lg px-1.5 text-[16px] font-[650] tracking-[-0.01em] text-fg hover:bg-hover ${className}`}
    >
      <span className="text-accent">
        <Logo />
      </span>
      <span className="max-[440px]:hidden">napkin</span>
    </Link>
  );
}
