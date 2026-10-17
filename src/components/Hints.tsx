"use client";

import { useState } from "react";
import { RequirementList } from "./RequirementList";

export function Hints({ hints }: { hints: string[] }) {
  const [open, setOpen] = useState(false);
  if (hints.length === 0) return null;
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-sm font-medium text-neutral-600 underline-offset-2 hover:underline dark:text-neutral-400"
      >
        {open ? "Hide hints" : `Show hints (${hints.length})`}
      </button>
      {open && (
        <div className="mt-3">
          <RequirementList title="Hints" items={hints} />
        </div>
      )}
    </section>
  );
}
