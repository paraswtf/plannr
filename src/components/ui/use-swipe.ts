"use client";

import { useEffect, useRef } from "react";

/**
 * A sideways flick, for a screen that shows one unit at a time.
 *
 * The schedule already steps a day or a month with a pair of chevrons, and on a
 * phone those are two small targets at the top of a screen the thumb is holding
 * by the bottom. This is the same instruction given with the hand already on
 * the glass, and it is deliberately nothing more: every screen that takes it
 * keeps its arrows, so nothing whatever is reachable only by swiping.
 *
 * Touch and nothing else, for the same reason `useLongPress` is — a mouse
 * dragged sideways across a calendar is selecting text or beginning nothing at
 * all, and a trackpad's two-finger swipe is already spoken for by the browser.
 *
 * The hard part is not the arithmetic, it is not stealing the scroll. A day is
 * read by dragging it up the page, so the finger's first centimetre has to be
 * allowed to mean that. Two things arrange it, and the declarative one matters
 * more: the caller must put `touch-action: pan-y` on the surface, which is what
 * tells the compositor "vertical is yours, sideways is mine" — and is the only
 * way to say it. Calling `preventDefault` on a pointer event does not stop a
 * scroll; the spec is explicit that it has no such effect, which is the reason
 * `touch-action` exists at all. The other half is the slop below: nothing is
 * claimed until the travel is decidedly sideways.
 */

/** How far a finger must travel before the gesture belongs to anybody. */
const SLOP = 12;
/**
 * How much more sideways than up-and-down that travel must be. Roughly a
 * 35-degree cone either side of the horizontal; anything shallower is somebody
 * reading the day with an imperfectly straight thumb.
 */
const AXIS_RATIO = 1.4;
/** The shortest and longest a deliberate, unhurried swipe is asked to be. */
const MIN_COMMIT = 56;
const MAX_COMMIT = 96;
/** And where between the two it lands, as a share of the surface's width. */
const COMMIT_FRACTION = 0.25;
/** A flick instead: pixels per millisecond, and the least it must still cover. */
const FLING = 0.45;
const FLING_MIN = 24;
/** How stale the sample the speed is measured from may get. */
const SAMPLE_MS = 60;
/** How closely the sheet follows the finger, and how far it may ever go. */
const FOLLOW = 0.6;
const FOLLOW_FRACTION = 0.2;
/** How long the click a committed swipe leaves behind is waited for. */
const SUPPRESS_MS = 300;

export interface SwipeHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  onPointerCancel: (event: React.PointerEvent) => void;
}

