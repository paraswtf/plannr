"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

/** Space kept between a popover and the edge of the window. */
const GUTTER = 8;
/** Space between the control and the panel it opens — what `mt-1` used to be. */
const GAP = 4;

/**
 * Measuring has to happen before the browser paints, or the panel is seen in
 * the wrong place for a frame. On the server there is nothing to measure and a
 * layout effect is only a warning, so it steps aside there.
 */
const useMeasureEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * How the panel's width relates to the control that opened it. A portalled
 * panel is a child of `<body>`, so `w-full` and `min-w-full` no longer mean
 * "the trigger" — the width has to be measured and passed back down.
 */
export type PopoverMatch = "width" | "min-width";

export interface PopoverPlacement {
  /** Viewport coordinates: the panel is `position: fixed`. */
  left: number;
  top: number;
  width?: number;
  minWidth?: number;
  maxWidth: number;
  maxHeight: number;
  /** Which side of the trigger it ended up on. */
  side: "below" | "above";
  /** The trigger has been scrolled out of every box that contains it. */
  hidden: boolean;
}

const samePlacement = (a: PopoverPlacement | null, b: PopoverPlacement) =>
  a !== null &&
  a.left === b.left &&
  a.top === b.top &&
  a.width === b.width &&
  a.minWidth === b.minWidth &&
  a.maxWidth === b.maxWidth &&
  a.maxHeight === b.maxHeight &&
  a.side === b.side &&
  a.hidden === b.hidden;

/**
 * Height of the bar carrying the hamburger, read from the variable that owns
 * it rather than hardcoded, so a panel flipped upwards near the top of a phone
 * screen stops short of the bar instead of hanging over it. The variable
 * collapses to 0 above the sidebar's breakpoint, which is exactly the answer
 * this wants there.
 */
const topBarHeight = () => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    "--topbar-h",
  );
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) ? px : 0;
};

/**
 * Every box between the trigger and the page that has an overflow of its own —
 * a dialog's scrolling body, the panel that rounds its corners off, a scrolling
 * table.
 *
 * The panel escaped these; its trigger did not. Scroll a dialog's body far
 * enough and the control is gone under the header while the panel, glued to
 * where the control now is, floats over the title. Nothing about the viewport
 * says that has happened — only these boxes do — so the panel has to be told
 * about them to know when to go quiet. Collected once per opening: an element
 * does not start or stop scrolling while a dropdown is up, but it certainly
 * moves, so only the *list* is cached and the rects are read every frame.
 */
const clippersAbove = (anchor: HTMLElement | null) => {
  const boxes: HTMLElement[] = [];
  let el = anchor?.parentElement ?? null;
  while (el && el !== document.body) {
    const { overflowX, overflowY } = getComputedStyle(el);
    if (overflowX !== "visible" || overflowY !== "visible") boxes.push(el);
    el = el.parentElement;
  }
  return boxes;
};

/**
 * Where a popover goes, in viewport coordinates, and how big it may get there.
 *
 * The panel is `position: fixed` in a portal at the end of `<body>`, because an
 * `overflow-y: auto` ancestor — a dialog's body, a drawer's body, a scrolling
 * table — clips absolutely positioned children on the cross axis too, so a
 * picker opened in the lower half of a form used to be cut in half. Fixed
 * coordinates mean nothing about the panel's position can be expressed in CSS
 * any more: every edge it must avoid is measured here.
 *
 * Horizontally it keeps the behaviour it always had. A panel wider than the
 * control that opened it, anchored to the left of a control near the right of a
 * narrow screen, spills past the edge of the window — and an overflow like that
 * widens the document, which is how a page that looks fine ends up scrolling
 * sideways. Flipping only helps when the other edge actually fits, so a panel
 * with nowhere to flip to stays left-aligned — the start of the text is the
 * part worth keeping on screen — and is capped at the room it has left instead.
 * A cap in `vw` cannot do that job: it knows the width of the window but not how
 * far along it the trigger sits.
 *
 * Vertically it picks the side with room for the panel and caps the panel at
 * that room, so a list opened near the bottom of the window opens upwards
 * rather than off the bottom, and one that fits neither way scrolls inside
 * whatever room it got.
 *
 * And because the panel left the container but the trigger did not, it also
 * reports when the trigger has been scrolled out of every box that holds it —
 * see {@link clippersAbove}. Following a control off the top of a dialog's body
 * and over its title is the failure the portal would otherwise trade the
 * clipping for.
 */
