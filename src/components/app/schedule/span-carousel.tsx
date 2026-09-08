"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  intentOf,
  landingOf,
  OFFSETS,
  travelOf,
  type Offset,
} from "./swipe-gesture";

/**
 * The calendar on a rail, so a day can be pushed off the side of the screen.
 *
 * Three panes — yesterday, today, tomorrow — in a row that is moved by a single
 * `translate3d` on one element. One composited layer slides; the hundred
 * absolutely positioned lectures inside it are not laid out again, not once,
 * which is the whole reason this can be one-to-one with a finger at all.
 *
 * The axis is split rather than handed over. `touch-action: pan-y` gives the
 * browser the vertical outright, so reading the day is native and immediate and
 * has nothing of ours in front of it; the horizontal, which the browser will now
 * never claim, is ours, and `swipe-gesture.ts` decides what counts as meaning
 * it. That split is the point. A scrolling rail cannot do it — a scroller's
 * axis lock is the browser's to tune, it fires early, and once it has decided
 * sideways the vertical half of the same drag is gone.
 */

/** How long the rail takes to settle once the finger has left it. */
const SETTLE_MS = 190;
/** Out quickly, then ease into place. Snappy rather than floaty. */
const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";
/** How stale the sample a flick's speed is measured from may get. */
const SAMPLE_MS = 60;
/** How long the click a swipe leaves behind is waited for. */
const SUPPRESS_MS = 300;
/** Long enough for a step to have re-rendered, if one was ever going to. */
const JAM_MS = 600;

interface Drag {
  id: number;
  startX: number;
  startY: number;
  /** Whether the travel has been judged sideways and taken. */
  taken: boolean;
  /** Where it was taken, so the rail moves from there rather than jumping. */
  from: number;
  /** Set when this gesture is over: a second finger, or a vertical read. */
  dead: boolean;
  /** A position from at least `SAMPLE_MS` ago, and one from just now. */
  sampleX: number;
  sampleAt: number;
  lastX: number;
  lastAt: number;
}

