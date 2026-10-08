import type { ReactNode } from "react";

import { Icon, type IconName } from "./icon";

export type BadgeTone =
  "neutral" | "slate" | "red" | "green" | "orange" | "gradient";

/*
 * The tones are named for their colour, as they always were, but each one is
 * a state from globals.css underneath: red is `bad`, green `good`, orange
 * `warn`, slate `info`. So a badge and a callout saying the same thing are the
 * same red, and every ink clears 5.5:1 on its wash — the orange one used to be
 * a 4.1:1 amber that an 11px label could not afford.
 */
const TONES: Record<BadgeTone, string> = {
  neutral: "bg-neutral-wash text-muted",
  slate: "bg-info-wash text-info",
  red: "bg-bad-wash text-bad",
  green: "bg-good-wash text-good",
  orange: "bg-warn-wash text-warn",
  // The brand gradient as a wash rather than a fill: white type on the solid
  // gradient fell to 2:1 over its orange end, and an 11px label cannot spare
  // that. Laid thinly under a deep violet ink it still reads as the brand's
  // own colour, which is what marks a "Major" out from the plain tones.
  gradient:
    "bg-[linear-gradient(120deg,rgba(122,46,143,0.14),rgba(232,69,94,0.13)_58%,rgba(246,167,59,0.18))] text-[#6b2880]",
};

const DOT_COLOR: Partial<Record<BadgeTone, string>> = {
  red: "var(--red)",
  green: "var(--green)",
  orange: "var(--orange)",
  slate: "var(--slate)",
};

/**
 * A short status word.
 *
 * `dot` is for state that is live or decided — a room in use now, a verdict on
 * a request — and is meant to be rare: a dot in front of every label is
 * decoration, and the deck's rule is that a dot always means something.
 */
export function Badge({
  children,
  tone = "neutral",
  dot = false,
  icon,
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  /**
   * A glyph before the words, for a badge whose meaning must not rest on its
   * colour alone ("No teacher" with an alert). Drawn in the badge's own ink.
   */
  icon?: IconName;
  className?: string;
}) {
  return (
    // `whitespace-nowrap` keeps a badge on one line, but on its own it also lets
    // one long enough to beat its container push the page sideways — role names
    // are typed by an administrator and run to 60 characters, and on a 390px
    // phone a single one of those is wider than the card holding it. The cap and
    // the truncation bound it to whatever room it is given; the dot is held at
    // its size so the label is what gives way.
    <span
      className={`text-2xs inline-flex max-w-full items-center gap-1.5 rounded-[6px] px-2 py-1 font-semibold whitespace-nowrap ${TONES[tone]} ${className}`}
    >
      {icon && <Icon name={icon} size={12} stroke={2.2} className="shrink-0" />}
      {dot && (
        <span
          className="h-[6px] w-[6px] shrink-0 rounded-full"
          style={{ background: DOT_COLOR[tone] ?? "currentColor" }}
        />
      )}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
