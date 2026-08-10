"use client";

import { useEffect } from "react";

import { Icon, type IconName } from "./icon";

/**
 * Right-hand panel that docks beside the page rather than over it.
 *
 * Deliberately not a modal: the calendar a booking was dragged out of stays
 * live next to the form, so the span can be adjusted on the grid while the
 * panel is open. It sticks to the top of the viewport, so scrolling the page
 * behind it never scrolls the form away.
 *
 * Omitting `onClose` makes it permanent — no close button and no escape key.
 * The Book screen uses that: there the panel is the point of the page, so
 * dismissing it would leave nothing to do.
 */
export function Drawer({
  open,
  title,
  subtitle,
  icon,
  iconTone = "var(--slate)",
  width = 420,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTone?: string;
  width?: number;
  /** Omit to make the panel permanent. */
  onClose?: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-label={title}
      className="plr-slide-in bg-surface sticky top-0 flex h-screen shrink-0 flex-col"
      style={{
        width,
        maxWidth: "92vw",
        boxShadow:
          "inset 1px 0 0 var(--hair), -12px 0 34px rgba(13,17,23,0.07)",
      }}
    >
      <div
        className="flex items-start gap-3 px-6 pt-6 pb-4"
        style={{ boxShadow: "0 1px 0 var(--hair-soft)" }}
      >
        {icon && (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: `color-mix(in srgb, ${iconTone} 14%, #fff)`,
            }}
          >
            <Icon name={icon} size={19} color={iconTone} stroke={1.9} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-title text-[19px] font-bold tracking-[-0.02em]">
            {title}
          </h2>
          {subtitle && (
            <p className="text-muted mt-0.5 text-[12.5px]">{subtitle}</p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg"
          >
            <Icon name="x" size={16} color="var(--muted)" />
          </button>
        )}
      </div>

      <div className="plr-scroll flex-1 overflow-y-auto px-6 py-5">
        {children}
      </div>

      {footer && (
        <div
          className="flex items-center justify-end gap-2.5 px-6 pt-4 pb-6"
          style={{ boxShadow: "0 -1px 0 var(--hair-soft)" }}
        >
          {footer}
        </div>
      )}
    </aside>
  );
}
