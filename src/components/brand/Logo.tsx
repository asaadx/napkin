type MarkProps = { size?: number; className?: string };

/** The Napkin "Stylish N" mark. Inherits color via currentColor. */
export function LogoMark({ size = 22, className = "" }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`block shrink-0 ${className}`}
    >
      <rect x="3.5" y="3" width="4.75" height="18" rx="2.375" fill="currentColor" />
      <rect x="15.75" y="3" width="4.75" height="18" rx="2.375" fill="currentColor" />
      <path d="M9.75 6.67 14.25 12.67v4.66L9.75 11.33Z" fill="currentColor" />
    </svg>
  );
}

/** Mark plus "Napkin" wordmark, in the foreground color. */
export function Logo({
  size = 22,
  className = "",
  wordmarkClassName = "",
}: {
  size?: number;
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 text-fg ${className}`}>
      <LogoMark size={size} />
      <span
        className={`text-[17.5px] leading-none font-bold tracking-[-0.04em] ${wordmarkClassName}`}
      >
        Napkin
      </span>
    </span>
  );
}
