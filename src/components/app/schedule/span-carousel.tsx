"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { OFFSETS, restingAt, stepFrom, type Offset } from "./carousel-step";

/**
 * The calendar on a rail, so a day can be pushed off the side of the screen.
 *
 * The first version of this followed the finger with pointer handlers and a
 * transform, and it was wrong in the way the user said it was: it damped the
 * travel to a fifth of the screen, sprang back, and then swapped the day in
 * place. Nothing ever went anywhere. The day appeared instead of arriving.
 *
 * So none of the gesture is ours any more. Three panes on a scroll-snapping
 * rail — yesterday, today, tomorrow — and the browser does the following, the
 * momentum, the rubber band at the ends and the mid-flight interception, all of
 * it on the compositor thread. That last part is the whole argument: a day can
 * hold a hundred absolutely positioned lectures, and dragging that many nodes
 * from JavaScript at sixty frames a second is exactly the thing a phone cannot
 * do. Handing the axis to the scroller costs nothing per frame, because there
 * is no per-frame work left to cost anything.
 *
 * What is left for us is three lines of bookkeeping: put the middle pane on
 * screen, notice when the scrolling stops somewhere else, and put the middle
 * pane back once the date has moved to match. Done in a layout effect, the last
 * two happen in the same frame, so the swap is invisible — the pixels before
 * and after are the same pixels.
 */

/**
 * How long after the last scroll event to look, where `scrollend` is missing.
 *
 * Only a fallback. Safari has had `scrollend` since 18 and every other engine
 * for longer, and where it exists it is the honest signal: it means the
 * scrolling has finished *and* the finger has gone. The timer has to reconstruct
 * both, which is what the pointer bookkeeping below is for.
 */
const IDLE_MS = 140;

/** Long enough for a step to have re-rendered, if one was ever going to. */
const JAM_MS = 600;

const hasScrollEnd = typeof window !== "undefined" && "onscrollend" in window;

