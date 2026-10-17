"use client";

/**
 * An inline <script> that runs during HTML parsing (hard loads) and is inert on
 * the client: React warns when it renders a <script> on the client, so the
 * client copy is typed text/plain. suppressHydrationWarning covers the swap.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
