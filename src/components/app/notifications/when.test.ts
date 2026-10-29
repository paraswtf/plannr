import { describe, expect, it } from "vitest";

import { dayHeading, dayKey, timeLabel } from "./when";

const TZ = "Asia/Kolkata";
// 29 October 2026, 15:00 in Pune.
const now = new Date("2026-10-29T09:30:00Z");

describe("dayHeading", () => {
  it("names today and yesterday", () => {
    expect(dayHeading(new Date("2026-10-29T03:00:00Z"), now, TZ)).toBe("Today");
    expect(dayHeading(new Date("2026-10-28T12:00:00Z"), now, TZ)).toBe(
      "Yesterday",
    );
  });

  it("reads the day in the institution's zone, not in UTC", () => {
    // 20:00 UTC on the 28th is 01:30 on the 29th in Pune.
    expect(dayHeading(new Date("2026-10-28T20:00:00Z"), now, TZ)).toBe("Today");
  });

  it("gives the date further back, and the year only once it differs", () => {
    expect(dayHeading(new Date("2026-10-26T06:00:00Z"), now, TZ)).toBe(
      "Mon 26 Oct",
    );
    expect(dayHeading(new Date("2025-12-31T06:00:00Z"), now, TZ)).toBe(
      "Wed, 31 Dec 2025",
    );
  });
});

describe("timeLabel", () => {
  it("counts minutes within the hour", () => {
    expect(timeLabel(new Date(now.getTime() - 20_000), now, TZ)).toBe(
      "Just now",
    );
    expect(timeLabel(new Date(now.getTime() - 5 * 60_000), now, TZ)).toBe(
      "5 min ago",
    );
  });

  it("gives the clock time after that", () => {
    expect(timeLabel(new Date("2026-10-29T03:30:00Z"), now, TZ)).toBe("9am");
    expect(timeLabel(new Date("2026-10-28T08:45:00Z"), now, TZ)).toBe("2:15pm");
  });
});

describe("dayKey", () => {
  it("is one key for one local day", () => {
    expect(dayKey(new Date("2026-10-28T20:00:00Z"), TZ)).toBe(
      dayKey(new Date("2026-10-29T09:00:00Z"), TZ),
    );
    expect(dayKey(new Date("2026-10-28T18:00:00Z"), TZ)).not.toBe(
      dayKey(new Date("2026-10-28T19:00:00Z"), TZ),
    );
  });
});
