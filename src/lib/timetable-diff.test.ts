import { describe, expect, it } from "vitest";

import { compareDay, disagrees, type Sitting } from "./timetable-diff";

const at = (slot: string, text: string): Sitting => ({ slot, text });

describe("compareDay", () => {
  it("says nothing is wrong when both sides hold the same classes", () => {
    const day = [
      at("704 10:30–11:30", "BCA VII - Deep Learning"),
      at("406 14:30–15:30", "BBA V - Statistics"),
    ];
    const diff = compareDay(day, [...day]);

    expect(diff.matched).toBe(2);
    expect(disagrees(diff)).toBe(0);
  });

  it("reports a class the college holds and we do not", () => {
    const diff = compareDay([at("704 10:30–11:30", "Deep Learning")], []);

    expect(diff.missing).toEqual([
      { slot: "704 10:30–11:30", text: "Deep Learning" },
    ]);
    expect(diff.unexpected).toHaveLength(0);
  });

  it("reports a class we hold and the college does not", () => {
    const diff = compareDay([], [at("704 10:30–11:30", "Deep Learning")]);

    expect(diff.unexpected).toEqual([
      { slot: "704 10:30–11:30", text: "Deep Learning" },
    ]);
    expect(diff.missing).toHaveLength(0);
  });

  it("pairs a class both sides hold but read differently, rather than calling it two faults", () => {
    const diff = compareDay(
      [at("704 10:30–11:30", "Deep Learning - Dr Sharma")],
      [at("704 10:30–11:30", "Deep Learning")],
    );

    expect(diff.differs).toEqual([
      {
        slot: "704 10:30–11:30",
        college: "Deep Learning - Dr Sharma",
        here: "Deep Learning",
      },
    ]);
    expect(diff.missing).toHaveLength(0);
    expect(diff.unexpected).toHaveLength(0);
    expect(disagrees(diff)).toBe(1);
  });

  // Two classes really can share a room and an hour, and counting sittings per
  // slot let a duplicate on our side cover for one the college holds. This is
  // the case that passed while a class was missing.
  it("does not let a duplicate stand in for a missing class", () => {
    const diff = compareDay(
      [at("999 09:00–10:00", "CLASS A"), at("999 09:00–10:00", "CLASS B")],
      [at("999 09:00–10:00", "CLASS B"), at("999 09:00–10:00", "CLASS B")],
    );

    expect(diff.matched).toBe(1);
    expect(diff.differs).toEqual([
      { slot: "999 09:00–10:00", college: "CLASS A", here: "CLASS B" },
    ]);
    expect(disagrees(diff)).toBe(1);
  });

  it("passes two genuinely different classes sharing one slot", () => {
    const both = [
      at("999 09:00–10:00", "CLASS A"),
      at("999 09:00–10:00", "CLASS B"),
    ];
    const diff = compareDay(both, [...both].reverse());

    expect(diff.matched).toBe(2);
    expect(disagrees(diff)).toBe(0);
  });

  it("excuses a college class we called off here", () => {
    const diff = compareDay(
      [at("704 10:30–11:30", "Network Monitoring")],
      [],
      [at("704 10:30–11:30", "Network Monitoring")],
    );

    expect(diff.excused).toBe(1);
    expect(disagrees(diff)).toBe(0);
  });

  // A cancellation excuses the class it was made against, not the slot. The
  // college moving something else into that hour must still be caught.
  it("does not let a cancellation excuse a different class in the same slot", () => {
    const diff = compareDay(
      [at("704 10:30–11:30", "SOMETHING ENTIRELY DIFFERENT")],
      [],
      [at("704 10:30–11:30", "Network Monitoring")],
    );

    expect(diff.excused).toBe(0);
    expect(diff.missing).toEqual([
      { slot: "704 10:30–11:30", text: "SOMETHING ENTIRELY DIFFERENT" },
    ]);
  });

  it("excuses each cancellation once only", () => {
    const diff = compareDay(
      [at("704 10:30–11:30", "Lab"), at("704 10:30–11:30", "Lab")],
      [],
      [at("704 10:30–11:30", "Lab")],
    );

    expect(diff.excused).toBe(1);
    expect(diff.missing).toEqual([{ slot: "704 10:30–11:30", text: "Lab" }]);
  });

  it("counts classes rather than slots, so three missing in one room is three", () => {
    const diff = compareDay(
      [
        at("704 10:30–11:30", "A"),
        at("704 10:30–11:30", "B"),
        at("704 10:30–11:30", "C"),
      ],
      [],
    );

    expect(diff.missing).toHaveLength(3);
    expect(disagrees(diff)).toBe(3);
  });

  it("finds nothing to say about an empty day", () => {
    const diff = compareDay([], []);

    expect(disagrees(diff)).toBe(0);
    expect(diff.matched).toBe(0);
  });
});
