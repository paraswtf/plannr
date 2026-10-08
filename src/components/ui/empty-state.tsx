import type { ReactNode } from "react";

import { Icon, type IconName } from "./icon";

/**
 * What a list says when there is nothing in it.
 *
 * An empty screen is usually the first one somebody sees, so it says two
 * things and no more: what would be here, and the one way to put it there.
 * The glyph sits on a plate in the same wash as every other quiet surface, so
 * it reads as part of the app rather than as clip art; the title is a plain
 * statement ("No bookings yet"), never a joke.
 *
 * `compact` is for an empty section inside a card that has other things in it,
 * where the full-height version would push its neighbours off the screen.
 */
export function EmptyState({
  icon = "calendar",
  title,
  children,
  action,
  compact = false,
  className = "",
}: {
  icon?: IconName;
  title: ReactNode;
  /** One or two sentences: what would be here, and how it gets here. */
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center text-center ${compact ? "px-4 py-7" : "px-6 py-12"} ${className}`}
    >
      <span
        className={`bg-tint text-slate mb-3.5 flex items-center justify-center rounded-[12px] shadow-[inset_0_0_0_1px_var(--hair-soft)] ${compact ? "h-9 w-9" : "h-11 w-11"}`}
      >
        <Icon name={icon} size={compact ? 17 : 20} stroke={1.9} />
      </span>
      <p
        className={`font-display text-title font-semibold tracking-[-0.01em] ${compact ? "text-base" : "text-md"}`}
      >
        {title}
      </p>
      {children && (
        <div className="text-muted mt-1 max-w-[46ch] text-sm">{children}</div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
