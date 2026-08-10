import { describe, expect, it } from "vitest";

import { DEFAULT_TIMEZONE, fromWallTime, toWallTime } from "./dates";
import {
  buildRRule,
  describeRRule,
  expandSeries,
  hasCount,
  MAX_OCCURRENCES,
  setCount,
  setUntil,
  validateRRule,
} from "./recurrence";

const IST = DEFAULT_TIMEZONE;

/** Local midnight on the given date, for UNTIL boundaries. */
const at = (y: number, m: number, d: number) =>
  fromWallTime(
    { year: y, month: m, day: d, hour: 0, minute: 0, second: 0 },
    IST,
  );

/** 09:00–10:00 IST on the given local date. */
const lecture = (
  y: number,
  m: number,
  d: number,
  rrule: string | null = null,
  startHour = 9,
  endHour = 10,
) => ({
  startTime: fromWallTime(
    { year: y, month: m, day: d, hour: startHour, minute: 0, second: 0 },
    IST,
  ),
  endTime: fromWallTime(
    { year: y, month: m, day: d, hour: endHour, minute: 0, second: 0 },
    IST,
  ),
  timezone: IST,
  rrule,
});

const localHours = (d: Date) => {
  const w = toWallTime(d, IST);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")} ${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
};

describe("expandSeries", () => {
  it("returns the single occurrence for a one-off event", () => {
    const occurrences = expandSeries(lecture(2026, 10, 13));
    expect(occurrences).toHaveLength(1);
    expect(localHours(occurrences[0]!.start)).toBe("2026-10-13 09:00");
    expect(localHours(occurrences[0]!.end)).toBe("2026-10-13 10:00");
  });

  it("expands a weekly rule at a stable local wall-clock time", () => {
    // 13 Oct 2026 is a Tuesday.
    const occurrences = expandSeries(
      lecture(2026, 10, 13, "FREQ=WEEKLY;BYDAY=TU;UNTIL=20261110T235959"),
    );
    expect(occurrences.map((o) => localHours(o.start))).toEqual([
      "2026-10-13 09:00",
      "2026-10-20 09:00",
      "2026-10-27 09:00",
      "2026-11-03 09:00",
      "2026-11-10 09:00",
    ]);
    // Every occurrence keeps the same local time, which is the whole point of
    // expanding in wall time rather than UTC.
    for (const o of occurrences) {
      expect(toWallTime(o.start, IST).hour).toBe(9);
      expect(toWallTime(o.end, IST).hour).toBe(10);
    }
  });

  it("honours COUNT as well as UNTIL", () => {
    const occurrences = expandSeries(
      lecture(2026, 10, 13, "FREQ=WEEKLY;BYDAY=TU;COUNT=3"),
    );
    expect(occurrences).toHaveLength(3);
  });

  it("expands multiple weekdays per week", () => {
    const occurrences = expandSeries(
      lecture(2026, 10, 13, "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261023T235959"),
    );
    expect(occurrences.map((o) => localHours(o.start))).toEqual([
      "2026-10-13 09:00",
      "2026-10-15 09:00",
      "2026-10-20 09:00",
      "2026-10-22 09:00",
    ]);
  });

  it("includes an occurrence that started before the window but is still running", () => {
    const event = lecture(2026, 10, 13, "FREQ=WEEKLY;BYDAY=TU;COUNT=4", 9, 11);
    // Window opens at 10:00, half an hour into the 09:00-11:00 class.
    const from = fromWallTime(
      { year: 2026, month: 10, day: 20, hour: 10, minute: 0, second: 0 },
      IST,
    );
    const to = fromWallTime(
      { year: 2026, month: 10, day: 20, hour: 12, minute: 0, second: 0 },
      IST,
    );
    const occurrences = expandSeries(event, { from, to });
    expect(occurrences.map((o) => localHours(o.start))).toEqual([
      "2026-10-20 09:00",
    ]);
  });

  it("excludes an occurrence that ends exactly when the window opens", () => {
    const event = lecture(2026, 10, 13, "FREQ=WEEKLY;BYDAY=TU;COUNT=4");
    const from = fromWallTime(
      { year: 2026, month: 10, day: 20, hour: 10, minute: 0, second: 0 },
      IST,
    );
    const to = fromWallTime(
      { year: 2026, month: 10, day: 20, hour: 12, minute: 0, second: 0 },
      IST,
    );
    expect(expandSeries(event, { from, to })).toHaveLength(0);
  });

  it("clips a one-off event to the window", () => {
    const event = lecture(2026, 10, 13);
    const inside = {
      from: fromWallTime(
        { year: 2026, month: 10, day: 13, hour: 8, minute: 0, second: 0 },
        IST,
      ),
      to: fromWallTime(
        { year: 2026, month: 10, day: 13, hour: 18, minute: 0, second: 0 },
        IST,
      ),
    };
    const elsewhere = {
      from: fromWallTime(
        { year: 2026, month: 10, day: 14, hour: 8, minute: 0, second: 0 },
        IST,
      ),
      to: fromWallTime(
        { year: 2026, month: 10, day: 14, hour: 18, minute: 0, second: 0 },
        IST,
      ),
    };
    expect(expandSeries(event, inside)).toHaveLength(1);
    expect(expandSeries(event, elsewhere)).toHaveLength(0);
  });

  it("never returns more than the hard cap", () => {
    const occurrences = expandSeries(
      lecture(2026, 1, 1, "FREQ=DAILY;COUNT=1000"),
    );
    expect(occurrences).toHaveLength(MAX_OCCURRENCES);
  });

  it("produces real UTC instants, not fake-UTC leakage", () => {
    // IST is UTC+5:30, so 09:00 IST is 03:30 UTC. If fake-UTC dates escaped,
    // this would read 09:00.
    const [first] = expandSeries(
      lecture(2026, 10, 13, "FREQ=WEEKLY;BYDAY=TU;COUNT=2"),
    );
    expect(first!.start.getUTCHours()).toBe(3);
    expect(first!.start.getUTCMinutes()).toBe(30);
    expect(first!.start.toISOString()).toBe("2026-10-13T03:30:00.000Z");
  });
});

