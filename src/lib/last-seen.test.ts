import { describe, expect, it } from "vitest";

import { lastSeenLabel, SEEN_EVERY_MS, shouldRecordVisit } from "./last-seen";

const TZ = "Asia/Kolkata";
// 14:30 in Kolkata on Thu 29 Oct 2026.
const now = new Date("2026-10-29T09:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;

describe("shouldRecordVisit", () => {
  it("records somebody never seen, and nobody more than once a quarter hour", () => {
    expect(shouldRecordVisit(null, now)).toBe(true);
    expect(shouldRecordVisit(ago(SEEN_EVERY_MS - 1), now)).toBe(false);
    expect(shouldRecordVisit(ago(SEEN_EVERY_MS), now)).toBe(true);
  });
});

describe("lastSeenLabel", () => {
  it("says nothing more precise than it records", () => {
    expect(lastSeenLabel(ago(3 * MIN), now, TZ)).toBe("Just now");
    expect(lastSeenLabel(ago(40 * MIN), now, TZ)).toBe("40 min ago");
  });

  it("gives the clock time today and yesterday, in the institution's zone", () => {
    expect(lastSeenLabel(ago(5 * 60 * MIN), now, TZ)).toBe("Today, 9:30am");
    // 20:00 in Kolkata the evening before.
    expect(lastSeenLabel(new Date("2026-10-28T14:30:00Z"), now, TZ)).toBe(
      "Yesterday, 8pm",
    );
  });

  it("gives the day further back, and the year once it is another", () => {
    expect(lastSeenLabel(new Date("2026-10-03T06:00:00Z"), now, TZ)).toBe(
      "3 Oct",
    );
    expect(lastSeenLabel(new Date("2025-12-20T06:00:00Z"), now, TZ)).toBe(
      "20 Dec 2025",
    );
  });

  it("says so when nothing was ever recorded", () => {
    expect(lastSeenLabel(null, now, TZ)).toBe("Not recorded");
  });
});