export function usePopoverPlacement(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  options: {
    match?: PopoverMatch;
    /** Tallest the panel wants to be; the room available caps it further. */
    maxHeight?: number;
  } = {},
): PopoverPlacement | null {
  const { match, maxHeight: wanted } = options;
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null);

  useMeasureEffect(() => {
    if (!open) {
      setPlacement((prev) => (prev === null ? prev : null));
      return;
    }

    const clippers = clippersAbove(anchorRef.current);

    const measure = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const box = anchor.getBoundingClientRect();
      // The document element's size rather than the window's: the window counts
      // a classic scrollbar as usable space, and a panel that ends underneath
      // one has still widened the page.
      const viewport = document.documentElement.clientWidth;
      /*
       * The bottom of what can actually be seen, in layout coordinates.
       *
       * `clientHeight` is the layout viewport, which a software keyboard does
       * not shrink — so a panel that autofocuses a search box, as the pickers
       * do, was measured against a window half of which the keyboard was
       * sitting on. The visual viewport is the one that knows, and its
       * `offsetTop` is what converts its bottom edge back into the coordinates
       * `getBoundingClientRect` reports in. The listeners for it were already
       * here; nothing had ever read it.
       */
      const layoutHeight = document.documentElement.clientHeight;
      const visual = window.visualViewport;
      const viewportHeight = visual
        ? Math.min(layoutHeight, visual.height + visual.offsetTop)
        : layoutHeight;

      // What the panel measures now already carries the last frame's caps. That
      // is fine in one direction — a cap can only make it smaller — and the
      // observers below re-run this the moment it grows back into new room, so
      // a window opened up wider settles in a frame rather than staying narrow.
      const natural = panel.offsetWidth;
      const width =
        match === "width"
          ? box.width
          : match === "min-width"
            ? Math.max(natural, box.width)
            : natural;

      const spills = box.left + width > viewport - GUTTER;
      const flipFits = box.right - width >= GUTTER;
      const align = spills && flipFits ? "right" : "left";
      // Right-aligned means "hug the trigger's right edge" — but not past the
      // window's own, or a control sitting in the gutter would take the panel
      // out there with it.
      const left =
        align === "right"
          ? Math.max(GUTTER, Math.min(box.right, viewport - GUTTER) - width)
          : Math.max(GUTTER, box.left);
      const maxWidth = Math.max(viewport - GUTTER - left, 0);
      // `min-width` beats `max-width` in the cascade, so the floor the trigger
      // sets has to be capped here as well: a control sitting flush against the
      // right edge of the window would otherwise take a panel as wide as itself
      // straight past that edge, which is the overflow this all exists to stop.
      const minWidth =
        match === "min-width" ? Math.min(box.width, maxWidth) : undefined;

      // `scrollHeight` rather than the rendered height: the rendered one is
      // whatever the last cap allowed, and a panel that was squeezed into a
      // small gap would otherwise read as short enough to stay there forever.
      const desired = Math.min(
        Math.max(panel.scrollHeight, panel.offsetHeight),
        wanted ?? Infinity,
      );
      const ceiling = topBarHeight() + GUTTER;
      const below = viewportHeight - GUTTER - (box.bottom + GAP);
      const above = box.top - GAP - ceiling;
      // Below unless it genuinely does not fit and above is roomier: a list
      // that hops over its control for a few pixels is more disorienting than
      // one that scrolls.
      const side = desired <= below || below >= above ? "below" : "above";
      const maxHeight = Math.max(
        Math.min(side === "below" ? below : above, wanted ?? Infinity),
        0,
      );
      const top =
        side === "below"
          ? box.bottom + GAP
          : Math.max(ceiling, box.top - GAP - Math.min(desired, maxHeight));

      // The window, minus the bar the hamburger sits on, intersected with every
      // box the trigger is scrolled inside. Once the trigger has left that
      // region entirely there is nothing left to hang off, and a panel that
      // keeps hanging off it is a panel drawn over a dialog's title.
      let clipTop = ceiling - GUTTER;
      let clipLeft = 0;
      let clipRight = viewport;
      let clipBottom = viewportHeight;
      for (const el of clippers) {
        const r = el.getBoundingClientRect();
        clipTop = Math.max(clipTop, r.top);
        clipLeft = Math.max(clipLeft, r.left);
        clipRight = Math.min(clipRight, r.right);
        clipBottom = Math.min(clipBottom, r.bottom);
      }
      const hidden =
        box.bottom <= clipTop ||
        box.top >= clipBottom ||
        box.right <= clipLeft ||
        box.left >= clipRight;

      const next: PopoverPlacement = {
        left,
        top,
        width: match === "width" ? box.width : undefined,
        minWidth,
        maxWidth,
        maxHeight,
        side,
        hidden,
      };
      setPlacement((prev) => (samePlacement(prev, next) ? prev : next));
    };

    measure();

    // Scroll and resize arrive far faster than a panel needs to move, and each
    // pass reads layout; one placement per frame keeps a flicked scroll from
    // measuring a hundred times on the way down.
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    // Captured, so it hears every scrolling ancestor and not just the page —
    // the container this panel escaped from is usually the one moving.
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    // A phone's keyboard changes the visual viewport without changing the
    // layout one, and nothing else reports that.
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);

    // Content can change under an open panel — search results arriving, a month
    // with six rows instead of five — and the anchor can move without anything
    // scrolling at all.
    const observer = new ResizeObserver(schedule);
    if (panelRef.current) observer.observe(panelRef.current);
    if (anchorRef.current) observer.observe(anchorRef.current);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      observer.disconnect();
    };
  }, [open, anchorRef, panelRef, match, wanted]);

  return placement;
}
