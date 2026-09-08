"use client";

import { DatePicker } from "~/components/ui/date-picker";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import {
  addDays,
  formatMonthLabel,
  formatWeekLabel,
  startOfLocalDay,
  startOfLocalMonth,
  toWallTime,
} from "~/lib/dates";
import {
  monthsOfYear,
  spanHolds,
  startOfLocalWeek,
  stepSpan,
  weeksTouchingMonth,
  type ScheduleSpan,
} from "~/lib/schedule-spans";

/**
 * Which stretch of the calendar the screen is showing.
 *
 * The timetable and the booking screen are a single day wide, and the schedule
 * can be a day, a week or a month; either way this is the screen's main
 * control, so it works the same in all four. Step it, jump to any date from the
 * month grid, or take a labelled tab from the strip.
 *
 * The strip is always the unit one below the one being shown — days within the
 * week for a day, weeks within the month for a week, months within the year for
 * a month — which is one rule rather than three, and keeps every strip bounded
 * at 7, 4–6 or 12 pills. The tabs carry the date rather than only the weekday:
 * "Tue" alone cannot tell you which Tuesday you are looking at, which is the
 * whole question when booking a room.
 */

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The three controls that move the window: back, the date itself, forward, and
 * the way home.
 *
 * Split out from the navigator so the schedule and the timetable can put them
 * up beside the page's title, where the question "which day am I looking at" is
 * asked, while the strip of dated tabs stays down with the calendar it indexes.
 * The booking screen still takes the pair together as `DayNavigator`.
 */
export function DayControls({
  date,
  timeZone,
  onChange,
  span = "day",
}: {
  date: Date;
  timeZone: string;
  onChange: (day: Date) => void;
  span?: ScheduleSpan;
}) {
  const day = startOfLocalDay(date, timeZone);
  const now = new Date();
  // "Today" means "back to now" in every span, so what it is disabled by is
  // whether now is already in view rather than whether the day is today.
  const atNow = spanHolds(day, span, now, timeZone);

  return (
    // `min-w-0` on every box down this chain, because a flex item's automatic
    // minimum size is its content: without it this row cannot be made narrower
    // than the date it holds, so on a 360px phone it is wider than the screen.
    <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto">
      <Step
        icon="chevronLeft"
        label={`Previous ${span}`}
        onClick={() => onChange(stepSpan(day, span, -1, timeZone))}
      />
      {/*
        The one part of the row that gives: the arrows and Today are fixed
        shapes, so the date is what shortens when there is not enough room, and
        it has a month grid and a strip of tabs elsewhere saying the same thing.
      */}
      <DatePicker
        className="min-w-0 flex-1 sm:flex-none"
        value={day}
        timeZone={timeZone}
        onChange={onChange}
        ariaLabel="Date"
        label={spanLabel(day, span, timeZone)}
      />
      <Step
        icon="chevronRight"
        label={`Next ${span}`}
        onClick={() => onChange(stepSpan(day, span, 1, timeZone))}
      />
      <button
        type="button"
        disabled={atNow}
        onClick={() => onChange(startOfLocalDay(now, timeZone))}
        className="h-10 shrink-0 rounded-[10px] px-3 text-[12.5px] font-semibold lg:h-8.5"
        style={{
          background: "rgba(68,88,121,0.07)",
          color: "var(--slate)",
          opacity: atNow ? 0.4 : 1,
          cursor: atNow ? "default" : "pointer",
        }}
      >
        Today
      </button>
    </div>
  );
}

/**
 * The labelled tabs one unit below the one on screen.
 *
 * Stays with the calendar rather than going up to the header with the controls:
 * a week of dated tabs is wider than a phone and scrolls inside itself, and a
 * sticky header is the last place to put something that needs room and moves.
 */
