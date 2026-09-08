"use client";

import { useEffect, useRef } from "react";

export interface SegmentedItem<T extends string | number> {
  value: T;
  label: string;
}

/** How long after someone's own scroll the strip leaves itself alone, in ms. */
const GESTURE_GRACE = 500;
/** How long one of our own smooth scrolls is allowed to take, in ms. */
const SELF_SCROLL = 700;

/** Pill group with a slate-filled active segment — the prototype's day tabs. */
export function Segmented<T extends string | number>({
  items,
  value,
  onChange,
  size = "md",
  ariaLabel,
}: {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  /**
   * Names the group where nothing visible does. One strip on a screen needs no
   * label — its pills say what it is. Two do: the rooms screen has a strip for
   * which rooms and a strip for how they are drawn, and unnamed they are
   * announced as two identical radio groups.
   */
  ariaLabel?: string;
}) {
  const pad =
    size === "sm" ? "px-3 py-1.5 text-[12.5px]" : "px-4 py-2 text-[13.5px]";

  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  // Whether the strip has been put right once already. The first pass is it
  // arriving where it belongs rather than travelling there, so it happens
  // instantly; every pass after that is a move, and is animated.
  const placed = useRef(false);
  // When the strip was last scrolled by whoever is reading it, and until when a
  // scroll event is one of ours and must not be mistaken for theirs.
  const theirScrollAt = useRef(0);
  const ourScrollUntil = useRef(0);

  /**
   * Keep the chosen pill on screen.
   *
   * A week of dated tabs is wider than a phone, and the value the strip shows is
   * often set from outside it — the Today button, the date picker, the day
   * arrows. The pill those choose can be a swipe away, which leaves the strip
   * looking as though it ignored the change.
   *
   * Only this container is moved, never the page. `scrollIntoView` would walk
   * every scrolling ancestor, so on a narrow screen it would drag the whole page
   * sideways — and, on the strip inside the booking panel, the panel with it —
   * to bring one pill in.
   */
  useEffect(() => {
    const scroller = scrollerRef.current;
    const pill = activeRef.current;
    if (!scroller || !pill) return;

    const animate = placed.current;
    placed.current = true;

    // A thumb is on the strip, or an iOS fling is still coasting. Correcting
    // into a gesture reads as the strip snatching itself back, which is worse
    // than the pill being one swipe away — and the gesture is the reader
    // looking at the tabs anyway, so it will find the pill on its own.
    if (Date.now() - theirScrollAt.current < GESTURE_GRACE) return;

    const view = scroller.getBoundingClientRect();
    const box = pill.getBoundingClientRect();
    // Stopped short of the edge, so a pill flush against it does not read as
    // the last one in the strip.
    const margin = 12;
    const delta =
      box.left < view.left + margin
        ? box.left - view.left - margin
        : box.right > view.right - margin
          ? box.right - view.right + margin
          : 0;
    if (delta === 0) return;

    ourScrollUntil.current = Date.now() + SELF_SCROLL;
    scroller.scrollBy({ left: delta, behavior: animate ? "smooth" : "auto" });
  }, [value]);

  return (
    // Seven dated day tabs are wider than a phone, so the strip scrolls inside
    // itself rather than pushing the page sideways. The vertical padding — and
    // the negative margin that cancels it — is there because a box that scrolls
    // on one axis clips the other, which would shave the active pill's shadow.
    <div
      ref={scrollerRef}
      // Scroll events are the one signal that catches every way the strip gets
      // moved by hand: a touch drag hands over to the browser and stops sending
      // pointer events, and a wheel or a trackpad never sends any.
      onScroll={() => {
        if (Date.now() < ourScrollUntil.current) return;
        theirScrollAt.current = Date.now();
      }}
      className="plr-scroll -my-1 max-w-full overflow-x-auto py-1"
    >
      <div
        className="inline-flex gap-1 rounded-[11px] p-1"
        style={{ background: "rgba(68,88,121,0.07)" }}
        role="radiogroup"
        aria-label={ariaLabel}
      >
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={String(item.value)}
              ref={active ? activeRef : null}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(item.value)}
              // Tab labels never wrap or shrink: they scroll out of view
              // instead. The floor on the height is the touch target, which
              // the pointer-driven layout above the sidebar's breakpoint has
              // no need of.
              className={`plr-clip inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center rounded-[8px] font-semibold whitespace-nowrap lg:min-h-0 ${pad}`}
              style={
                active
                  ? {
                      background: "var(--slate)",
                      color: "#fff",
                      boxShadow: "0 2px 8px rgba(68,88,121,0.28)",
                    }
                  : { color: "var(--muted)" }
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
