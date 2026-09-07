"use client";

import { useState } from "react";

import { useSwipe } from "~/components/ui/use-swipe";

/**
 * The calendar, with a sideways flick that steps whatever is on screen.
 *
 * Its own file so that `schedule-view` gains an element rather than a gesture.
 *
 * Wrapped around the whole stale-or-loaded branch rather than around the
 * calendar alone, so that a run of quick flicks is not blocked by the half
 * second each new day spends as a skeleton.
 */
export function SwipeSpan({
  onStep,
  announce,
  noun,
  children,
}: {
  /**
   * Undefined where the gesture does not belong — the week span, whose columns
   * already pan sideways inside their own scroller and would be fighting this
   * for the same finger. Two meanings for one gesture is how a control stops
   * being trusted.
   */
  onStep?: (by: -1 | 1) => void;
  /** What is now on screen, said once for a screen reader after a flick. */
  announce: string;
  /** "day" or "month", for the sentence underneath. */
  noun: string;
  children: React.ReactNode;
}) {
  const [swiped, setSwiped] = useState(false);
  const { surface, handlers } = useSwipe(
    onStep
      ? (by) => {
          setSwiped(true);
          onStep(by);
        }
      : undefined,
  );

  if (!onStep) return <>{children}</>;

  return (
    <>
      {/*
       * `clip`, not `hidden`, and it is a fix rather than a flourish.
       *
       * The sheet is pushed sideways inside a column whose padding is 16px, so
       * without this the card's edge goes past the viewport and the document
       * answers by growing a horizontal scrollbar — the page can be dragged off
       * its own edge while the calendar is being dragged off its. `hidden`
       * would stop that too, but it would also make this a scroll container,
       * which is the very scrollbar being prevented and would become the
       * nearest scrolling ancestor for anything sticky that ever lands inside.
       * `overflow-x: clip` with `overflow-y: visible` creates no scroller at
       * all. The clip margin is what keeps the card's own shadow from being
       * shaved off at the sides.
       */}
      <div className="overflow-x-clip" style={{ overflowClipMargin: 14 }}>
        <div
          ref={surface}
          {...handlers}
          // `pan-y` hands the vertical axis to the browser and keeps the
          // sideways one — the only mechanism that can say that, since
          // preventDefault on a pointer event provably cannot stop a scroll.
          // `pinch-zoom` is given back explicitly: pinning an axis otherwise
          // takes zoom away from gestures starting in here, and this is the one
          // screen a low-vision reader most needs to be able to zoom.
          className="touch-pan-y touch-pinch-zoom transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none"
        >
          {children}
        </div>
      </div>

      {/*
       * A gesture nobody can see is a gesture nobody uses, and this is the only
       * place it can be said. The second sentence is the important one: the
       * arrows are not a fallback, they are the way this works everywhere else,
       * so nothing here is reachable only by swiping.
       */}
      <p className="text-faint mt-3 text-[12.5px]">
        On a touchscreen, swipe across the calendar to step to the next {noun}{" "}
        or back to the last. The arrows above do the same on any device.
      </p>
      {/*
       * A flick moves the whole screen without moving focus, so a screen reader
       * is told what it landed on. Only after one has happened: announcing the
       * day on arrival would read the heading out twice.
       */}
      <p aria-live="polite" className="sr-only">
        {swiped ? announce : ""}
      </p>
    </>
  );
}