export function SpanCarousel({
  live,
  at,
  onStep,
  announce,
  noun,
  pane,
}: {
  /**
   * Whether there is a rail at all.
   *
   * False on a laptop and in the week span, and then this component renders the
   * pane it was given and nothing else — no scroller, no neighbours, no
   * negative margins. A screen that cannot be swiped should not pay for the
   * machinery of swiping, and the week already pans its columns sideways inside
   * its own scroller: two meanings for one gesture is how a control stops being
   * trusted.
   */
  live: boolean;
  /** Identity of the span on screen. Changing it re-centres the rail. */
  at: string;
  onStep: (by: -1 | 1) => void;
  /** What is now on screen, said once for a screen reader after a flick. */
  announce: string;
  /** "day" or "month", for the sentence underneath. */
  noun: string;
  /** Draws the span `offset` steps away from the one being read. */
  pane: (offset: Offset) => React.ReactNode;
}) {
  const rail = useRef<HTMLDivElement>(null);
  /** A finger is on the glass, so wherever the rail is, it is not resting. */
  const held = useRef(false);
  /** A step has been asked for and the re-centre is owed. */
  const busy = useRef(false);
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const jam = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [swiped, setSwiped] = useState(false);

  // Read through a ref so the listeners never need rebinding, and so a settle
  // always calls the newest closure: the caller writes this as an arrow over
  // the date currently on screen, and two flicks must step from the second day
  // rather than twice from the first.
  const step = useRef(onStep);
  useEffect(() => {
    step.current = onStep;
  });

  /*
   * Put the middle pane on screen, before the frame is painted.
   *
   * This runs on arrival and again on every step, and the second case is the
   * one that matters. By the time it runs React has already moved every pane
   * along by one — what the rail is scrolled to showing has become the middle
   * pane's content — so writing the scroll position back to the middle puts
   * the same pixels under the same finger. The swap has no frame of its own to
   * be seen in. A plain effect here would leave one, and it would read as the
   * day flickering back and forth.
   */
  useLayoutEffect(() => {
    const box = rail.current;
    if (!box || !live) return;
    busy.current = false;
    box.scrollLeft = restingAt(box.clientWidth);
  }, [live, at]);

  const settle = useRef(function settle() {
    const box = rail.current;
    if (!box || busy.current || held.current) return;

    const by = stepFrom(box.scrollLeft, box.clientWidth);
    if (by === 0) return;

    busy.current = true;
    setSwiped(true);

    /*
     * If the screen does not move, put the rail back rather than leaving it.
     *
     * Nothing today declines a step, so this should never fire. It exists
     * because the alternative failure is silent and total: `busy` would stay
     * set, every later settle would return early, and the rail would sit on a
     * neighbour with the gesture dead and no way back but a reload.
     */
    clearTimeout(jam.current);
    jam.current = setTimeout(() => {
      if (!busy.current) return;
      busy.current = false;
      const now = rail.current;
      if (now) now.scrollLeft = restingAt(now.clientWidth);
    }, JAM_MS);

    step.current(by);
  }).current;

  useEffect(() => {
    const box = rail.current;
    if (!box || !live) return;

    const arm = () => {
      clearTimeout(idle.current);
      idle.current = setTimeout(settle, IDLE_MS);
    };

    // Where `scrollend` exists it says exactly this and says it once, so the
    // timer is not armed at all rather than racing it.
    const onScroll = hasScrollEnd ? null : arm;
    /*
     * The finger, which the timer alone cannot see.
     *
     * Dragging the rail to a neighbour and holding it there produces no further
     * scroll events, so the idle timer fires while the finger is still down and
     * would step the day out from under a gesture the reader has not finished —
     * and could still drag back. Hence: disarm on touch, re-arm on release.
     */
    const onDown = () => {
      held.current = true;
      clearTimeout(idle.current);
    };
    const onUp = () => {
      held.current = false;
      if (!hasScrollEnd) arm();
    };

    if (onScroll) box.addEventListener("scroll", onScroll, { passive: true });
    box.addEventListener("pointerdown", onDown, { passive: true });
    box.addEventListener("pointerup", onUp, { passive: true });
    box.addEventListener("pointercancel", onUp, { passive: true });
    if (hasScrollEnd) box.addEventListener("scrollend", settle);

    return () => {
      if (onScroll) box.removeEventListener("scroll", onScroll);
      box.removeEventListener("pointerdown", onDown);
      box.removeEventListener("pointerup", onUp);
      box.removeEventListener("pointercancel", onUp);
      if (hasScrollEnd) box.removeEventListener("scrollend", settle);
      clearTimeout(idle.current);
      clearTimeout(jam.current);
    };
  }, [live, settle]);

  if (!live) return <>{pane(0)}</>;

  return (
    <>
      <div
        ref={rail}
        /*
         * Out to the edges of the screen, with the page's own gutter moved
         * inside each pane.
         *
         * Two things at once. A rail is a scroll container and clips both axes
         * whichever one it was asked to scroll, so a card sitting flush against
         * the pane edge would have its shadow shaved off down both sides —
         * moving the gutter inward gives the shadow somewhere to be drawn. And
         * the gesture then starts at the bezel, where a thumb reaching across a
         * phone actually lands, rather than sixteen pixels in from it.
         */
        className="plr-rail -mx-4 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain sm:-mx-6 lg:-mx-9"
        style={{
          // The re-centre above must be instant. A `scroll-behavior: smooth`
          // inherited from anywhere would animate it, and the animation is
          // precisely the frame this design exists to not have.
          scrollBehavior: "auto",
        }}
      >
        {OFFSETS.map((offset) => (
          <div
            key={offset}
            /*
             * `inert`, which is both halves of what the neighbours need: no
             * screen reader walks into two days that are not on screen, and no
             * tap lands on the sliver of tomorrow showing at the edge halfway
             * through a swipe.
             */
            inert={offset !== 0}
            className="w-full shrink-0 snap-center px-4 sm:px-6 lg:px-9"
          >
            {pane(offset)}
          </div>
        ))}
      </div>

      {/*
       * A gesture nobody can see is a gesture nobody uses, and this is the only
       * place it can be said. The second sentence is the important one: the
       * arrows are not a fallback, they are how this works everywhere else, so
       * nothing is reachable only by swiping.
       */}
      <p className="text-faint mt-3 text-[12.5px]">
        Swipe across the calendar to move to the next {noun} or back to the
        last. The arrows above do the same on any device.
      </p>
      {/*
       * A swipe moves the whole screen without moving focus, so a screen reader
       * is told what it landed on. Only after one has happened: announcing the
       * day on arrival would read the heading out twice.
       */}
      <p aria-live="polite" className="sr-only">
        {swiped ? announce : ""}
      </p>
    </>
  );
}
