"use client";

import { initialsOf } from "./entity-card";

/**
 * A person, as their initials on a tile.
 *
 * Rounded squares rather than circles — the deck draws people the same way,
 * and a 30% corner sits with the app's 10px buttons where a circle is the one
 * round thing on a screen of rounded rectangles. `solid` is for the person
 * signed in, who is the one face that should stand out; `soft` is for a list
 * of other people, where forty slate tiles would be forty dark blots.
 */
export function Avatar({
  name,
  size = 32,
  tone = "soft",
  className = "",
}: {
  name: string;
  size?: number;
  tone?: "solid" | "soft";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-[30%] font-semibold tracking-[0.01em] ${
        tone === "solid"
          ? "bg-slate text-white"
          : "bg-tint-strong text-slate-ink shadow-[inset_0_0_0_1px_var(--hair-soft)]"
      } ${className}`}
      style={{
        width: size,
        height: size,
        // About 40% of the tile, so two letters fill it without touching the
        // corners at any size from a 24px chip to a 44px header.
        fontSize: Math.round(size * 0.38),
      }}
    >
      {initialsOf(name)}
    </span>
  );
}
