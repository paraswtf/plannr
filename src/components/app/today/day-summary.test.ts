import { describe, expect, it } from "vitest";

import { formatDuration, summariseDay } from "./day-summary";

const at = (iso: string) => new Date(iso);
const entry = (startIso: string, endIso: string, title: string) => ({
  start: at(startIso),
  end: at(endIso),
  title,
});

const NOW = at("2026-10-13T05:45:00Z"); // 11:15 IST

describe("summariseDay", () => {
  it("handles an empty day", () => {
    const { list, ongoing, next } = summariseDay([], NOW);
    expect(list).toEqual([]);
    expect(ongoing).toBeUndefined();
    expect(next).toBeUndefined();
  });

  it("finds the class happening right now and the one after", () => {
    const { ongoing, next } = summariseDay(
      [
        entry("2026-10-13T03:30Z", "2026-10-13T04:30Z", "Earlier"),
        entry("2026-10-13T05:30Z", "2026-10-13T06:30Z", "Current"),
        entry("2026-10-13T07:00Z", "2026-10-13T08:00Z", "Later"),
      ],
      NOW,
    );
    expect(ongoing?.title).toBe("Current");
    expect(next?.title).toBe("Later");
  });

  it("sorts regardless of input order", () => {
    const { list } = summariseDay(
      [
        entry("2026-10-13T07:00Z", "2026-10-13T08:00Z", "Third"),
        entry("2026-10-13T03:30Z", "2026-10-13T04:30Z", "First"),
        entry("2026-10-13T05:30Z", "2026-10-13T06:30Z", "Second"),
      ],
      NOW,
    );
    expect(list.map((e) => e.title)).toEqual(["First", "Second", "Third"]);
  });

  it("reports no ongoing class during a gap", () => {
    const { ongoing, next } = summariseDay(
      [
        entry("2026-10-13T03:30Z", "2026-10-13T04:30Z", "Before"),
        entry("2026-10-13T07:00Z", "2026-10-13T08:00Z", "After"),
      ],
      NOW,
    );
    expect(ongoing).toBeUndefined();
    expect(next?.title).toBe("After");
  });

  it("treats a class ending exactly now as finished", () => {
    const { ongoing } = summariseDay(
      [entry("2026-10-13T04:45Z", "2026-10-13T05:45Z", "Just ended")],
      NOW,
    );
    expect(ongoing).toBeUndefined();
  });

  it("treats a class starting exactly now as ongoing, not next", () => {
    const { ongoing, next } = summariseDay(
      [entry("2026-10-13T05:45Z", "2026-10-13T06:45Z", "Starting")],
      NOW,
    );
    expect(ongoing?.title).toBe("Starting");
    expect(next).toBeUndefined();
  });

  it("has no next once the day is over", () => {
    const { ongoing, next } = summariseDay(
      [entry("2026-10-13T03:30Z", "2026-10-13T04:30Z", "Done")],
      NOW,
    );
    expect(ongoing).toBeUndefined();
    expect(next).toBeUndefined();
  });
});

describe("formatDuration", () => {
  it("renders minutes", () => {
    expect(formatDuration(45 * 60_000)).toBe("45 mins");
    expect(formatDuration(60_000)).toBe("1 min");
  });

  it("renders whole hours without a stray zero", () => {
    expect(formatDuration(120 * 60_000)).toBe("2h");
  });

  it("renders hours and minutes", () => {
    expect(formatDuration(80 * 60_000)).toBe("1h 20m");
  });

  it("never renders a negative duration", () => {
    expect(formatDuration(-5000)).toBe("0 mins");
  });
});
