"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

import { fitFor, type Fit } from "./compact-fit";

/**
 * Measuring the space the grid has, without measuring the grid.
 *
 * This codebase has had the measure-render-measure bug once already — the
 * popover sized itself off its own content while a ResizeObserver watched that
 * content — so the shape here is chosen to make the loop impossible rather than
 * unlikely. Three things, in descending order of how much they are relied on:
 *
 *  1. **The observed element is not the rendered one.** What is watched is a
 *     wrapper whose width comes entirely from the page around it, and nothing
 *     inside it can widen it. There is no cycle in the graph to begin with.
 *  2. **In compact the grid scrolls in neither axis**, so the last remaining
 *     content-to-width channel — a scrollbar taking a dozen pixels off the
 *     available space — is closed too.
 *  3. **An identity guard on the state write.** The wrapper's *height* really
 *     does change as a result of the scale, and a ResizeObserver reports both
 *     axes, so one extra callback does arrive; it recomputes the identical
 *     answer, the guard returns the previous object, and React renders nothing.
 */

/**
 * Before paint, or the grid is seen at the wrong size for a frame. On the
 * server there is nothing to measure and a layout effect is only a warning.
 */
const useMeasureEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const same = (a: Fit | null, b: Fit) =>
  a !== null &&
  a.column === b.column &&
  a.scale === b.scale &&
  a.width === b.width &&
  a.height === b.height;

export function useCompactFit({
  enabled,
  rooms,
  bodyHeight,
  boxRef,
  probeRef,
}: {
  enabled: boolean;
  rooms: number;
  bodyHeight: number;
  /** The wrapper whose width is the space available. Never written to. */
  boxRef: RefObject<HTMLElement | null>;
  /** A zero-width element carrying the ceiling and the gutter, for reading. */
  probeRef: RefObject<HTMLElement | null>;
}): Fit | null {
  const [fit, setFit] = useState<Fit | null>(null);

  useMeasureEffect(() => {
    if (!enabled) {
      setFit((previous) => (previous === null ? previous : null));
      return;
    }
    const box = boxRef.current;
    const probe = probeRef.current;
    if (!box || !probe) return;

    const measure = () => {
      const available = box.clientWidth;
      // Both of these are written in CSS — the ceiling as an `svh` expression,
      // the gutter as a breakpoint — and the probe is the only thing that can
      // turn them into numbers without restating them here, where they would
      // become a second truth to keep in step.
      const ceiling = probe.getBoundingClientRect().height;
      const gutter =
        Number.parseFloat(
          getComputedStyle(probe).getPropertyValue("--tt-gutter"),
        ) || 0;

      // Nothing to fit into yet: a hidden tab, or the frame before layout. A
      // scale computed from zero is Infinity, and drawing that is worse than
      // waiting a frame for a real number.
      if (available <= 0 || ceiling <= 0) return;

      const next = fitFor({ available, rooms, gutter, ceiling, bodyHeight });
      setFit((previous) => (same(previous, next) ? previous : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    // The ceiling is in `svh`, which a rotation changes and a scroll does not.
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enabled, rooms, bodyHeight, boxRef, probeRef]);

  return enabled ? fit : null;
}