interface SwipeState {
  /** Every finger currently down on the surface. */
  fingers: Set<number>;
  /** The one being followed, or null when there is none. */
  id: number | null;
  /** Set the moment a second finger lands: this gesture is over. */
  dead: boolean;
  startX: number;
  startY: number;
  /** Whether the travel has been judged sideways and taken. */
  taken: boolean;
  /** A position from at least `SAMPLE_MS` ago, and one from just now. */
  sampleX: number;
  sampleAt: number;
  lastX: number;
  lastAt: number;
  standDown: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Handlers to spread onto the surface, and the ref that must go on it.
 *
 * The ref is not optional. The surface follows the finger by having its own
 * transform written straight onto the node, without React hearing about it:
 * threading the offset back through state would re-render the whole calendar —
 * a few hundred absolutely positioned nodes — on every pointermove, which is
 * exactly the sixty times a second a phone cannot spare.
 *
 * Pass `undefined` to make the whole thing inert; every handler is still
 * returned, so the element spreading them does not change shape when the
 * gesture goes away.
 */
export function useSwipe(onSwipe: ((by: -1 | 1) => void) | undefined): {
  surface: React.RefObject<HTMLDivElement | null>;
  handlers: SwipeHandlers;
} {
  // Read through a ref so the handlers never change identity, and so a commit
  // always calls the newest closure: the caller writes this as an inline arrow
  // over the date currently on screen, and two flicks in a row must step from
  // the second day rather than twice from the first.
  const swipe = useRef(onSwipe);
  useEffect(() => {
    swipe.current = onSwipe;
  });

  const surface = useRef<HTMLDivElement>(null);

  const state = useRef<SwipeState>({
    fingers: new Set(),
    id: null,
    dead: false,
    startX: 0,
    startY: 0,
    taken: false,
    sampleX: 0,
    sampleAt: 0,
    lastX: 0,
    lastAt: 0,
    standDown: undefined,
  });

  /**
   * Eats the click a finger leaves behind when it lifts off a swipe.
   *
   * The same guard, and for the same reason, as the one in `useLongPress`: a
   * swipe that began on a lecture ends with a `pointerup` over that lecture,
   * and the browser dutifully fires a click at it — so a flick to tomorrow
   * would also open a drawer on the class it started from. On the document in
   * the capture phase, because by then the block may not be there at all.
   */
  const swallow = useRef(function swallow(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    lower.current();
  }).current;

  const lower = useRef(function lower() {
    const now = state.current;
    if (now.standDown !== undefined) {
      clearTimeout(now.standDown);
      now.standDown = undefined;
    }
    document.removeEventListener("click", swallow, true);
  });

  /** Moves the sheet under the finger, or puts it back. */
  const offset = useRef(function offset(px: number, animate: boolean) {
    const node = surface.current;
    if (!node) return;
    node.style.transition = animate ? "" : "none";
    node.style.transform = px === 0 ? "" : `translate3d(${px}px, 0, 0)`;
    node.style.opacity =
      px === 0 ? "" : String(1 - Math.min(0.35, Math.abs(px) / 400));
  });

  const release = useRef(function release() {
    const now = state.current;
    now.id = null;
    now.taken = false;
    now.dead = false;
    offset.current(0, true);
  });

  const handlers = useRef<SwipeHandlers>(undefined);

  handlers.current ??= {
    onPointerDown: (event) => {
      const now = state.current;
      if (event.pointerType !== "touch") return;
      now.fingers.add(event.pointerId);
      // A second finger is a pinch or a scroll with the other hand, and either
      // way it is not this. Abandoned rather than fought over.
      if (now.fingers.size > 1) {
        now.dead = true;
        if (now.taken) release.current();
        now.id = null;
        return;
      }
      if (!swipe.current) return;
      now.id = event.pointerId;
      now.dead = false;
      now.taken = false;
      now.startX = now.lastX = now.sampleX = event.clientX;
      now.startY = event.clientY;
      now.lastAt = now.sampleAt = event.timeStamp;
    },

    onPointerMove: (event) => {
      const now = state.current;
      if (now.dead || now.id !== event.pointerId || !swipe.current) return;

      const dx = event.clientX - now.startX;
      const dy = event.clientY - now.startY;

      if (!now.taken) {
        // Judged once, on the first travel past the slop, and never revisited:
        // a gesture that has been decided must not change its mind halfway and
        // start eating the scroll it already declined.
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        if (Math.abs(dx) < Math.abs(dy) * AXIS_RATIO) {
          now.dead = true;
          return;
        }
        now.taken = true;
      }

      if (event.timeStamp - now.sampleAt > SAMPLE_MS) {
        now.sampleX = now.lastX;
        now.sampleAt = now.lastAt;
      }
      now.lastX = event.clientX;
      now.lastAt = event.timeStamp;

      // Damped, and capped well short of the edge. The sheet is a hint that the
      // gesture has been understood, not a page being dragged off: letting it
      // travel the full width would promise a carousel this is not.
      const width = surface.current?.offsetWidth ?? 0;
      const cap = width > 0 ? width * FOLLOW_FRACTION : MAX_COMMIT;
      const shown = Math.max(-cap, Math.min(cap, dx * FOLLOW));
      offset.current(shown, false);
    },

    onPointerUp: (event) => {
      const now = state.current;
      now.fingers.delete(event.pointerId);
      if (now.id !== event.pointerId) return;

      // Both read before `release` below, which clears them: a guard that
      // consults state the line above has just reset is a guard that cannot
      // fire, and this one is the only thing standing between a gesture the
      // second finger killed and a day step it never asked for.
      const taken = now.taken;
      const dead = now.dead;
      const dx = event.clientX - now.startX;
      const elapsed = Math.max(1, event.timeStamp - now.sampleAt);
      const speed = Math.abs(event.clientX - now.sampleX) / elapsed;

      const width = surface.current?.offsetWidth ?? 0;
      const needed = Math.max(
        MIN_COMMIT,
        Math.min(MAX_COMMIT, width * COMMIT_FRACTION),
      );
      const far = Math.abs(dx) >= needed;
      const flung = speed >= FLING && Math.abs(dx) >= FLING_MIN;

      release.current();
      if (!taken || dead || !(far || flung)) return;

      // The click the browser is about to fire at whatever the finger came down
      // on. Armed before the callback, because the callback changes the day and
      // the block underneath may be gone by the time the click arrives.
      lower.current();
      document.addEventListener("click", swallow, true);
      now.standDown = setTimeout(() => {
        now.standDown = undefined;
        document.removeEventListener("click", swallow, true);
      }, SUPPRESS_MS);

      swipe.current?.(dx < 0 ? 1 : -1);
    },

    onPointerCancel: (event) => {
      const now = state.current;
      now.fingers.delete(event.pointerId);
      if (now.id !== event.pointerId) return;
      // The browser has claimed the finger — usually because it decided the
      // travel was a scroll after all. Nothing to argue with.
      release.current();
    },
  };

  useEffect(() => {
    const lowerNow = lower.current;
    return () => {
      lowerNow();
      document.removeEventListener("click", swallow, true);
    };
  }, [swallow]);

  return { surface, handlers: handlers.current };
}
