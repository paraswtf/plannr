"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import { Icon, type IconName } from "./icon";

/**
 * Right-hand panel that docks beside the page rather than over it.
 *
 * Deliberately not a modal: the calendar a booking was dragged out of stays
 * live next to the form, so the span can be adjusted on the grid while the
 * panel is open. It sticks to the top of the viewport, so scrolling the page
 * behind it never scrolls the form away.
 *
 * Below the sidebar's breakpoint there is no room to dock anything: 420px of
 * panel would leave a phone's calendar about thirty pixels to live in. There
 * the panel is simply full width, and the screens that own it decide whether
 * that means underneath the calendar or in place of it.
 *
 * Omitting `onClose` makes it permanent — no close button and no escape key.
 * The Book screen uses that: there the panel is the point of the page, so
 * dismissing it would leave nothing to do.
 *
 * Note what it deliberately does NOT do, since the modal next door does both:
 * it neither traps focus nor locks body scroll, at any width. Nothing here is
 * ever laid over the page — docked it is a column beside it, and below the
 * breakpoint it is a block stacked under it, in the page's own flow either
 * way. Locking scroll would strand a phone above a panel it cannot reach, and
 * a trap would fence the caret into a form the user is meant to be able to
 * leave for the calendar behind. Opening still moves focus in and closing
 * still gives it back, which is what a non-modal panel owes a keyboard.
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
  const panel = useRef<HTMLElement>(null);

  // Call sites write `onClose` as an inline arrow, so it is a new function on
  // every render of the screen around it. Read through a ref, the effect below
  // can key on whether the panel is dismissible rather than on the identity of
  // the callback, and so stops re-firing — and re-stealing focus — mid-edit.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  const dismissible = Boolean(onClose);

  useEffect(() => {
    // The permanent panel is the page rather than something that arrived over
    // it: no Escape to answer, and grabbing the caret on load would be rude.
    if (!open || !dismissible) return;

    const opener = document.activeElement;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Escape belongs to whatever is laid over the page, and this panel never
      // is. A dialog opened from inside it — or the shell's nav overlay, which
      // is drawn the same way — would otherwise take the panel down with it on
      // one keypress, since both listen on the document and neither can see
      // the other. `aria-modal` is the mark of the layer that is over the top.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      close.current?.();
    };
    document.addEventListener("keydown", onKey);

    // Below the breakpoint the panel is stacked under the calendar, usually
    // off the bottom of the screen, so this is also what scrolls it into view:
    // otherwise tapping an event on a phone looks like nothing happened.
    panel.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      // Back to the block that was clicked, or a keyboard restarts at the top
      // of the document every time a panel is dismissed.
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open, dismissible]);

  if (!open) return null;

  return (
    <aside
      ref={panel}
      // Focusable by script only. `role="dialog"` without `aria-modal` is the
      // honest description: a dialog the rest of the page is still live behind.
      tabIndex={-1}
      role="dialog"
      aria-label={title}
      // The slide-in belongs to the docked panel only: on a full-width one it
      // would be 26px of the page hanging off the right edge mid-animation.
      // `scroll-mt` is for the scroll that focusing the panel provokes — the
      // hamburger bar is stuck to the top of the page, and without a margin to
      // stop short by, the title and close button arrive underneath it.
      className="bg-surface flex w-full scroll-mt-(--topbar-h) flex-col shadow-[inset_0_1px_0_var(--hair)] outline-none lg:sticky lg:h-screen lg:w-(--drawer-w) lg:max-w-[92vw] lg:shrink-0 lg:animate-[plrSlideIn_0.24s_cubic-bezier(0.4,0,0.2,1)] lg:shadow-[inset_1px_0_0_var(--hair),-12px_0_34px_rgba(13,17,23,0.07)]"
      style={
        {
          top: "var(--topbar-h)",
          // The docked width is a prop, and a prop can only reach CSS that
          // branches on screen size through a custom property.
          "--drawer-w": `${width}px`,
        } as CSSProperties
      }
    >
      <div
        className="flex shrink-0 items-start gap-3 px-4 pt-5 pb-4 sm:px-6 lg:pt-6"
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
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg sm:h-8 sm:w-8"
          >
            <Icon name="x" size={16} color="var(--muted)" />
          </button>
        )}
      </div>

      {/*
       * The scroll only bites where the panel has a height to overflow — docked
       * and a screen tall. Full width, it is a section of the page and grows to
       * whatever it holds, so the page scrolls it rather than the panel.
       */}
      <div className="plr-scroll min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {children}
      </div>

      {footer && (
        <div
          className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 px-4 pt-4 pb-6 sm:px-6"
          style={{ boxShadow: "0 -1px 0 var(--hair-soft)" }}
        >
          {footer}
        </div>
      )}
    </aside>
  );
}
