import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { StartLink } from "@/components/landing/StartLink";
import { SiteFooter } from "@/components/nav/SiteFooter";
import { SiteHeader } from "@/components/nav/SiteHeader";

export const metadata: Metadata = {
  title: "Napkin: Practice system design out loud",
};

export default function Home() {
  return (
    <>
      <SiteHeader actions={<StartLink />} />
      <Landing />
      <SiteFooter />
    </>
  );
}
