"use client";

import { useEffect, useRef } from "react";

import { IconButton } from "./button";
import { Icon, type IconName } from "./icon";

/**
 * What Tab is allowed to land on. The `:not([disabled])` clauses matter more
 * than they look: a form's Save button spends most of its life disabled while
 * a mutation is in flight, and cycling onto it would read as focus vanishing.
 */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * The stops inside `root`, in document order, minus anything not actually on
 * screen — a collapsed section's controls are still in the DOM.
 */
function focusStops(root: HTMLElement | null) {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

/**
 * Which direct child of `<body>` a node lives in, or null when it lives in
 * none — `<body>` itself, which is where the browser parks the caret once the
 * thing that held it is removed, and any node already detached.
 *
 * This is how the trap below tells a control the dialog opened from the page
 * the dialog is laid over. Both are outside the panel, and the difference
 * matters: `Popover` portals its panel to the end of `<body>` — it has to, or
 * a date grid opened low in a form is clipped by the scrolling body it hangs
 * in — so a picker's search box is outside this dialog's panel while still
 * plainly belonging to it. The page behind the scrim is not: the dialog
 * renders inline where it was written, so it shares that page's block.
 */
function bodyBlock(node: unknown) {
  let el = node instanceof Element ? node : null;
  while (el?.parentElement && el.parentElement !== document.body) {
    el = el.parentElement;
  }
  return el?.parentElement === document.body ? el : null;
}

/** Modal with the prototype's icon chip, blurred scrim and pop-in. */
export function Dialog({
  open,
  title,
  subtitle,
  icon,
  iconTone = "var(--slate)",
  media,
  width = 520,
  tall = false,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  /**
   * The line under the title, drawn the same way the drawer draws its own. A
   * node, so a record's dialog can set its status badges in it.
   */
  subtitle?: React.ReactNode;
  icon?: IconName;
  iconTone?: string;
  /**
   * Something to stand where the glyph plate would — a person's `Avatar` in
   * their own record — when the dialog is about one thing that has a face.
   */
  media?: React.ReactNode;
  width?: number;
  /**
   * Hold the panel at one height whatever its body holds, so switching
   * between tabs inside it does not make the whole dialog jump. The body
   * scrolls inside the height instead of the panel growing to fit.
   */
  tall?: boolean;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // Nearly every call site writes `onClose` as an inline arrow, so a fresh
  // identity arrives on every render of the page behind the scrim. The effect
  // below must not depend on it: re-running would yank focus back to the panel
  // out of whatever field was being typed in, mid-word.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    // The nav overlay in `app-shell` hands focus back to its hamburger, which
    // it holds a ref to. A dialog has no single trigger — a row, a toolbar
    // button, a menu item — so it remembers whatever had the caret instead.
    const opener = document.activeElement;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close.current();
        return;
      }
      if (event.key !== "Tab") return;

      const box = panel.current;
      if (!box) return;

      const at = document.activeElement;
      // Tab inside a portalled popover is that popover's business. An entity
      // picker opens with the caret in its own search box, which hangs off
      // `<body>` rather than off the panel; pulling the caret back in here
      // would leave an open dropdown behind with nothing focused in it.
      const block = bodyBlock(at);
      if (block && block !== bodyBlock(box)) return;

      const stops = focusStops(box);
      const first = stops[0];
      const last = stops[stops.length - 1];
      // A dialog that is only prose still must not let Tab walk out behind the
      // scrim, so with nothing to land on the panel itself keeps the caret.
      if (!first || !last) {
        event.preventDefault();
        box.focus();
        return;
      }

      const inside = at instanceof Node && box.contains(at);
      // The panel itself counts as the front of the queue: it is what opening
      // focused, and it sits before every stop in it, so Shift+Tab from there
      // is a step backwards out of the dialog.
      const atStart = at === first || at === box;
      // Either the caret is at the end it is about to leave by, or it has
      // escaped onto the page under the scrim — a trip out to the browser's
      // chrome and back leaves it on `body`, and tabbing back in from there
      // lands on the first thing in the document, which is the shell's nav.
      // Both want the same answer: put it back at the far edge.
      if (!inside || (event.shiftKey ? atStart : at === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onKey);

    // Stop the page behind scrolling while the dialog is up, which on a phone
    // is otherwise what a finger drag on the scrim does.
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The panel rather than its first field: opening straight into a text
    // input throws iOS's keyboard up over the dialog before it has been read,
    // and it is the panel that carries the label a screen reader announces.
    panel.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = scroll;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      style={{
        background: "var(--scrim)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
      onClick={onClose}
      role="presentation"
    >
      {/*
       * The panel is the full width it is allowed and no taller than the space
       * left inside the scrim's padding — `max-h-full` reads off that padding
       * box, which is what keeps a long form on a phone from running past the
       * bottom of the screen. Only the middle section scrolls, so the title and
       * the buttons that finish the job stay where they are.
       */}
      <div
        ref={panel}
        // Focusable only by script — the trap moves the caret here on open, but
        // Tab must never land back on the box itself once it is inside.
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`plr-pop plr-scroll-edge bg-surface flex max-h-full w-full flex-col overflow-hidden rounded-[var(--radius-dialog)] outline-none sm:max-h-[86vh] ${
          tall ? "sm:h-[min(86vh,760px)]" : ""
        }`}
        style={{
          maxWidth: width,
          boxShadow: "var(--ring), var(--shadow-float)",
        }}
      >
        {/*
         * `plr-scroll-head` draws a hairline under the header once the body
         * has scrolled — none while the body sits at its top, where it would
         * be a line under nothing. CSS-only (a scroll-driven animation); where
         * that is unsupported the header simply has no line, as before.
         */}
        <div className="plr-scroll-head flex shrink-0 items-start gap-3 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
          {media && <span className="shrink-0">{media}</span>}
          {!media && icon && (
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
              style={{
                background: `color-mix(in srgb, ${iconTone} 12%, #fff)`,
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${iconTone} 18%, transparent)`,
              }}
            >
              <Icon name={icon} size={19} color={iconTone} stroke={1.9} />
            </span>
          )}
          {/*
           * The title takes the wrapper's padding rather than its own, so that
           * a subtitle sits under it rather than beside it. With none passed
           * this renders exactly what the bare `<h2 className="… pt-1.5">` did.
           */}
          <div className="min-w-0 flex-1 pt-1.5">
            <h2 className="font-display text-title text-lg font-semibold tracking-[-0.015em]">
              {title}
            </h2>
            {subtitle && (
              <p className="text-muted mt-0.5 text-sm">{subtitle}</p>
            )}
          </div>
          <IconButton
            icon="x"
            label="Close"
            size="sm"
            onClick={onClose}
            className="-mt-0.5 -mr-1.5"
          />
        </div>

        <div className="plr-scroll plr-scroll-body min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
          {children}
        </div>

        {footer && (
          // On a phone the buttons stack, full width, in the order they were
          // given — so the primary, which comes last, lands at the bottom
          // under the thumb, instead of wrapping onto a row of its own. From
          // `sm` up they sit in a row on the right. The hairline above is what
          // keeps them from reading as the last line of the form when the body
          // has scrolled up under them.
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 px-5 py-4 shadow-[0_-1px_0_var(--hair-soft)] max-sm:flex-col max-sm:items-stretch sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
