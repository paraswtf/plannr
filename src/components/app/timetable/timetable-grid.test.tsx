/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { TimetableGrid, type GridEvent, type GridRoom } from "./timetable-grid";

/**
 * Where the two gestures on a booked block meet.
 *
 * The grid has owned press-and-drag since it was written, and a block now also
 * answers a press-and-hold or a right-click by opening its details. The pair
 * are easy to get wrong in ways that only show up under a real finger, so the
 * orders that matter are pinned here: a plain click still opens; a right-click
 * opens the details instead; and a right-click *during* a drag opens nothing,
 * because answering it would put a panel over a move still running underneath
 * that would then commit itself on release.
 */

const TZ = "Asia/Kolkata";

const ROOMS: GridRoom[] = [
  { id: "room-1", code: "403" },
  { id: "room-2", code: "404" },
];

/** 10:00–11:00 IST on a fixed Wednesday. */
const LECTURE: GridEvent = {
  occurrenceId: "occ-1",
  eventId: "evt-1",
  roomId: "room-1",
  start: new Date("2026-08-12T04:30:00.000Z"),
  end: new Date("2026-08-12T05:30:00.000Z"),
  originalStart: new Date("2026-08-12T04:30:00.000Z"),
  title: "Data Structures",
};

beforeAll(() => {
  // happy-dom has no pointer capture, and the grid takes it the moment a drag
  // begins. A no-op is the right stand-in: capture only changes where later
  // events are routed, and the test dispatches them at the block itself.
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
});

afterEach(cleanup);

function grid(props: {
  onEventClick?: (event: GridEvent) => void;
  onEventPress?: (event: GridEvent) => void;
  onEventMove?: (event: GridEvent) => void;
}) {
  render(
    <TimetableGrid
      rooms={ROOMS}
      events={[LECTURE]}
      timeZone={TZ}
      startHour={8}
      endHour={18}
      onEventClick={props.onEventClick}
      onEventPress={props.onEventPress}
      onEventMove={
        props.onEventMove ? () => props.onEventMove!(LECTURE) : undefined
      }
    />,
  );
  return screen.getByRole("button", { name: /Data Structures/ });
}

describe("a booked block", () => {
  it("opens its details on a plain click", () => {
    const onEventClick = vi.fn();
    fireEvent.click(grid({ onEventClick }));
    expect(onEventClick).toHaveBeenCalledWith(LECTURE);
  });

  it("opens them beside the pointer on a right-click", () => {
    const onEventPress = vi.fn();
    const block = grid({ onEventPress });
    const menu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(block, menu);
    expect(onEventPress).toHaveBeenCalledWith(LECTURE);
    // The browser's own menu offers "Copy link" for a block that is not a link.
    expect(menu.defaultPrevented).toBe(true);
  });

  it("answers no right-click while it is being dragged", () => {
    /*
     * The order that used to reschedule a lecture nobody meant to move: press
     * the left button on a block, drag it, then press the right button. The
     * modal would open over a drag that was still live underneath — pointer
     * capture keeps routing to the block whatever is drawn over it — and
     * releasing would commit the move that the panel had just distracted from.
     */
    const onEventPress = vi.fn();
    const onEventMove = vi.fn();
    const block = grid({ onEventPress, onEventMove });

    fireEvent.pointerDown(block, {
      pointerType: "mouse",
      button: 0,
      clientX: 40,
      clientY: 100,
    });
    fireEvent.pointerMove(block, {
      pointerType: "mouse",
      clientX: 40,
      clientY: 160,
    });

    const menu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(block, menu);

    expect(onEventPress).not.toHaveBeenCalled();
    // Still swallowed: the browser's menu over a half-finished drag is no
    // better than ours.
    expect(menu.defaultPrevented).toBe(true);
  });

  it("takes no gesture at all from a viewer given no handlers", () => {
    const block = grid({});
    const menu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(block, menu);
    // Nothing to show, so the platform keeps its own menu.
    expect(menu.defaultPrevented).toBe(false);
  });
});
