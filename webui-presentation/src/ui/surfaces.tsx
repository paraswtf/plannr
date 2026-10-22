import type { CSSProperties, ReactNode } from "react";

import { Icon, type IconName } from "./icon";

/*
 * The deck's house surfaces, so every slide draws a card or a chip the same
 * way. See DESIGN.md: a card only when elevation means something, a Bezel
 * (src/ui/frames.tsx) for anything precious, plain spacing for the rest.
 */

/**
 * A single-layer card: the raised surface, a hairline, the first shadow.
 * `accent` is the one highlighted card in a set (the top of a ranking, the
 * thing being talked about).
 */
export function Card({
  children,
  accent = false,
  flipId,
  className,
  style,
}: {
  children: ReactNode;
  accent?: boolean;
  flipId?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      data-flip-id={flipId}
      // The edge and shadow are classes, not inline var(): a card may travel
      // in a morph, and the morph cannot start from an inline var().
      className={`relative rounded-[22px] ${accent ? "bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent-line),var(--shadow-1)]" : "bg-raised shadow-[inset_0_0_0_1px_var(--line),var(--shadow-1)]"} ${className ?? ""}`}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * A small tag: a problem a feature solves, a method, a status. Rounded
 * rectangle, not a pill. `accent` for the one that matters.
 */
export function Chip({
  children,
  icon,
  accent = false,
  size = 20,
  flipId,
  className,
  style,
}: {
  children: ReactNode;
  icon?: IconName;
  accent?: boolean;
  /** Font size in canvas px; padding and icon follow it. */
  size?: number;
  /** Lets the chip travel between slides (see src/deck/morph.ts). */
  flipId?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      data-flip-id={flipId}
      className={`inline-flex items-center font-medium ${accent ? "bg-accent-soft text-accent" : "bg-sunken text-body"} ${className ?? ""}`}
      style={{
        fontSize: size,
        lineHeight: 1.2,
        gap: size * 0.45,
        borderRadius: 12,
        padding: `${size * 0.42}px ${size * 0.7}px`,
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={size * 1.1} />}
      {children}
    </span>
  );
}
