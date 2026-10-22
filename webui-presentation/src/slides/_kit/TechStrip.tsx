import type { ReactNode } from "react";

export interface TechItem {
  /** The exact method, API or file name, e.g. "signIn callback". */
  name: string;
  /** Optional plain-words gloss shown after the name. */
  note?: ReactNode;
}

/**
 * The "how it works" strip: exact technical names as monospace chips.
 * Keep it to 3-6 items; each chip carries class `sf-chip` so SlideFrame can
 * stagger them in.
 */
export function TechStrip({ items }: { items: TechItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-3">
      {items.map((it) => (
        <li
          key={it.name}
          className="sf-chip bg-raised inline-flex items-baseline gap-3 rounded-[12px] px-5 py-3 shadow-[inset_0_0_0_1px_var(--line-strong)]"
        >
          <span className="t-mono text-fg text-[24px] font-medium">
            {it.name}
          </span>
          {it.note && <span className="text-muted text-[21px]">{it.note}</span>}
        </li>
      ))}
    </ul>
  );
}