const stillness = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
   * False on a laptop and in the week span, and then this renders the pane it
   * was given and nothing else — no track, no neighbours, no negative margins.
   * The week already pans its columns sideways inside their own scroller, and
   * two meanings for one gesture is how a control stops being trusted.
   */
  live: boolean;
  /** Identity of the span on screen. Changing it puts the rail back. */
  at: string;
  onStep: (by: -1 | 1) => void;
  /** What is now on screen, said once for a screen reader after a swipe. */
  announce: string;
  /** "day" or "month", for the sentence underneath. */
  noun: string;
  /** Draws the span `offset` steps away from the one being read. */
  pane: (offset: Offset) => React.ReactNode;
}) {
  const view = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  /** A step has been asked for and the rail is owed a reset. */
  const settling = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [swiped, setSwiped] = useState(false);

  // Read through a ref so the handlers never change identity, and so a landing
  // always calls the newest closure: the caller writes this as an arrow over
  // the date currently on screen, and two swipes must step from the second day
  // rather than twice from the first.
  const step = useRef(onStep);
  useEffect(() => {
    step.current = onStep;
  });

  /**
   * Where the rail sits: `by` panes from the one being read, plus `dx` of hand.
   *
   * Written straight onto the node rather than through state, because the
   * alternative is re-rendering three days' worth of blocks sixty times a
   * second. Percentages rather than pixels for the pane part, so nothing has to
   * be measured before the first frame can be drawn correctly.
   */
  const place = useRef(function place(by: number, dx: number, ms: number) {
    const node = track.current;
    if (!node) return;
    node.style.transition = ms > 0 ? `transform ${ms}ms ${EASE}` : "none";
    node.style.transform = `translate3d(calc(${-100 - by * 100}% + ${dx}px), 0, 0)`;
  }).current;

  /*
   * Put the pane being read back under the finger, before the frame is painted.
   *
   * This runs on arrival and again after every step, and the second case is the
   * one that matters. By the time it runs React has moved every pane along by
   * one, so the rail is transformed to a neighbour whose content has become the
   * middle pane's — writing the transform back to the middle puts the same
   * pixels in the same place. The swap has no frame of its own to be seen in.
   */
  useLayoutEffect(() => {
    if (!live) return;
    settling.current = false;
    clearTimeout(timer.current);
    place(0, 0, 0);
  }, [live, at, place]);

  /**
   * Eats the click a finger leaves behind when it lifts off a swipe.
   *
   * A swipe that began on a lecture ends with a `pointerup` over that lecture,
   * and the browser dutifully fires a click at it — so a flick to tomorrow
   * would also open a drawer on the class it started from. On the document in
   * the capture phase, because by then the block may not be there at all.
   */
  const swallow = useRef(function swallow(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    document.removeEventListener("click", swallow, true);
  }).current;

  const armSwallow = useRef(function armSwallow() {
    document.removeEventListener("click", swallow, true);
    document.addEventListener("click", swallow, true);
    setTimeout(
      () => document.removeEventListener("click", swallow, true),
      SUPPRESS_MS,
    );
  }).current;

  const land = useRef(function land(by: Offset) {
    const ms = stillness() ? 0 : SETTLE_MS;
    place(by, 0, ms);
    if (by === 0) return;

    settling.current = true;
    setSwiped(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      step.current(by);
      /*
       * If the screen does not move, put the rail back rather than leaving it.
       *
       * Nothing today declines a step, so this should never fire. It exists
       * because the alternative failure is silent and total: `settling` would
       * stay set, every later gesture would be refused, and the rail would sit
       * on a neighbour with no way back but a reload.
       */
      timer.current = setTimeout(() => {
        if (!settling.current) return;
        settling.current = false;
        place(0, 0, 0);
      }, JAM_MS);
    }, ms);
  }).current;

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      document.removeEventListener("click", swallow, true);
    },
    [swallow],
  );

  if (!live) return <>{pane(0)}</>;

  const width = () => view.current?.clientWidth ?? 0;

  return (
    <>
      <div
        ref={view}
        /*
         * `clip`, not `hidden`, and it is the load-bearing choice here.
         *
         * `overflow: hidden` on one axis makes the other a scroll container
         * whatever it was set to — which would put a scroller back around the
         * calendar, capture anything sticky that ever lands inside it, and hand
         * the browser back the axis arbitration this whole component exists to
         * take away from it. `overflow-x: clip` with `overflow-y: visible`
         * creates no scroller at all, so the page scrolls exactly as it would
         * if none of this were here.
         *
         * Out to the edges of the screen, with the page's own gutter moved
         * inside each pane: a card flush against the pane edge would have its
         * shadow shaved off down both sides, and the gesture now starts at the
         * bezel, where a thumb reaching across a phone actually lands.
         */
        className="-mx-4 touch-pan-y touch-pinch-zoom overflow-x-clip sm:-mx-6 lg:-mx-9"
        onPointerDown={(event) => {
          if (event.pointerType !== "touch" || settling.current) return;
          // A second finger is a pinch or a scroll with the other hand, and
          // either way it is not this. Abandoned rather than fought over.
          if (drag.current) {
            drag.current.dead = true;
            return;
          }
          drag.current = {
            id: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            taken: false,
            from: 0,
            dead: false,
            sampleX: event.clientX,
            sampleAt: event.timeStamp,
            lastX: event.clientX,
            lastAt: event.timeStamp,
          };
        }}
        onPointerMove={(event) => {
          const now = drag.current;
          if (!now || now.dead || now.id !== event.pointerId) return;

          const dx = event.clientX - now.startX;
          const dy = event.clientY - now.startY;

          if (!now.taken) {
            const verdict = intentOf(dx, dy);
            if (verdict === "undecided") return;
            if (verdict === "elsewhere") {
              now.dead = true;
              return;
            }
            now.taken = true;
            // The slop is paid once. From here the rail is one to one with the
            // hand, rather than starting fourteen pixels ahead of it.
            now.from = dx;
          }

          if (event.timeStamp - now.sampleAt > SAMPLE_MS) {
            now.sampleX = now.lastX;
            now.sampleAt = now.lastAt;
          }
          now.lastX = event.clientX;
          now.lastAt = event.timeStamp;

          place(0, travelOf(dx - now.from, width()), 0);
        }}
        onPointerUp={(event) => {
          const now = drag.current;
          if (now?.id !== event.pointerId) return;
          drag.current = null;
          if (!now.taken || now.dead) return;

          const span = width();
          const dx = travelOf(event.clientX - now.startX - now.from, span);
          const elapsed = Math.max(1, event.timeStamp - now.sampleAt);
          const speed = Math.abs(event.clientX - now.sampleX) / elapsed;
          const by = landingOf(dx, speed, span);

          // Armed for any taken gesture, not only a committed one: a swipe that
          // came back to where it started still began on a lecture.
          armSwallow();
          land(by);
        }}
        onPointerCancel={(event) => {
          const now = drag.current;
          if (now?.id !== event.pointerId) return;
          drag.current = null;
          // The browser has claimed the finger — usually because it decided the
          // travel was a read after all. Nothing to argue with.
          if (now.taken && !now.dead) land(0);
        }}
      >
        <div ref={track} className="flex">
          {OFFSETS.map((offset) => (
            <div
              key={offset}
              /*
               * `inert`, which is both halves of what the neighbours need: no
               * screen reader walks into two days that are not on screen, and
               * no tap lands on the sliver of tomorrow showing at the edge
               * halfway through a swipe.
               */
              inert={offset !== 0}
              className="w-full shrink-0 px-4 sm:px-6 lg:px-9"
            >
              {pane(offset)}
            </div>
          ))}
        </div>
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
