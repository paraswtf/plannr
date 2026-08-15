import { describe, expect, it } from "vitest";

import { dayWindow, packOverlaps } from "./day-layout";

const TZ = "Asia/Kolkata";

/**
 * A sitting on 15 August 2026, given in local decimal hours (9.5 = 09:30).
 * Kolkata runs 5h30 ahead, so the hour is turned into minutes and the offset
 * taken off — which also lets 24 mean the midnight that ends the day.
 */
const local = (hour: number) => new Date(Date.UTC(2026, 7, 15, 0, hour * 60 - 330));
const at = (fromHour: number, toHour: number) => ({
  start: local(fromHour),
  end: local(toHour),
});

describe("packOverlaps", () => {
  it("gives a day of back-to-back lectures the full width", () => {
    const placed = packOverlaps([at(9, 10), at(10, 11), at(11.5, 12.5)]);
    expect(placed.map((p) => [p.column, p.columns])).toEqual([
      [0, 1],
      [0, 1],
      [0, 1],
    ]);
  });

  it("puts two clashing lectures side by side", () => {
    const placed = packOverlaps([at(9, 11), at(10, 12)]);
    expect(placed.map((p) => [p.column, p.columns])).toEqual([
      [0, 2],
      [1, 2],
    ]);
  });

  it("narrows only the classes that clash, not the whole day", () => {
    const [before, clash1, clash2, after] = packOverlaps([
      at(8, 9),
      at(10, 11.5),
      at(11, 12),
      at(14, 15),
    ]);
    expect(before!.columns).toBe(1);
    expect([clash1!.columns, clash2!.columns]).toEqual([2, 2]);
    expect(after!.columns).toBe(1);
  });

  it("reuses a column once its lecture has finished", () => {
    // The third starts after the first ends, so it takes the first's column
    // rather than making the cluster three wide.
    const placed = packOverlaps([at(9, 10), at(9.5, 12), at(10, 11)]);
    expect(placed.map((p) => p.column)).toEqual([0, 1, 0]);
    expect(placed.every((p) => p.columns === 2)).toBe(true);
  });

  it("orders by start whatever order it was given", () => {
    const later = at(14, 15);
    const earlier = at(9, 10);
    expect(packOverlaps([later, earlier]).map((p) => p.event)).toEqual([
      earlier,
      later,
    ]);
  });

  it("copes with an empty day", () => {
    expect(packOverlaps([])).toEqual([]);
  });
});

describe("dayWindow", () => {
  it("shows the college day when nothing is on", () => {
    expect(dayWindow([], null, TZ)).toEqual({ startHour: 8, endHour: 18 });
  });

  it("stretches to hold an early start and a late finish", () => {
    expect(dayWindow([at(7.5, 8.5), at(18, 19.5)], null, TZ)).toEqual({
      startHour: 7,
      endHour: 20,
    });
  });

  it("stretches to hold the clock, so the now-line is never off the end", () => {
    expect(dayWindow([at(9, 10)], local(20.5), TZ).endHour).toBe(21);
  });

  it("ignores the clock on a day that is not today", () => {
    const evening = local(20.5);
    expect(dayWindow([at(9, 10)], null, TZ)).toEqual({ startHour: 8, endHour: 18 });
    expect(dayWindow([at(9, 10)], evening, TZ).endHour).toBeGreaterThan(18);
  });

  it("does not fold the day shut for a lecture that runs to midnight", () => {
    expect(dayWindow([at(23, 24)], null, TZ)).toEqual({ startHour: 8, endHour: 24 });
  });
});
