"use client";

import { useEffect } from "react";

import { Icon, type IconName } from "./icon";

/** Modal with the prototype's icon chip, blurred scrim and pop-in. */
export function Dialog({
  open,
  title,
  icon,
  iconTone = "var(--slate)",
  width = 520,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  icon?: IconName;
  iconTone?: string;
  width?: number;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Stop the page behind scrolling while the dialog is up.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{
        background: "rgba(13,17,23,0.42)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="plr-pop plr-scroll bg-surface flex max-h-[86vh] w-full flex-col overflow-y-auto rounded-[18px] p-6"
        style={{ maxWidth: width, boxShadow: "var(--shadow-float)" }}
      >
        <div className="mb-4 flex items-start gap-3">
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
          <h2 className="font-display text-title flex-1 pt-1.5 text-[19px] font-bold tracking-[-0.02em]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg"
          >
            <Icon name="x" size={16} color="var(--muted)" />
          </button>
        </div>

        <div className="flex-1">{children}</div>

        {footer && (
          <div className="mt-5 flex items-center justify-end gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
