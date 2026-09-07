/** @vitest-environment happy-dom */
import "@testing-library/jest-dom/vitest";

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DayCalendar, type DayCalendarEvent } from "./day-calendar";

/**
 * When the day scrolls itself, and when it must not.
 *
 * The calendar centres the now-line as it mounts, and it mounts again every
 * time the answer it is drawing changes — switching to a colleague's schedule
 * takes it down to a skeleton and brings it back. Left to itself it scrolled
 * on each of those, so tapping a favourite threw the page somewhere nobody
 * asked to go. Arriving is the thing worth scrolling for, and the screen above
 * is the only thing that knows which mount is one.
 */

const TZ = "Asia/Kolkata";
/** 11:00 IST — inside the drawn window, so a now-line exists to scroll to. */
const NOW = new Date("2026-09-09T05:30:00.000Z");

const EVENTS: DayCalendarEvent[] = [
  {
    id: "occ-1",
    start: new Date("2026-09-09T03:30:00.000Z"),
    end: new Date("2026-09-09T04:30:00.000Z"),
    title: "Design Thinking",
    roomCode: "403",
  },
];

let scrolled: number;

beforeEach(() => {
  scrolled = 0;
  Element.prototype.scrollIntoView = () => {
    scrolled += 1;
  };
  // happy-dom reports a zero rect, which reads as "above the fold" and is what
  // makes the component decide it has somewhere to scroll to at all.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    top: -400,
    bottom: -300,
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

const day = (props: Partial<Parameters<typeof DayCalendar>[0]> = {}) =>
  render(
    <DayCalendar events={EVENTS} timeZone={TZ} now={NOW} isToday {...props} />,
  );

describe("centring the present", () => {
  it("does it on arrival", () => {
    day();
    expect(scrolled).toBe(1);
  });

  it("does not do it on a mount the screen says is not one", () => {
    // What tapping a favourite produces: the calendar is rebuilt around a new
    // answer, and the page must stay exactly where the reader left it.
    day({ centreOnNow: false });
    expect(scrolled).toBe(0);
  });

  it("reports back, so the screen can stop asking", () => {
    const onCentred = vi.fn();
    day({ onCentred });
    expect(onCentred).toHaveBeenCalledTimes(1);
  });

  it("does not report back when there was nothing to scroll to", () => {
    // A day that is not today draws no now-line. The arrival still happened,
    // and a screen that waited for a scroll that never came would scroll on
    // whichever later mount finally had one.
    const onCentred = vi.fn();
    day({ isToday: false, onCentred });
    expect(scrolled).toBe(0);
    // No line, so nothing is reported and nothing is scrolled — the screen
    // asks again on the next mount, which is the honest behaviour: it has
    // still not arrived anywhere it could show the present.
    expect(onCentred).not.toHaveBeenCalled();
  });
});