export function DayStrip({
  date,
  timeZone,
  onChange,
  span = "day",
  /** How much of the week the day strip shows, from Monday. */
  daysInStrip = 7,
  /**
   * The box the strip is measured in. The default is the page's own width,
   * which is what a screen keeping the strip below its header wants.
   *
   * A prop rather than a wrapper the caller adds, because a second box around
   * this one is exactly the bug the comment below is about: `w-full` inside a
   * `sm:w-auto` parent is a percentage resolved against a box being sized by
   * its own contents, and the strip goes back to being handed a width nobody
   * chose.
   */
  className = "w-full min-w-0",
}: {
  date: Date;
  timeZone: string;
  onChange: (day: Date) => void;
  span?: ScheduleSpan;
  daysInStrip?: number;
  className?: string;
}) {
  const day = startOfLocalDay(date, timeZone);
  return (
    // The strip is sized by this box rather than by the row it used to share,
    // which is the whole reason it scrolls in the right width: handed the
    // navigator's width instead of the page's, it hung off the edge of a phone.
    <div className={className}>
      <Segmented
        items={stripFor(day, span, timeZone, daysInStrip)}
        value={stripValue(day, span, timeZone)}
        onChange={(value) => onChange(new Date(value))}
        size="sm"
      />
    </div>
  );
}

/** Both halves together, for a screen that keeps them in one place. */
export function DayNavigator({
  date,
  timeZone,
  onChange,
  span = "day",
  daysInStrip = 7,
}: {
  date: Date;
  timeZone: string;
  onChange: (day: Date) => void;
  span?: ScheduleSpan;
  daysInStrip?: number;
}) {
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2.5 sm:w-auto">
      <DayControls
        date={date}
        timeZone={timeZone}
        onChange={onChange}
        span={span}
      />
      <DayStrip
        date={date}
        timeZone={timeZone}
        onChange={onChange}
        span={span}
        daysInStrip={daysInStrip}
        className="w-full min-w-0 sm:w-auto"
      />
    </div>
  );
}

/** What the closed date button says for each span. */
function spanLabel(
  day: Date,
  span: ScheduleSpan,
  timeZone: string,
): string | undefined {
  switch (span) {
    // The day speaks for itself; the picker's own default is right.
    case "day":
      return undefined;
    case "week":
      return formatWeekLabel(startOfLocalWeek(day, timeZone), timeZone);
    case "month": {
      const wall = toWallTime(day, timeZone);
      return formatMonthLabel(wall.year, wall.month);
    }
  }
}

/**
 * The tabs, always the unit below the span.
 *
 * The week strip is built from the month of the anchor's *Monday*, not of the
 * anchor: a week straddling the 1st would otherwise produce a strip with no
 * active pill in it.
 */
function stripFor(
  day: Date,
  span: ScheduleSpan,
  timeZone: string,
  daysInStrip: number,
): Array<{ value: string; label: string }> {
  if (span === "day") {
    const monday = startOfLocalWeek(day, timeZone);
    return Array.from({ length: daysInStrip }, (_, i) => {
      const at = addDays(monday, i, timeZone);
      return {
        value: at.toISOString(),
        label: `${DAY_NAMES[i]} ${toWallTime(at, timeZone).day}`,
      };
    });
  }

  if (span === "week") {
    // Day numbers only. The date button beside the strip carries the month, and
    // repeating it on every pill is what makes a strip too wide to scan.
    return weeksTouchingMonth(day, timeZone).map((at) => ({
      value: at.toISOString(),
      label: `${toWallTime(at, timeZone).day}–${toWallTime(addDays(at, 6, timeZone), timeZone).day}`,
    }));
  }

  return monthsOfYear(day, timeZone).map((at) => ({
    value: at.toISOString(),
    label: new Intl.DateTimeFormat("en-GB", {
      month: "short",
      timeZone,
    }).format(at),
  }));
}

/** Which pill is lit: the start of the unit the anchor falls in. */
function stripValue(day: Date, span: ScheduleSpan, timeZone: string): string {
  switch (span) {
    case "day":
      return day.toISOString();
    case "week":
      return startOfLocalWeek(day, timeZone).toISOString();
    case "month":
      return startOfLocalMonth(day, timeZone).toISOString();
  }
}

/**
 * One span back or forward. A 34px chip is comfortable under a mouse and mean
 * under a thumb, so it only shrinks to that where there is a sidebar to prove
 * we are on a desktop; everywhere else it is a 40px target.
 */
function Step({
  icon,
  label,
  onClick,
}: {
  icon: "chevronLeft" | "chevronRight";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[10px] lg:h-8.5 lg:w-8.5"
      style={{ background: "rgba(68,88,121,0.07)" }}
    >
      <Icon name={icon} size={14} color="var(--slate)" stroke={2.2} />
    </button>
  );
}
