import { describe, expect, it } from "vitest";

import { CENTRE, restingAt, stepFrom, SNAP_TOLERANCE } from "./carousel-step";

/**
 * Reading the rail.
 *
 * The whole of the swipe that can be tested at all. What it has to get right is
 * narrow and unforgiving: say "moved" only once the scrolling has actually
 * stopped, and never say it twice for one gesture.
 */

/** A phone, less the page's gutters. */
const W = 358;

describe("at rest", () => {
  it("says nothing when the pane on screen is the one being read", () => {
    expect(stepFrom(restingAt(W), W)).toBe(0);
  });

  it("forgives the subpixel arithmetic a real device produces", () => {
    // A rail genuinely at rest rarely reads a whole number: the pane is a
    // percentage of a viewport that is not a multiple of anything.
    expect(stepFrom(W * CENTRE - 0.34, W)).toBe(0);
    expect(stepFrom(W * CENTRE + 0.5, W)).toBe(0);
  });
});

describe("in flight", () => {
  it("says nothing while the rail is between two panes", () => {
    for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(stepFrom(W * (CENTRE + fraction), W), `at +${fraction}`).toBe(0);
      expect(stepFrom(W * (CENTRE - fraction), W), `at -${fraction}`).toBe(0);
    }
  });

  it("holds its tongue right up to the tolerance and not past it", () => {
    const just = W * CENTRE + SNAP_TOLERANCE - 0.01;
    const past = W * CENTRE + SNAP_TOLERANCE + 0.01;
    expect(stepFrom(just, W)).toBe(0);
    expect(stepFrom(past, W)).toBe(0);
    // ...and once it has arrived at the neighbour, it says so.
    expect(stepFrom(W * (CENTRE + 1), W)).toBe(1);
  });
});

describe("landed", () => {
  it("reads a pane either way", () => {
    expect(stepFrom(W * (CENTRE - 1), W)).toBe(-1);
    expect(stepFrom(W * (CENTRE + 1), W)).toBe(1);
  });

  it("never steps twice for one gesture", () => {
    // An overscroll or a hurried flick can leave the rail past the end. Two
    // days for one flick is not what anybody meant by it.
    expect(stepFrom(W * 4, W)).toBe(1);
    expect(stepFrom(-W * 3, W)).toBe(-1);
  });
});

describe("before there is anything to measure", () => {
  it("says nothing when the rail has no width yet", () => {
    // A hidden tab, or the frame before layout. Dividing by it gives Infinity,
    // and stepping the day on Infinity is worse than waiting a frame.
    expect(stepFrom(0, 0)).toBe(0);
    expect(stepFrom(120, 0)).toBe(0);
    expect(stepFrom(120, -5)).toBe(0);
    expect(stepFrom(120, Number.NaN)).toBe(0);
  });
});
