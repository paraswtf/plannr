import { describe, expect, it } from "vitest";

import {
  AXIS_RATIO,
  commits,
  intentOf,
  landingOf,
  SLOP,
  travelOf,
} from "./swipe-gesture";

/**
 * The numbers that decide how the swipe feels.
 *
 * All of it, because none of it can be tested where it runs: happy-dom has no
 * layout and no finger. What the arithmetic has to get right is a balance the
 * user stated in one sentence — easy to scroll vertically, a bit more intention
 * to move sideways — so most of what follows is about the drags that must NOT
 * be taken.
 */

/** A phone. */
const W = 390;

describe("what counts as reading", () => {
  it("takes nothing at all until the finger has committed to something", () => {
    expect(intentOf(0, 0)).toBe("undecided");
    expect(intentOf(SLOP - 1, 0)).toBe("undecided");
    expect(intentOf(0, SLOP - 1)).toBe("undecided");
  });

  it("leaves a straight read alone", () => {
    expect(intentOf(0, 60)).toBe("elsewhere");
    expect(intentOf(0, -200)).toBe("elsewhere");
  });

  it("leaves a read with a wandering thumb alone", () => {
    // The case the scrolling version got wrong: a column of text dragged up the
    // page by a thumb that is not a set square. Forty pixels of sideways drift
    // over a hundred of travel is somebody reading, and the day must not move.
    expect(intentOf(40, 100)).toBe("elsewhere");
    expect(intentOf(-40, 100)).toBe("elsewhere");
    // Even a drag that is *mostly* sideways is left alone until it is decidedly
    // so — anything under twice as wide as it is tall.
    expect(intentOf(30, 20)).toBe("elsewhere");
  });

  it("takes a drag that is plainly across the screen", () => {
    expect(intentOf(40, 0)).toBe("sideways");
    expect(intentOf(-40, 0)).toBe("sideways");
    expect(intentOf(60, 25)).toBe("sideways");
  });

  it("puts the boundary exactly where it says it does", () => {
    const down = 20;
    expect(intentOf(down * AXIS_RATIO + 0.5, down)).toBe("sideways");
    expect(intentOf(down * AXIS_RATIO - 0.5, down)).toBe("elsewhere");
  });
});

describe("what counts as meaning it", () => {
  it("does not step the day for a drag that went nowhere", () => {
    expect(commits(20, 0, W)).toBe(false);
    expect(landingOf(20, 0, W)).toBe(0);
    expect(landingOf(-20, 0, W)).toBe(0);
  });

  it("steps for a drag carried most of the way across", () => {
    expect(landingOf(-W * 0.3, 0, W)).toBe(1);
    expect(landingOf(W * 0.3, 0, W)).toBe(-1);
  });

  it("steps for a flick that never got far", () => {
    // Thrown rather than carried: short, but fast enough that stopping it dead
    // would feel like the screen had refused.
    expect(commits(-24, 0.8, W)).toBe(true);
    expect(landingOf(-24, 0.8, W)).toBe(1);
    // A fast twitch of a few pixels is still a twitch.
    expect(commits(-6, 0.8, W)).toBe(false);
  });

  it("asks a phone and a tablet for a comparable share of the screen", () => {
    // The distance is a fraction of the pane, held between a floor and a
    // ceiling so a narrow phone does not become trigger-happy and a wide tablet
    // does not ask for half an arm's length.
    expect(commits(-49, 0, 200)).toBe(true);
    expect(commits(-47, 0, 200)).toBe(false);
    expect(commits(-89, 0, 1200)).toBe(true);
    expect(commits(-87, 0, 1200)).toBe(false);
  });
});

describe("following the hand", () => {
  it("moves with the finger, exactly", () => {
    expect(travelOf(-120, W)).toBe(-120);
    expect(travelOf(37.5, W)).toBe(37.5);
  });

  it("stops at the neighbour, because past it nothing is drawn", () => {
    expect(travelOf(-W * 3, W)).toBe(-W);
    expect(travelOf(W * 3, W)).toBe(W);
  });

  it("stays still before there is anything to measure", () => {
    expect(travelOf(80, 0)).toBe(0);
    expect(travelOf(80, Number.NaN)).toBe(0);
  });
});
