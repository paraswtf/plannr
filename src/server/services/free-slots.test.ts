import { describe, expect, it } from "vitest";

import { firstFit, mergeIntervals } from "./free-slots";

const at = (iso: string) => new Date(iso);
const range = (a: string, b: string) => ({ start: at(a), end: at(b) });

// Working day 08:00-18:00 IST expressed as UTC instants (IST is UTC+5:30).
const OPEN = at("2026-10-13T02:30:00Z"); // 08:00 IST
const CLOSE = at("2026-10-13T12:30:00Z"); // 18:00 IST

describe("mergeIntervals", () => {
  it("returns an empty set unchanged", () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it("merges overlapping intervals", () => {
    const merged = mergeIntervals([
      range("2026-10-13T09:00Z", "2026-10-13T11:00Z"),
      range("2026-10-13T10:00Z", "2026-10-13T12:00Z"),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.end.toISOString()).toBe("2026-10-13T12:00:00.000Z");
  });

  it("merges intervals that merely touch", () => {
    const merged = mergeIntervals([
      range("2026-10-13T09:00Z", "2026-10-13T10:00Z"),
      range("2026-10-13T10:00Z", "2026-10-13T11:00Z"),
    ]);
    expect(merged).toHaveLength(1);
  });

  it("keeps disjoint intervals separate and sorted", () => {
    const merged = mergeIntervals([
      range("2026-10-13T14:00Z", "2026-10-13T15:00Z"),
      range("2026-10-13T09:00Z", "2026-10-13T10:00Z"),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.start.toISOString()).toBe("2026-10-13T09:00:00.000Z");
  });

  it("absorbs an interval fully inside another", () => {
    const merged = mergeIntervals([
      range("2026-10-13T09:00Z", "2026-10-13T13:00Z"),
      range("2026-10-13T10:00Z", "2026-10-13T11:00Z"),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.end.toISOString()).toBe("2026-10-13T13:00:00.000Z");
  });
});

describe("firstFit", () => {
  it("returns the opening slot when the day is empty", () => {
    const slot = firstFit(OPEN, CLOSE, [], 60, 60);
    expect(slot?.start.toISOString()).toBe("2026-10-13T02:30:00.000Z");
    expect(slot?.end.toISOString()).toBe("2026-10-13T03:30:00.000Z");
  });

  it("skips past a booking to the next free hour", () => {
    // 08:00-10:00 IST is taken, so the first hour free is 10:00 IST.
    const busy = [range("2026-10-13T02:30Z", "2026-10-13T04:30Z")];
    const slot = firstFit(OPEN, CLOSE, busy, 60, 60);
    expect(slot?.start.toISOString()).toBe("2026-10-13T04:30:00.000Z");
  });

  it("fits a booking exactly into a gap between two classes", () => {
    const busy = [
      range("2026-10-13T02:30Z", "2026-10-13T03:30Z"),
      range("2026-10-13T04:30Z", "2026-10-13T06:30Z"),
    ];
    const slot = firstFit(OPEN, CLOSE, busy, 60, 60);
    expect(slot?.start.toISOString()).toBe("2026-10-13T03:30:00.000Z");
  });

  it("will not suggest a gap that is too short", () => {
    // Only a one-hour gap exists, but two hours are needed.
    const busy = [
      range("2026-10-13T02:30Z", "2026-10-13T03:30Z"),
      range("2026-10-13T04:30Z", "2026-10-13T12:30Z"),
    ];
    expect(firstFit(OPEN, CLOSE, busy, 120, 60)).toBeNull();
  });

  it("returns null when the room is booked all day", () => {
    const busy = [range("2026-10-13T02:30Z", "2026-10-13T12:30Z")];
    expect(firstFit(OPEN, CLOSE, busy, 60, 60)).toBeNull();
  });

  it("never suggests a slot that would run past closing", () => {
    const busy = [range("2026-10-13T02:30Z", "2026-10-13T11:30Z")];
    // One hour remains (17:00-18:00 IST) — enough for 60 but not 90 minutes.
    expect(firstFit(OPEN, CLOSE, busy, 60, 60)?.start.toISOString()).toBe(
      "2026-10-13T11:30:00.000Z",
    );
    expect(firstFit(OPEN, CLOSE, busy, 90, 30)).toBeNull();
  });

  it("honours a 30-minute granularity", () => {
    const busy = [range("2026-10-13T02:30Z", "2026-10-13T03:00Z")];
    const slot = firstFit(OPEN, CLOSE, busy, 30, 30);
    expect(slot?.start.toISOString()).toBe("2026-10-13T03:00:00.000Z");
  });

  it("aligns an off-grid start up to the next boundary on the day's grid", () => {
    // Searching from 08:20 IST with hourly steps should offer 09:00 IST, and
    // the grid is anchored at the 08:00 IST opening — not at an epoch hour,
    // which in UTC+5:30 would land on :30 past every local hour.
    const from = at("2026-10-13T02:50:00Z");
    const slot = firstFit(from, CLOSE, [], 60, 60, OPEN);
    expect(slot?.start.toISOString()).toBe("2026-10-13T03:30:00.000Z");
  });
});
