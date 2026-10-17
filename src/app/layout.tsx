import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { InlineScript } from "@/components/theme/InlineScript";
import { THEME_INIT_SCRIPT } from "@/components/theme/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Napkin",
  description: "Practice system design interviews: a prompt, a scratchpad, and your voice.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script sets data-theme before paint, so the server markup and
    // the hydrated <html> legitimately differ on that one attribute.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="flex min-h-full flex-col bg-app text-fg">{children}</body>
    </html>
  );
}
