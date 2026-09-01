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

export function DayNavigator({
  date,
  timeZone,
  onChange,
  span = "day",
  /** How much of the week the day strip shows, from Monday. */
  daysInStrip = 7,
}: {
  date: Date;
  timeZone: string;
  onChange: (day: Date) => void;
  span?: ScheduleSpan;
  daysInStrip?: number;
}) {
  const day = startOfLocalDay(date, timeZone);
  const now = new Date();
  // "Today" means "back to now" in every span, so what it is disabled by is
  // whether now is already in view rather than whether the day is today.
  const atNow = spanHolds(day, span, now, timeZone);

  return (
    // `min-w-0` on every box down this chain, because a flex item's automatic
    // minimum size is its content: without it the row below cannot be made
    // narrower than the date it holds, so on a 360px phone this whole navigator
    // is wider than the screen — and the strip, sized to the navigator rather
    // than the window, is the part seen hanging off the edge. The strip scrolls
    // perfectly well; it was being handed the wrong width to scroll in.
    // `w-full` only while it is the whole line anyway. Left on at every width it
    // would take a line of its own on a laptop too, pushing the controls that
    // used to sit beside it — "view as", the building filter — down a row.
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2.5 sm:w-auto">
      <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto">
        <Step
          icon="chevronLeft"
          label={`Previous ${span}`}
          onClick={() => onChange(stepSpan(day, span, -1, timeZone))}
        />
        {/*
          The one part of the row that gives: the arrows and Today are fixed
          shapes, so the date is what shortens when there is not enough room,
          and it has a month grid and a strip of tabs either side of it saying
          the same thing.
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

      {/*
       * A week of dated tabs is wider than a phone, and already scrolls inside
       * itself. All this wrapper does is give it a line of its own below sm —
       * sharing one with the day controls would leave it a couple of
       * centimetres to scroll in. Wrapping it in a second scroller would only
       * clip the chosen pill's shadow, which is what the strip's own vertical
       * padding is there to protect.
       */}
      <div className="w-full min-w-0 sm:w-auto">
        <Segmented
          items={stripFor(day, span, timeZone, daysInStrip)}
          value={stripValue(day, span, timeZone)}
          onChange={(value) => onChange(new Date(value))}
          size="sm"
        />
      </div>
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
