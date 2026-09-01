"use client";

import { useEffect, useRef } from "react";

/**
 * Press-and-hold, and the right-click that means the same thing.
 *
 * One gesture with two spellings, because the two pointers already disagree
 * about what "tell me more without doing anything" looks like: a finger holds
 * still, a mouse presses the other button. Both land here and both call the
 * same callback, so a screen wires up one thing rather than two.
 *
 * The rule that keeps this out of the timetable grid's drag machine is that the
 * hold timer is armed for a **touch and nothing else**, and the grid's drags
 * only ever begin for a pointer that is *not* a touch. So on every pointer that
 * can drag — a mouse, a pen — there is no timer at all, and on the one that
 * holds there is no drag. A mouse's press-and-hold stays what it has always
 * been, the beginning of a move, and both a mouse and a pen reach this through
 * `contextmenu` instead, which is the event a barrel button and Windows Ink's
 * own press-and-hold already raise.
 */

/** How long a finger must stay put before the press counts. */
const HOLD_MS = 450;
/**
 * How far it may wander first. Deliberately looser than the grid's own
 * MOVE_THRESHOLD: four pixels is a mouse's idea of "still", and a thumb resting
 * on glass drifts further than that without its owner meaning to move it.
 */
const MOVE_TOLERANCE = 9;
/** How long a swallowed click is waited for before the guard stands down. */
const SUPPRESS_MS = 700;

export interface LongPressHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

interface PressState {
  timer: ReturnType<typeof setTimeout> | undefined;
  x: number;
  y: number;
  /** The press has been answered and its trailing click is still to come. */
  fired: boolean;
  /** Stands the click guard down again if no trailing click ever arrives. */
  standDown: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Handlers to spread onto whatever should answer a hold. Pass `undefined` to
 * make the whole thing inert — every handler is still returned, so the element
 * that spreads them does not have to change shape when the gesture goes away.
 */
export function useLongPress(
  onLongPress: (() => void) | undefined,
): LongPressHandlers {
  // Read through a ref so the handlers below never change identity: every call
  // site writes this as an inline arrow, and a fresh set on each render would
  // re-attach listeners mid-press. The same reason `Drawer` and `Dialog` hold
  // their `onClose` this way.
  const press = useRef(onLongPress);
  useEffect(() => {
    press.current = onLongPress;
  });

  const state = useRef<PressState>({
    timer: undefined,
    x: 0,
    y: 0,
    fired: false,
    standDown: undefined,
  });

  /**
   * Eats the click a finger leaves behind when it lifts off a long press.
   *
   * On the document, in the capture phase, rather than on the block itself.
   * That is the whole point: by the time the finger lifts, the modal the press
   * opened is already painted over the block, so the browser hit-tests the
   * release against the *scrim* and the click lands there — which would dismiss
   * the modal the same gesture just opened. A guard on the block would never
   * see it. One click is eaten, wherever it lands, and the guard stands down.
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

  /**
   * Abandons an armed press, and takes the scroll listener down with it.
   *
   * The listener is only ever up while a timer is, because one on every scroll
   * event for the life of the page is not worth the two lines it saves. It is
   * belt and braces over `pointercancel` — which is what a browser fires when
   * it claims a touch for a scroll — but it also catches a scroll begun by a
   * second finger, and a momentum fling still coasting under a press that
   * started on top of it. Capture, because scroll does not bubble.
   */
  const cancel = useRef(function cancel() {
    const now = state.current;
    if (now.timer === undefined) return;
    clearTimeout(now.timer);
    now.timer = undefined;
    document.removeEventListener("scroll", cancel, true);
  }).current;

  /**
   * The finger has left the glass after a press was answered.
   *
   * The guard is given its stand-down deadline *here* rather than when the
   * press fired, which is the whole reason this exists: somebody who holds for
   * two seconds gets their answer at 450ms and lifts a second and a half later,
   * and a window measured from the firing would have lapsed long before the
   * click it was meant to eat ever arrived.
   */
  const released = () => {
    const now = state.current;
    if (!now.fired) return;
    now.fired = false;
    now.standDown = setTimeout(() => {
      now.standDown = undefined;
      document.removeEventListener("click", swallow, true);
    }, SUPPRESS_MS);
  };

  const handlers = useRef<LongPressHandlers>(undefined);

  handlers.current ??= {
    onPointerDown: (event) => {
      cancel();
      // A touch and nothing else: see the note at the top of the file. This is
      // what makes "the pointer that drags never holds" true rather than merely
      // likely — a pen begins a block move on pointerdown, so a pen that also
      // armed a timer would have both running at once.
      if (!press.current || event.pointerType !== "touch") return;
      const now = state.current;
      now.x = event.clientX;
      now.y = event.clientY;
      now.timer = setTimeout(() => {
        now.timer = undefined;
        document.removeEventListener("scroll", cancel, true);
        now.fired = true;
        lower.current();
        document.addEventListener("click", swallow, true);
        // The confirmation a hold owes a finger, since nothing has moved under
        // it yet. Absent on iOS, which is why it is asked for rather than
        // simply called.
        if ("vibrate" in navigator) navigator.vibrate(8);
        press.current?.();
      }, HOLD_MS);
      document.addEventListener("scroll", cancel, true);
    },

    onPointerMove: (event) => {
      const now = state.current;
      if (now.timer === undefined) return;
      if (
        Math.abs(event.clientX - now.x) > MOVE_TOLERANCE ||
        Math.abs(event.clientY - now.y) > MOVE_TOLERANCE
      ) {
        cancel();
      }
    },

    // A tap: the timer never elapsed, nothing was ever fired, and the click
    // behind it goes through to open the drawer as it always did.
    onPointerUp: () => {
      cancel();
      released();
    },
    onPointerLeave: () => {
      cancel();
      released();
    },
    onPointerCancel: () => {
      cancel();
      released();
    },

    onContextMenu: (event) => {
      if (!press.current) return;
      // Ours either way. The browser's own menu offers "Copy link" for a block
      // that is not a link, and on iOS it is the callout that would otherwise
      // sit over the panel we are about to open.
      event.preventDefault();
      const now = state.current;
      // Android raises this *after* its own long press has been answered by the
      // timer above — and sometimes a moment after the finger has lifted, which
      // is why the standing click guard counts as evidence too. Opening twice is
      // worse than the menu we have just suppressed. A right-click of its own
      // leaves no click behind, so it arms no guard.
      if (now.fired || now.standDown !== undefined) return;
      cancel();
      press.current();
    },
  };

  // Nothing may be left armed once the block has gone: the timer would fire
  // into an unmounted tree, and both document listeners would outlive the page.
  useEffect(() => {
    const lowerNow = lower.current;
    return () => {
      cancel();
      lowerNow();
      document.removeEventListener("click", swallow, true);
    };
  }, [cancel, swallow]);

  return handlers.current;
}
