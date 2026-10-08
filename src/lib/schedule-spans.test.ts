import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  formatWeekLabel,
  startOfLocalMonth,
} from "./dates";
import {
  monthGridWeeks,
  monthsOfYear,
  spanHolds,
  spanWindow,
  startOfLocalWeek,
  startOfSpan,
  stepSpan,
  weeksTouchingMonth,
} from "./schedule-spans";

/**
 * The window arithmetic, which the router and the month grid both depend on
 * agreeing about exactly.
 *
 * Everything is asserted in the college's own timezone, five and a half hours
 * ahead of UTC, because that offset is what turns most of these into real
 * questions: local midnight on the 1st of August 2026 is 18:30 UTC on the 31st
 * of July, and a window computed in UTC would be a day out on every single one.
 */

const IST = "Asia/Kolkata";
/** Local midnight in IST, written as the UTC instant it actually is. */
const day = (iso: string) => new Date(iso);

describe("startOfLocalWeek", () => {
  it("goes back to the Monday, in local time", () => {
    // Saturday 15 August 2026, 14:00 IST.
    const saturday = day("2026-08-15T08:30:00Z");
    // Monday 10 August 2026, 00:00 IST.
    expect(startOfLocalWeek(saturday, IST).toISOString()).toBe(
      "2026-08-09T18:30:00.000Z",
    );
  });

  it("leaves a Monday where it is", () => {
    const monday = day("2026-08-09T18:30:00Z");
    expect(startOfLocalWeek(monday, IST).getTime()).toBe(monday.getTime());
  });

  it("treats Sunday as the end of its week, not the start of the next", () => {
    // Sunday 16 August 2026, 23:00 IST — nearly a day later than the Saturday
    // above, and it must still belong to the week beginning the 10th.
    const sunday = day("2026-08-16T17:30:00Z");
    expect(startOfLocalWeek(sunday, IST).toISOString()).toBe(
      "2026-08-09T18:30:00.000Z",
    );
  });
});

describe("startOfSpan", () => {
  it("starts a month on the Monday the grid does, not on the first", () => {
    // 1 August 2026 is a Saturday, so the grid opens on Monday 27 July. A
    // window that began on the 1st would leave the lead-in days empty and the
    // grid would say so in perfect confidence.
    const august = day("2026-08-12T06:00:00Z");
    expect(startOfSpan(august, "month", IST).toISOString()).toBe(
      "2026-07-26T18:30:00.000Z",
    );
  });

  it("starts a day at local midnight", () => {
    expect(
      startOfSpan(day("2026-08-12T06:00:00Z"), "day", IST).toISOString(),
    ).toBe("2026-08-11T18:30:00.000Z");
  });
});

describe("monthGridWeeks", () => {
  it("draws only the rows the month needs", () => {
    // August 2026: 31 days beginning on a Saturday — five Mondays' worth of
    // grid, plus the lead-in, is six rows.
    expect(monthGridWeeks(day("2026-08-12T06:00:00Z"), IST)).toBe(6);
    // February 2027: 28 days beginning on a Monday. Exactly four.
    expect(monthGridWeeks(day("2027-02-10T06:00:00Z"), IST)).toBe(4);
    // September 2026: 30 days beginning on a Tuesday — five.
    expect(monthGridWeeks(day("2026-09-10T06:00:00Z"), IST)).toBe(5);
  });
});

