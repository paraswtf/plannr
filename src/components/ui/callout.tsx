import type { ReactNode } from "react";

import { Icon, type IconName } from "./icon";

/**
 * A boxed message inside a screen: why a save failed, what approving would
 * collide with, what a setting is about to do.
 *
 * Every screen used to draw its own — a red box here at 7% with a 30% ring, a
 * green one there at 8% — and they agreed only by accident. The tone says what
 * the message *means*, in the deck's words: `bad` is something wrong or
 * refused, `warn` needs a decision, `good` confirms, `info` explains. A tone is
 * never chosen for its colour.
 *
 * With a `title`, the title carries the tone's ink and the body drops to the
 * ordinary ink, so a paragraph of explanation is not a paragraph of red. With
 * no title, a one-line message is set in the tone's ink throughout.
 */

export type CalloutTone = "bad" | "warn" | "good" | "info" | "neutral";

const TONES: Record<CalloutTone, { box: string; ink: string; icon: IconName }> =
  {
    bad: {
      box: "bg-bad-wash shadow-[inset_0_0_0_1px_var(--bad-line)]",
      ink: "text-bad",
      icon: "alert",
    },
    warn: {
      box: "bg-warn-wash shadow-[inset_0_0_0_1px_var(--warn-line)]",
      ink: "text-warn",
      icon: "alert",
    },
    good: {
      box: "bg-good-wash shadow-[inset_0_0_0_1px_var(--good-line)]",
      ink: "text-good",
      icon: "checkCircle",
    },
    info: {
      box: "bg-info-wash shadow-[inset_0_0_0_1px_var(--info-line)]",
      ink: "text-info",
      icon: "alert",
    },
    neutral: {
      box: "bg-tint-hover shadow-[inset_0_0_0_1px_var(--hair)]",
      ink: "text-ink",
      icon: "alert",
    },
  };

export function Callout({
  tone = "info",
  title,
  icon,
  action,
  role,
  emphasis = false,
  className = "",
  children,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  /** Override the tone's glyph, or pass `null` for none. */
  icon?: IconName | null;
  /** A button that resolves the message, drawn on the trailing edge. */
  action?: ReactNode;
  /**
   * `alert` for an error that has just appeared in answer to something the
   * person did, so a screen reader says it without being asked. Left off for
   * a message that is simply part of the page.
   */
  role?: "alert" | "status";
  /**
   * For the one callout a screen leads with — a student's attendance verdict
   * — whose title is the headline of the page: set in the display face a
   * step larger, with a little more room around it.
   */
  emphasis?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const t = TONES[tone];
  const glyph = icon === undefined ? t.icon : icon;
  return (
    <div
      role={role}
      className={`flex items-start rounded-[12px] text-sm ${emphasis ? "gap-3 px-4 py-4" : "gap-2.5 px-3.5 py-3"} ${t.box} ${className}`}
    >
      {glyph && (
        <Icon
          name={glyph}
          size={16}
          stroke={2}
          className={`mt-[2px] ${t.ink}`}
        />
      )}
      <div className="min-w-0 flex-1">
        {title && (
          <p
            className={`font-semibold ${t.ink} ${emphasis ? "font-display text-md tracking-[-0.01em]" : ""}`}
          >
            {title}
          </p>
        )}
        {children && (
          <div
            className={
              title ? "text-ink mt-0.5 leading-relaxed" : `font-medium ${t.ink}`
            }
          >
            {children}
          </div>
        )}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
