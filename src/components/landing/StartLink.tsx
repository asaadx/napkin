import Link from "next/link";
import { Ic } from "./icons";

const SIZE = {
  md: "h-[34px] gap-[7px] rounded-[9px] px-3.5 text-[13.5px]",
  lg: "h-[42px] gap-[7px] rounded-[10px] px-[18px] text-[14.5px]",
} as const;

/** The one call to action. Every "Start practicing" goes to the problem list. */
export function StartLink({ size = "md", arrow = false }: { size?: keyof typeof SIZE; arrow?: boolean }) {
  return (
    <Link
      href="/problems"
      className={`press group inline-flex items-center justify-center whitespace-nowrap bg-fg font-medium text-panel hover:bg-[color-mix(in_srgb,var(--color-fg)_86%,var(--color-app))] ${SIZE[size]}`}
    >
      Start practicing
      {arrow ? (
        <span className="transition-transform duration-200 ease-out-quint group-hover:translate-x-0.5">
          <Ic name="arrow" size={16} />
        </span>
      ) : null}
    </Link>
  );
}
