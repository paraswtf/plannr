import { describe, expect, it } from "vitest";

import { isRunning, todayAsDate } from "./semester-dates";

const semester = {
  startDate: new Date("2026-08-01T00:00:00Z"),
  endDate: new Date("2026-11-30T00:00:00Z"),
};

describe("todayAsDate", () => {
  it("reads the day in the institution's timezone", () => {
    // 20:00 UTC on the 29th is 01:30 on the 30th in Kolkata.
    expect(todayAsDate(new Date("2026-11-29T20:00:00Z")).toISOString()).toBe(
      "2026-11-30T00:00:00.000Z",
    );
    // 18:00 UTC is 23:30 the same day.
    expect(todayAsDate(new Date("2026-11-29T18:00:00Z")).toISOString()).toBe(
      "2026-11-29T00:00:00.000Z",
    );
  });
});

describe("isRunning", () => {
  it("is still running all through the last day", () => {
    // 05:30 Kolkata and 23:59 Kolkata on 30 November.
    expect(isRunning(semester, new Date("2026-11-30T00:00:00Z"))).toBe(true);
    expect(isRunning(semester, new Date("2026-11-30T18:29:00Z"))).toBe(true);
  });

  it("has finished on the day after", () => {
    expect(isRunning(semester, new Date("2026-11-30T18:30:00Z"))).toBe(false);
    expect(isRunning(semester, new Date("2026-12-01T06:00:00Z"))).toBe(false);
  });

  it("is already running in the early hours of the first day", () => {
    // 01:30 Kolkata on 1 August is 20:00 UTC on 31 July.
    expect(isRunning(semester, new Date("2026-07-31T20:00:00Z"))).toBe(true);
    expect(isRunning(semester, new Date("2026-07-31T18:00:00Z"))).toBe(false);
  });
});
