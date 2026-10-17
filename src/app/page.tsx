import { SiteFooter } from "@/components/nav/SiteFooter";
import { SiteHeader } from "@/components/nav/SiteHeader";
import { ProblemList } from "@/components/problems/ProblemList";
import { toPromptSummaries } from "@/components/problems/summaries";
import { getAllPrompts } from "@/lib/prompts";

export default function Home() {
  const prompts = toPromptSummaries(getAllPrompts());
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1100px] px-4 pt-8 pb-16 sm:px-6 sm:pt-10">
          <ProblemList prompts={prompts} variant="page" />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
