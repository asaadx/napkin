/** A generic robot head, used for the AI interviewer. Sized and colored by the parent (currentColor). */
export function BotIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 4v3" />
      <circle cx="12" cy="3" r="1" />
      <rect x="4" y="7" width="16" height="12" rx="4" />
      <circle cx="9.5" cy="13" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13" r="1.25" fill="currentColor" stroke="none" />
      <path d="M2 12v2M22 12v2" />
    </svg>
  );
}
