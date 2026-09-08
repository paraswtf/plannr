/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SpanCarousel } from "./span-carousel";

/**
 * The rail, as far as a machine with no screen can be shown it.
 *
 * happy-dom does no layout, so the width every threshold is a fraction of has
 * to be lent to it — but with that lent, the gesture itself runs for real: the
 * pointer events are the ones a finger produces, the intent is judged by the
 * same arithmetic, and the step either happens or does not. Which is the whole
 * of what went wrong last time. The rail moved, the day did not, and nothing
 * anywhere would have noticed.
 *
 * What is still proved nowhere is how any of it looks.
 */

const WIDTH = 390;

beforeEach(() => {
  // The one thing that has to be pretended: every threshold is a share of the
  // pane's width, and every width here is zero.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    value: WIDTH,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

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

/** The element the finger lands on. */
const surfaceOf = (container: HTMLElement) =>
  container.firstElementChild as HTMLElement;

/** A finger going down, across and up, in the steps a real one produces. */
const drag = (
  node: Element,
  { dx, dy = 0, ms = 200 }: { dx: number; dy?: number; ms?: number },
) => {
  const from = { x: 200, y: 300 };
  const touch = { pointerId: 1, pointerType: "touch" };
  fireEvent.pointerDown(node, { ...touch, clientX: from.x, clientY: from.y });
  for (const part of [0.25, 0.5, 0.75, 1]) {
    fireEvent.pointerMove(node, {
      ...touch,
      clientX: from.x + dx * part,
      clientY: from.y + dy * part,
      // Slow enough that nothing below commits on speed alone: what is being
      // asked about here is distance and direction.
      timeStamp: ms * part,
    });
  }
  fireEvent.pointerUp(node, {
    ...touch,
    clientX: from.x + dx,
    clientY: from.y + dy,
    timeStamp: ms,
  });
  // Past the settle, so the step has been taken by the time anyone looks.
  act(() => void vi.advanceTimersByTime(400));
};

describe("off the rail", () => {
  it("draws the one span, and nothing whatever around it", () => {
    // A laptop, and the week span. Both get exactly the markup this screen had
    // before there was a rail: no track, no neighbours, no negative margins
    // reaching into the page's gutters.
    const { container } = rail({ live: false });

    expect(screen.getByTestId("pane0")).toBeInTheDocument();
    expect(screen.queryByTestId("pane-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pane1")).not.toBeInTheDocument();
    expect(container.querySelector(".overflow-x-clip")).toBeNull();
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
    // landing on it would open a class from a day nobody is looking at.
    const paneOf = (offset: number) =>
      screen.getByTestId(`pane${offset}`).parentElement;

    rail();
    expect(paneOf(-1)).toHaveAttribute("inert");
    expect(paneOf(1)).toHaveAttribute("inert");
    expect(paneOf(0)).not.toHaveAttribute("inert");
  });

  it("keeps the vertical axis for the browser and takes only the sideways one", () => {
    // The single declaration that makes reading the day free. Without it the
    // page cannot be scrolled over the calendar at all.
    const { container } = rail();
    expect(surfaceOf(container)).toHaveClass("touch-pan-y");
  });
});

describe("what moves the day", () => {
  it("steps forward when the calendar is pushed to the left", () => {
    const onStep = vi.fn();
    const { container } = rail({ onStep });
    drag(surfaceOf(container), { dx: -140 });
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("steps back when it is pushed to the right", () => {
    const onStep = vi.fn();
    const { container } = rail({ onStep });
    drag(surfaceOf(container), { dx: 140 });
    expect(onStep).toHaveBeenCalledWith(-1);
  });

  it("finishes the job for a flick that never got far", () => {
    const onStep = vi.fn();
    const { container } = rail({ onStep });
    // Thrown rather than carried: 40px in 30ms.
    drag(surfaceOf(container), { dx: -40, ms: 30 });
    expect(onStep).toHaveBeenCalledWith(1);
  });
});

describe("what leaves it alone", () => {
  it("does not move the day for a read straight up the page", () => {
    const onStep = vi.fn();
    const { container } = rail({ onStep });
    drag(surfaceOf(container), { dx: 0, dy: -260 });
    expect(onStep).not.toHaveBeenCalled();
  });

  it("does not move the day for a read with a wandering thumb", () => {
    // The complaint that produced this design: a column of text dragged up the
    // page by a thumb that is not a set square. Well past every distance
    // threshold sideways, and still plainly somebody reading.
    const onStep = vi.fn();
    const { container } = rail({ onStep });
    drag(surfaceOf(container), { dx: -90, dy: -240 });
    expect(onStep).not.toHaveBeenCalled();
  });

  it("does not move the day for a sideways nudge that was not meant", () => {
    const onStep = vi.fn();
    const { container } = rail({ onStep });
    drag(surfaceOf(container), { dx: -34 });
    expect(onStep).not.toHaveBeenCalled();
  });

  it("ignores a mouse entirely", () => {
    // A pointer dragged sideways across a calendar is selecting text, or
    // beginning nothing at all.
    const onStep = vi.fn();
    const { container } = rail({ onStep });
    const node = surfaceOf(container);
    fireEvent.pointerDown(node, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 200,
      clientY: 300,
    });
    fireEvent.pointerMove(node, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 300,
    });
    fireEvent.pointerUp(node, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 300,
    });
    act(() => void vi.advanceTimersByTime(400));
    expect(onStep).not.toHaveBeenCalled();
  });
});

describe("saying where it landed", () => {
  it("holds its tongue until a swipe has actually happened", () => {
    // Announcing on arrival would read the heading out a second time to
    // somebody who has only just got here.
    const { container } = rail();
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(
      "",
    );
  });

  it("says the span once one has", () => {
    const { container } = rail({ announce: "Wednesday, 9 Sept" });
    drag(surfaceOf(container), { dx: -140 });
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(
      "Wednesday, 9 Sept",
    );
  });
});
