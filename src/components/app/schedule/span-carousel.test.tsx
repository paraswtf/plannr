/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SpanCarousel } from "./span-carousel";

/**
 * What the rail is made of, which is all that can be checked here.
 *
 * happy-dom has no layout engine and does not scroll, so a rail that landed on
 * tomorrow and a rail that never moved are the same zeroes to it — the reading
 * of the scroll position is proved next door in `carousel-step.test.ts`, as
 * numbers, and the motion itself is proved nowhere and has to be looked at.
 *
 * What is worth pinning down here is the shape: that a screen with no finger
 * pointing at it gets exactly what it got before there was a rail, and that the
 * two days either side of the one being read cannot be reached by anybody.
 */

afterEach(cleanup);

const rail = (props: Partial<Parameters<typeof SpanCarousel>[0]> = {}) =>
  render(
    <SpanCarousel
      live
      at="day:2026-09-08"
      onStep={() => undefined}
      announce="Tuesday, 8 Sept"
      noun="day"
      pane={(offset) => <p data-testid={`pane${offset}`}>the {offset} day</p>}
      {...props}
    />,
  );

describe("off the rail", () => {
  it("draws the one span, and nothing whatever around it", () => {
    // A laptop, and the week span. Both get exactly the markup this screen had
    // before the rail existed: no scroller, no neighbours, no negative margins
    // reaching into the page's gutters.
    const { container } = rail({ live: false });

    expect(screen.getByTestId("pane0")).toBeInTheDocument();
    expect(screen.queryByTestId("pane-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pane1")).not.toBeInTheDocument();
    expect(container.querySelector(".plr-rail")).toBeNull();
  });

  it("does not offer a gesture that is not there", () => {
    rail({ live: false });
    expect(screen.queryByText(/swipe across the calendar/i)).toBeNull();
  });
});

describe("on the rail", () => {
  it("draws the span either side of the one being read", () => {
    rail();
    expect(screen.getByTestId("pane-1")).toBeInTheDocument();
    expect(screen.getByTestId("pane0")).toBeInTheDocument();
    expect(screen.getByTestId("pane1")).toBeInTheDocument();
  });

  it("puts the neighbours beyond reach of a finger or a screen reader", () => {
    // Half a swipe leaves a sliver of tomorrow showing at the edge, and a tap
    // that landed on it would open a class from a day nobody is looking at.
    // `inert` is both halves of that, and the day being read must not have it.
    const paneOf = (offset: number) =>
      screen.getByTestId(`pane${offset}`).parentElement;

    rail();
    expect(paneOf(-1)).toHaveAttribute("inert");
    expect(paneOf(1)).toHaveAttribute("inert");
    expect(paneOf(0)).not.toHaveAttribute("inert");
  });

  it("says how to work it, and that the arrows do the same", () => {
    rail();
    expect(screen.getByText(/swipe across the calendar/i)).toBeInTheDocument();
    expect(
      screen.getByText(/the arrows above do the same/i),
    ).toBeInTheDocument();
  });

  it("holds its tongue until a swipe has actually happened", () => {
    // The live region announces where a swipe landed. Announcing on arrival
    // would read the heading out a second time to somebody who just got here.
    const { container } = rail();
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).toBeInTheDocument();
    expect(live).toHaveTextContent("");
  });
});
