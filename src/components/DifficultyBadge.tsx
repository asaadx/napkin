import type { Difficulty } from "@/lib/prompts";

const COLOR: Record<Difficulty, string> = {
  easy: "text-easy",
  medium: "text-medium",
  hard: "text-hard",
};

/** Difficulty as colored text, optionally outlined in its own color (Refined style). */
export function DifficultyBadge({
  difficulty,
  outlined = true,
}: {
  difficulty: Difficulty;
  outlined?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center text-[12.5px] font-medium capitalize ${COLOR[difficulty]} ${
        outlined ? "rounded-full px-[9px] py-px shadow-[inset_0_0_0_1px_currentColor]" : ""
      }`}
    >
      {difficulty}
    </span>
  );
}
