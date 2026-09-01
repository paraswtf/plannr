import {
  addDays,
  addMonths,
  isoWeekday,
  startOfLocalDay,
  startOfLocalMonth,
  toWallTime,
} from "./dates";

/**
 * How much of the calendar a schedule screen is answering with.
 *
 * A different axis from `schedule-views`, which decides *whose eyes* you are
 * looking through: the span decides how far you can see, and the two are
 * independent — a coordinator can look at somebody else's month.
 *
 * The arithmetic lives here rather than in either the router or the components
 * because both need it and they must agree exactly: the server queries the
 * window the month grid draws, or a Monday the 1st with four lectures on it
 * comes back empty and the grid says so in perfect confidence.
 */

export const SPANS = ["day", "week", "month"] as const;

export type ScheduleSpan = (typeof SPANS)[number];

export const SPAN_LABELS: Record<ScheduleSpan, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

/** The noun for a span, for a sentence about whose it is. */
export const SPAN_NOUNS: Record<ScheduleSpan, string> = {
  day: "day",
  week: "week",
  month: "month",
};

/**
 * The Monday on or before `instant`, at local midnight.
 *
 * ISO weeks throughout, matching `isoWeekday` and the day strip the navigator
 * has always drawn.
 */
export function startOfLocalWeek(instant: Date, timeZone: string): Date {
  const day = startOfLocalDay(instant, timeZone);
  return addDays(day, -(isoWeekday(day, timeZone) - 1), timeZone);
}

/**
 * Where the window holding `instant` begins.
 *
 * For a month this is the Monday the *grid* starts on, which is usually in the
 * month before — the grid draws the lead-in days, and a window that stopped at
 * the 1st would leave real classes off them.
 */
export function startOfSpan(
  instant: Date,
  span: ScheduleSpan,
  timeZone: string,
): Date {
  switch (span) {
    case "day":
      return startOfLocalDay(instant, timeZone);
    case "week":
      return startOfLocalWeek(instant, timeZone);
    case "month":
      return startOfLocalWeek(startOfLocalMonth(instant, timeZone), timeZone);
  }
}

/**
 * How many Monday-aligned rows the month containing `instant` needs.
 *
 * Between four (a 28-day February beginning on a Monday) and six. The month
 * grid draws the rows it needs rather than a fixed six: a trailing row of
 * greyed-out days is a sixth of the screen spent saying nothing, and unlike the
 * date picker's popover — which fixes six so it cannot jump under the cursor —
 * a full-page grid can afford to be the height of its own month.
 */
export function monthGridWeeks(instant: Date, timeZone: string): number {
  const first = startOfLocalMonth(instant, timeZone);
  const lead = isoWeekday(first, timeZone) - 1;
  const next = addMonths(first, 1, timeZone);
  const days = Math.round(
    (next.getTime() - first.getTime()) / (24 * 60 * 60 * 1000),
  );
  return Math.ceil((lead + days) / 7);
}

/** The half-open window `[from, to)` a span covers around `instant`. */
export function spanWindow(
  instant: Date,
  span: ScheduleSpan,
  timeZone: string,
): { from: Date; to: Date } {
  const from = startOfSpan(instant, span, timeZone);
  const days =
    span === "day"
      ? 1
      : span === "week"
        ? 7
        : monthGridWeeks(instant, timeZone) * 7;
  return { from, to: addDays(from, days, timeZone) };
}

/** One span forward or back from the day on screen, as a day. */
export function stepSpan(
  anchor: Date,
  span: ScheduleSpan,
  by: -1 | 1,
  timeZone: string,
): Date {
  switch (span) {
    case "day":
      return addDays(anchor, by, timeZone);
    case "week":
      return addDays(anchor, by * 7, timeZone);
    case "month":
      return addMonths(anchor, by, timeZone);
  }
}

/**
 * The Mondays of every week that touches the month `anchor`'s own week is in.
 *
 * What the navigator's strip offers when a week is on screen. The month is
 * taken from the anchor's *Monday* rather than from the anchor: a week
 * straddling the 1st would otherwise be measured against the month its Thursday
 * happens to fall in, and the strip would come back with no pill in it for the
 * week actually being shown.
 *
 * Four to six entries, and the anchor's own Monday is always one of them —
 * which is the property worth having, since it is what the strip lights.
 */
export function weeksTouchingMonth(anchor: Date, timeZone: string): Date[] {
  const monday = startOfLocalWeek(anchor, timeZone);
  const first = startOfLocalWeek(startOfLocalMonth(monday, timeZone), timeZone);
  const month = toWallTime(monday, timeZone).month;

  const weeks: Date[] = [];
  for (let i = 0; i < 6; i++) {
    const at = addDays(first, i * 7, timeZone);
    // Stop at the first week lying wholly beyond this month. `at > monday`
    // keeps the lead-in week, which belongs to the month before and is still
    // the one being shown when the anchor is in it.
    if (i > 0 && toWallTime(at, timeZone).month !== month && at > monday) break;
    weeks.push(at);
  }
  return weeks;
}

/** The first of each month of `anchor`'s year, January first. */
export function monthsOfYear(anchor: Date, timeZone: string): Date[] {
  const first = startOfLocalMonth(anchor, timeZone);
  const month = toWallTime(first, timeZone).month;
  return Array.from({ length: 12 }, (_, i) =>
    addMonths(first, i - (month - 1), timeZone),
  );
}

/** Does `instant` fall inside the window `span` draws around `anchor`? */
export function spanHolds(
  anchor: Date,
  span: ScheduleSpan,
  instant: Date,
  timeZone: string,
): boolean {
  const { from, to } = spanWindow(anchor, span, timeZone);
  return instant >= from && instant < to;
}
