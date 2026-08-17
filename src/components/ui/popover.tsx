"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { usePopoverPlacement, type PopoverMatch } from "./use-popover-align";

/**
 * The floating half of a popover control: a panel that hangs off a trigger but
 * lives at the end of `<body>`.
 *
 * The portal is the whole point. Every one of these controls sits in a form,
 * and forms live inside a dialog's scrolling body or a drawer's — and
 * `overflow-y: auto` clips absolutely positioned children on *both* axes, so a
 * date grid opened in the lower half of a dialog was cut off at the fold on
 * every screen size, desktop included. No layout class fixes that from the
 * inside; the panel has to leave the container. Placement then becomes this
 * module's job: see {@link usePopoverPlacement} for where it puts it.
 *
 * Dismissal lives here too rather than in each control, because escaping the
 * container also escapes `contains()` — a click on a list row is no longer a
 * click inside the control that owns the list, and each control's own
 * outside-click check would have closed the panel on mousedown and eaten the
 * click that was choosing something.
 */
export function Popover({
  open,
  anchorRef,
  onClose,
  match,
  maxHeight,
  role,
  ariaLabel,
  className,
  style,
  children,
}: {
  open: boolean;
  /** The control the panel hangs from; clicks inside it are not "outside". */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  match?: PopoverMatch;
  /** Tallest the panel wants to be, before the room available caps it. */
  maxHeight?: number;
  role?: "listbox" | "dialog";
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const placement = usePopoverPlacement(open, anchorRef, panelRef, {
    match,
    maxHeight,
  });

  // Every call site writes `onClose` as an inline arrow, so a fresh identity
  // arrives on each render of the form around it. Read through a ref, the two
  // document listeners below are bound once per opening rather than torn down
  // and rebuilt on every keystroke typed into a picker's search box.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Clicking away closes the panel; without this it survives until the next
  // toggle, which reads as the control being stuck open. The trigger is spared
  // so that its own click can toggle rather than reopen what this just closed.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      close.current();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, anchorRef]);

  // Escape closes the panel and goes no further. Taken during the capture phase
  // because a dialog wrapping the control listens for escape on the document,
  // and dismissing a dropdown must not dismiss the form behind it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role={role}
      aria-label={ariaLabel}
      // Above the dialog scrim (z-50) it may be opened from, which it can only
      // be because it is a sibling of that scrim rather than a descendant.
      className={`fixed z-60 ${className ?? ""}`}
      style={{
        ...style,
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        width: placement?.width,
        minWidth: placement?.minWidth,
        maxWidth: placement?.maxWidth,
        maxHeight: placement?.maxHeight,
        // Two reasons to be invisible, both answered the same way.
        //
        // The first render exists only to be measured, and is never painted:
        // the measurement is a layout effect, so the real position is in place
        // before the browser draws the frame. The second is the trigger being
        // scrolled out of the box it lives in — a dialog's body, say — which
        // leaves the panel glued to a control nobody can see any more, drawn
        // over that dialog's title. It waits there instead, and comes back if
        // the trigger does.
        //
        // Transparent rather than `visibility: hidden` in both cases: a hidden
        // element refuses focus, and a picker's search box holds the caret the
        // whole time its panel is up.
        opacity: placement && !placement.hidden ? undefined : 0,
        pointerEvents: placement?.hidden ? "none" : undefined,
      }}
      // Callers put these controls inside a <label>, and a <button> is
      // labelable: a click that reached the label would be forwarded to the
      // trigger and pop the panel straight back open. The portal already puts
      // the panel outside the label, so this is belt and braces — but the panel
      // is also mounted from inside it, and React sends events up the tree it
      // was written in, not the one it landed in.
      onClick={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}
