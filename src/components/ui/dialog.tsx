"use client";

import { useEffect, useRef } from "react";

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
  width = 520,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  /** The line under the title, drawn the same way the drawer draws its own. */
  subtitle?: string;
  icon?: IconName;
  iconTone?: string;
  width?: number;
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
        background: "rgba(13,17,23,0.42)",
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
        className="plr-pop bg-surface flex max-h-full w-full flex-col overflow-hidden rounded-[18px] outline-none sm:max-h-[86vh]"
        style={{ maxWidth: width, boxShadow: "var(--shadow-float)" }}
      >
        <div className="flex shrink-0 items-start gap-3 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
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
          {/*
           * The title takes the wrapper's padding rather than its own, so that
           * a subtitle sits under it rather than beside it. With none passed
           * this renders exactly what the bare `<h2 className="… pt-1.5">` did.
           */}
          <div className="min-w-0 flex-1 pt-1.5">
            <h2 className="font-display text-title text-[19px] font-bold tracking-[-0.02em]">
              {title}
            </h2>
            {subtitle && (
              <p className="text-muted mt-0.5 text-[12.5px]">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg sm:h-8 sm:w-8"
          >
            <Icon name="x" size={16} color="var(--muted)" />
          </button>
        </div>

        <div className="plr-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
          {children}
        </div>

        {footer && (
          // Wraps rather than overflows: three buttons at a phone's width put
          // themselves on two rows instead of pushing off the edge.
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 px-5 pb-5 sm:px-6 sm:pb-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