describe("spanWindow", () => {
  it("is exactly the day, for a day", () => {
    const { from, to } = spanWindow(day("2026-08-12T06:00:00Z"), "day", IST);
    expect(from.toISOString()).toBe("2026-08-11T18:30:00.000Z");
    expect(to.toISOString()).toBe("2026-08-12T18:30:00.000Z");
  });

  it("is seven days, for a week", () => {
    const { from, to } = spanWindow(day("2026-08-15T08:30:00Z"), "week", IST);
    expect(to.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("never reaches past one month grid", () => {
    // The guard rail that matters: the caller states a span and an anchor, and
    // the widest thing it can ask for is six rows.
    for (const iso of [
      "2026-01-15T06:00:00Z",
      "2026-08-12T06:00:00Z",
      "2027-02-10T06:00:00Z",
    ]) {
      const { from, to } = spanWindow(day(iso), "month", IST);
      const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
      expect(days).toBeLessThanOrEqual(42);
      expect(days % 7).toBe(0);
    }
  });
});

describe("stepSpan", () => {
  it("steps a month without skipping one", () => {
    // The reason `addMonths` clamps. From the 31st, a naive +1 month lands on
    // the 3rd of March and skips February altogether — and skips another on
    // the way back, so the two arrows would not undo each other.
    const jan31 = day("2027-01-30T18:30:00Z");
    const next = stepSpan(jan31, "month", 1, IST);
    expect(startOfLocalMonth(next, IST).toISOString()).toBe(
      "2027-01-31T18:30:00.000Z",
    );
    // ...which is local midnight on 1 February 2027.
    expect(stepSpan(next, "month", -1, IST).getTime()).toBeLessThan(
      jan31.getTime() + 24 * 60 * 60 * 1000,
    );
  });

  it("steps a week by seven days and a day by one", () => {
    const anchor = day("2026-08-11T18:30:00Z");
    expect(stepSpan(anchor, "week", 1, IST).getTime()).toBe(
      addMonths(anchor, 0, IST).getTime() + 7 * 24 * 60 * 60 * 1000,
    );
    expect(stepSpan(anchor, "day", -1, IST).toISOString()).toBe(
      "2026-08-10T18:30:00.000Z",
    );
  });
});

describe("spanHolds", () => {
  it("is what makes Today mean 'back to now' in every span", () => {
    // Wednesday 12 August 2026. A week view anchored on it is already showing
    // Monday the 10th, so "Today" has nothing to do — which is the question
    // this answers, rather than "is the anchor today".
    const anchor = day("2026-08-11T18:30:00Z");
    const monday = day("2026-08-09T18:30:00Z");
    expect(spanHolds(anchor, "day", monday, IST)).toBe(false);
    expect(spanHolds(anchor, "week", monday, IST)).toBe(true);
    expect(spanHolds(anchor, "month", monday, IST)).toBe(true);
  });
});

describe("formatWeekLabel", () => {
  it("says the month once when the week does not straddle one", () => {
    expect(formatWeekLabel(day("2026-08-09T18:30:00Z"), IST)).toBe(
      "10-16 Aug 2026",
    );
  });

  it("names both months when it does", () => {
    // Monday 28 September 2026 to Sunday 4 October. "Sept" rather than "Sep" is
    // en-GB's own abbreviation and is what `formatDayLabel` has always rendered
    // elsewhere in the app, so it is left alone rather than forced into three
    // letters here and nowhere else.
    expect(formatWeekLabel(day("2026-09-27T18:30:00Z"), IST)).toBe(
      "28 Sept - 4 Oct 2026",
    );
  });

  it("names both years across new year", () => {
    // Monday 28 December 2026 to Sunday 3 January 2027.
    expect(formatWeekLabel(day("2026-12-27T18:30:00Z"), IST)).toBe(
      "28 Dec 2026 - 3 Jan 2027",
    );
  });
});

describe("weeksTouchingMonth", () => {
  it("always contains the week it is describing", () => {
    /*
     * The property that matters, checked exhaustively rather than at a few
     * hand-picked dates. The strip lights the pill whose value is the anchor's
     * own Monday, so a strip that does not contain it is a control with nothing
     * selected — and the dates where that could happen are exactly the awkward
     * ones nobody thinks to try: a week straddling the 1st in either direction,
     * a month beginning on a Sunday, a 28-day February beginning on a Monday.
     *
     * Three years is every combination of month length and first weekday
     * several times over, including a leap year.
     */
    const start = day("2024-12-31T18:30:00Z");
    const missing: string[] = [];
    for (let i = 0; i < 365 * 3; i++) {
      const anchor = addDays(start, i, IST);
      const monday = startOfLocalWeek(anchor, IST).getTime();
      const pills = weeksTouchingMonth(anchor, IST).map((d) => d.getTime());
      if (!pills.includes(monday)) missing.push(anchor.toISOString());
    }
    expect(missing).toEqual([]);
  });

  it("is between four and six whole weeks, in order", () => {
    const start = day("2024-12-31T18:30:00Z");
    for (let i = 0; i < 365 * 3; i += 5) {
      const weeks = weeksTouchingMonth(addDays(start, i, IST), IST);
      expect(weeks.length).toBeGreaterThanOrEqual(4);
      expect(weeks.length).toBeLessThanOrEqual(6);
      for (let n = 1; n < weeks.length; n++) {
        expect(weeks[n]!.getTime() - weeks[n - 1]!.getTime()).toBe(
          7 * 24 * 60 * 60 * 1000,
        );
      }
    }
  });

  it("measures the month from the week's Monday, not from the anchor", () => {
    // Thursday 30 July 2026 sits in the week beginning Monday 27 July. Taken
    // from the anchor's own month the strip would be August's and would not
    // hold the 27th at all.
    const pills = weeksTouchingMonth(day("2026-07-30T06:00:00Z"), IST);
    expect(pills.map((d) => d.toISOString())).toContain(
      "2026-07-26T18:30:00.000Z",
    );
  });
});

describe("monthsOfYear", () => {
  it("gives January to December of the anchor's own year", () => {
    const months = monthsOfYear(day("2026-08-12T06:00:00Z"), IST);
    expect(months).toHaveLength(12);
    expect(months[0]!.toISOString()).toBe("2025-12-31T18:30:00.000Z");
    expect(months[11]!.toISOString()).toBe("2026-11-30T18:30:00.000Z");
    // ...which are local midnight on 1 January and 1 December 2026.
    expect(months).toContainEqual(
      startOfLocalMonth(day("2026-08-12T06:00:00Z"), IST),
    );
  });
});
