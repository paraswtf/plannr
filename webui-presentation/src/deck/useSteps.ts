"use client";

import { useRef, type RefObject } from "react";

import { gsap, useGSAP } from "./gsap";
import { useDeckRuntime } from "./runtime";

/**
 * A slide's builds, as one paused GSAP timeline with a mark per state.
 *
 * `build` lays out the whole slide in order and calls `mark()` each time the
 * slide reaches its next state:
 *
 *   useSteps(ref, step, (tl, mark) => {
 *     tl.from(".dot", { scale: 0, stagger: 0.04 });
 *     mark(); // step 1 ends here
 *     tl.from(".bar", { scaleX: 0, transformOrigin: "left" });
 *     mark(); // step 2 ends here
 *   });
 *
 * Moving forward plays to the next mark and moving back plays in reverse, so
 * builds always undo cleanly. Arriving on a later step (coming back from the
 * next slide, or a link straight to `#id/2`) lands there without playing.
 *
 * Selector strings are scoped to `scope`, as with `useGSAP`. Everything the
 * timeline touches is reverted when the slide unmounts. Change state with
 * `tl.set()` rather than `tl.call()`: a set is replayed when a step is jumped
 * to, a callback is only a side effect.
 */
export function useSteps(
  scope: RefObject<Element | null>,
  step: number,
  build: (tl: gsap.core.Timeline, mark: () => void) => void,
  dependencies: unknown[] = [],
) {
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const marks = useRef(0);
  const shown = useRef(step);
  const { instant } = useDeckRuntime();

  useGSAP(
    () => {
      const tl = gsap.timeline({ paused: true });
      let count = 0;
      tl.addLabel("s0", 0);
      build(tl, () => {
        count += 1;
        tl.addLabel(`s${count}`);
      });
      marks.current = count;
      timeline.current = tl;
      tl.seek(label(shown.current, count), false);
      return () => {
        tl.kill();
        timeline.current = null;
      };
    },
    { scope, dependencies },
  );

  useGSAP(
    () => {
      const tl = timeline.current;
      if (!tl || shown.current === step) return;
      shown.current = step;
      const target = label(step, marks.current);
      if (instant) tl.seek(target, false);
      else tl.tweenTo(target);
    },
    { dependencies: [step, instant] },
  );

  return timeline;
}

const label = (step: number, marks: number) => `s${Math.min(step, marks)}`;