describe("validateRRule", () => {
  const base = lecture(2026, 10, 13);

  it("accepts a bounded weekly rule", () => {
    const result = validateRRule("FREQ=WEEKLY;BYDAY=TU;COUNT=12", base);
    expect(result).toEqual({ ok: true, count: 12 });
  });

  it("rejects an unbounded rule", () => {
    const result = validateRRule("FREQ=WEEKLY;BYDAY=TU", base);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/must end/i);
  });

  it("rejects a rule that expands past the cap", () => {
    const result = validateRRule("FREQ=DAILY;COUNT=900", base);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/more than 500/i);
  });

  it("rejects unparseable input", () => {
    const result = validateRRule("this is not a rule", base);
    expect(result.ok).toBe(false);
  });

  it("rejects a rule with no frequency", () => {
    const result = validateRRule("COUNT=5", base);
    expect(result.ok).toBe(false);
  });
});

describe("buildRRule", () => {
  it("builds a weekly rule with weekdays and a count", () => {
    expect(
      buildRRule({
        freq: "WEEKLY",
        byWeekday: [1, 3],
        count: 10,
        timeZone: IST,
      }),
    ).toBe("FREQ=WEEKLY;BYDAY=TU,TH;COUNT=10");
  });

  it("writes UNTIL as a floating local stamp", () => {
    const until = fromWallTime(
      { year: 2026, month: 12, day: 15, hour: 23, minute: 59, second: 59 },
      IST,
    );
    expect(
      buildRRule({ freq: "WEEKLY", byWeekday: [0], until, timeZone: IST }),
    ).toBe("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261215T235959");
  });

  it("omits INTERVAL when it is 1", () => {
    expect(
      buildRRule({ freq: "DAILY", interval: 1, count: 3, timeZone: IST }),
    ).toBe("FREQ=DAILY;COUNT=3");
    expect(
      buildRRule({ freq: "DAILY", interval: 2, count: 3, timeZone: IST }),
    ).toBe("FREQ=DAILY;INTERVAL=2;COUNT=3");
  });

  it("round-trips through expandSeries", () => {
    const rrule = buildRRule({
      freq: "WEEKLY",
      byWeekday: [1],
      count: 4,
      timeZone: IST,
    });
    const occurrences = expandSeries(lecture(2026, 10, 13, rrule));
    expect(occurrences).toHaveLength(4);
    expect(localHours(occurrences[0]!.start)).toBe("2026-10-13 09:00");
  });
});

describe("setUntil", () => {
  it("truncates a series at the split point", () => {
    const pivot = fromWallTime(
      { year: 2026, month: 10, day: 27, hour: 8, minute: 59, second: 0 },
      IST,
    );
    const truncated = setUntil("FREQ=WEEKLY;BYDAY=TU;COUNT=8", pivot, IST);
    const occurrences = expandSeries(lecture(2026, 10, 13, truncated));

    expect(occurrences.map((o) => localHours(o.start))).toEqual([
      "2026-10-13 09:00",
      "2026-10-20 09:00",
    ]);
  });

  it("drops COUNT so it cannot fight UNTIL", () => {
    const pivot = fromWallTime(
      { year: 2026, month: 11, day: 3, hour: 8, minute: 0, second: 0 },
      IST,
    );
    expect(setUntil("FREQ=WEEKLY;BYDAY=TU;COUNT=8", pivot, IST)).not.toMatch(
      /COUNT/,
    );
  });
});

describe("setCount", () => {
  it("replaces an existing COUNT rather than appending a second one", () => {
    expect(setCount("FREQ=WEEKLY;BYDAY=TU;COUNT=8", 3)).toBe(
      "FREQ=WEEKLY;BYDAY=TU;COUNT=3",
    );
  });

  it("adds a COUNT when the rule has none", () => {
    expect(setCount("FREQ=WEEKLY;BYDAY=TU", 4)).toBe(
      "FREQ=WEEKLY;BYDAY=TU;COUNT=4",
    );
  });

  it("keeps a split from producing more meetings than the original series", () => {
    // The bug this guards: giving the second half of a split the original
    // COUNT turned a 6-week series into 3 + 6 = 9 meetings.
    const original = "FREQ=WEEKLY;COUNT=6";
    const firstHalf = expandSeries(
      lecture(2026, 10, 13, setUntil(original, at(2026, 11, 2), IST)),
    );
    const secondHalf = expandSeries(
      lecture(2026, 11, 3, setCount(original, 6 - firstHalf.length)),
    );
    expect(firstHalf.length + secondHalf.length).toBe(6);
  });
});

describe("hasCount", () => {
  it("distinguishes counted rules from dated ones", () => {
    expect(hasCount("FREQ=WEEKLY;COUNT=6")).toBe(true);
    expect(hasCount("COUNT=6")).toBe(true);
    expect(hasCount("FREQ=WEEKLY;UNTIL=20261215T235959")).toBe(false);
    // Must not be fooled by a substring of another key.
    expect(hasCount("FREQ=WEEKLY;BYSETPOS=1")).toBe(false);
  });
});

describe("describeRRule", () => {
  it("renders a readable summary", () => {
    expect(describeRRule("FREQ=WEEKLY;BYDAY=TU;COUNT=12")).toContain("week");
  });

  it("degrades gracefully on nonsense", () => {
    expect(describeRRule("nonsense")).toBe("custom repeat");
  });
});
