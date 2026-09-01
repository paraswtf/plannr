import {
  addDays,
  isSameLocalDay,
  startOfLocalDay,
  toWallTime,
} from "~/lib/dates";
import { monthGridWeeks, startOfSpan } from "~/lib/schedule-spans";

import type { DaySpan } from "./day-layout";

/**
 * Filing a month's classes into the cells of a calendar grid.
 *
 * Pure, and separate from the component that draws it, because every decision
 * in here is one that can be got quietly wrong — which day a sitting belongs to
 * when read in the college's timezone, how many rows the month needs, how many
 * chips fit before the rest become a number — and none of them are visible in a
 * screenshot.
 */

/** How tall one week's row is drawn. The chip budget is read off it. */
export const MONTH_ROW_HEIGHT = 124;
const CHIP_HEIGHT = 20;
const CHIP_GAP = 3;
/** The date number and its own breathing room, above the chips. */
const DATE_LINE = 24;
const CELL_PADDING = 6;

/**
 * How many chips a cell can hold.
 *
 * Fixed rather than measured, deliberately: measuring means a layout effect, a
 * `ResizeObserver`, and a first paint that is wrong. One row height at every
 * width means the budget is one number and no JavaScript ever has to know about
 * a breakpoint — the chip's time is hidden below `sm` and its title truncates,
 * which is how a narrow cell copes instead.
 */
export function chipsThatFit(rowHeight = MONTH_ROW_HEIGHT): number {
  const room = rowHeight - DATE_LINE - CELL_PADDING * 2;
  return Math.max(1, Math.floor((room + CHIP_GAP) / (CHIP_HEIGHT + CHIP_GAP)));
}

export interface MonthCell<T> {
  /** Local midnight of the day this cell is. */
  day: Date;
  /** False for the lead-in and lead-out days from the neighbouring months. */
  inMonth: boolean;
  isToday: boolean;
  /** Everything starting that day, in the order the caller supplied. */
  events: T[];
  /** How many of `events` are drawn. */
  shown: number;
  /** How many the "+N more" stands for. Zero when they all fit. */
  more: number;
}

/**
 * The grid for the month `anchor` falls in, with every event filed under the
 * local day it *starts* on — so a sitting that crosses midnight appears once,
 * on the day it began.
 */
export function monthLayout<T extends DaySpan>(
  anchor: Date,
  events: T[],
  now: Date,
  timeZone: string,
  rowHeight = MONTH_ROW_HEIGHT,
): { weeks: Array<Array<MonthCell<T>>>; from: Date; to: Date } {
  const from = startOfSpan(anchor, "month", timeZone);
  const rows = monthGridWeeks(anchor, timeZone);
  const month = toWallTime(anchor, timeZone).month;
  const cap = chipsThatFit(rowHeight);

  // One pass over the events rather than one scan per cell: a busy month is a
  // few hundred sittings and forty-two cells, and the quadratic version of this
  // is the kind of thing that only shows up on the busiest person's account.
  const byDay = new Map<number, T[]>();
  const opens = from.getTime();
  for (const event of events) {
    // A sitting that began before the grid opened — a class running through the
    // midnight the first Monday starts on — is filed under that first day
    // rather than under a cell the grid does not draw. The server's window is
    // "overlaps", so such a class is genuinely in the answer and the header has
    // already counted it; filing it by its own start day would leave that count
    // standing over a chip drawn nowhere.
    const key = Math.max(
      startOfLocalDay(event.start, timeZone).getTime(),
      opens,
    );
    const list = byDay.get(key);
    if (list) list.push(event);
    else byDay.set(key, [event]);
  }

  const weeks: Array<Array<MonthCell<T>>> = [];
  for (let row = 0; row < rows; row++) {
    const week: Array<MonthCell<T>> = [];
    for (let column = 0; column < 7; column++) {
      const day = addDays(from, row * 7 + column, timeZone);
      const dayEvents = byDay.get(day.getTime()) ?? [];
      // The overflow slot holds one more chip: with a cap of three, a day with
      // exactly four shows all four, because "+1 more" occupying the space the
      // fourth would have taken is silly.
      const shown = dayEvents.length <= cap + 1 ? dayEvents.length : cap;
      week.push({
        day,
        inMonth: toWallTime(day, timeZone).month === month,
        isToday: isSameLocalDay(day, now, timeZone),
        events: dayEvents,
        shown,
        more: dayEvents.length - shown,
      });
    }
    weeks.push(week);
  }

  return { weeks, from, to: addDays(from, rows * 7, timeZone) };
}
