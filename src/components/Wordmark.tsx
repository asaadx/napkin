import Link from "next/link";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`font-semibold tracking-tight hover:opacity-80 ${className}`}>
      napkin
    </Link>
  );
}
