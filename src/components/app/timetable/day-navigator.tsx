"use client";

import { DatePicker } from "~/components/ui/date-picker";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import {
  addDays,
  isoWeekday,
  isSameLocalDay,
  startOfLocalDay,
  toWallTime,
} from "~/lib/dates";

/**
 * Which day the calendar is showing.
 *
 * Both calendar screens are a single day wide, so the day is the screen's main
 * control: step it, jump to any date from the month grid, or take a dated tab
 * from the week the chosen day falls in. The tabs carry the date rather than
 * only the weekday — "Tue" alone cannot tell you which Tuesday you are looking
 * at, which is the whole question when booking a room.
 */

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function DayNavigator({
  date,
  timeZone,
  onChange,
  /** How much of the week the strip shows, from Monday. */
  daysInStrip = 7,
}: {
  date: Date;
  timeZone: string;
  onChange: (day: Date) => void;
  daysInStrip?: number;
}) {
  const day = startOfLocalDay(date, timeZone);
  const monday = addDays(day, -(isoWeekday(day, timeZone) - 1), timeZone);
  const isToday = isSameLocalDay(day, new Date(), timeZone);

  const strip = Array.from({ length: daysInStrip }, (_, i) => {
    const at = addDays(monday, i, timeZone);
    return {
      value: at.toISOString(),
      label: `${DAY_NAMES[i]} ${toWallTime(at, timeZone).day}`,
    };
  });

  return (
    // `min-w-0` on every box down this chain, because a flex item's automatic
    // minimum size is its content: without it the row below cannot be made
    // narrower than the date it holds, so on a 360px phone this whole navigator
    // is wider than the screen — and the day strip, sized to the navigator
    // rather than the window, is the part seen hanging off the edge. The strip
    // scrolls perfectly well; it was being handed the wrong width to scroll in.
    // `w-full` only while it is the whole line anyway. Left on at every width it
    // would take a line of its own on a laptop too, pushing the controls that
    // used to sit beside it — "view as", the building filter — down a row.
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2.5 sm:w-auto">
      <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-auto">
        <Step
          icon="chevronLeft"
          label="Previous day"
          onClick={() => onChange(addDays(day, -1, timeZone))}
        />
        {/*
          The one part of the row that gives: the arrows and Today are fixed
          shapes, so the date is what shortens when there is not enough room,
          and it has a month grid and a week of tabs either side of it saying
          the same thing.
        */}
        <DatePicker
          className="min-w-0 flex-1 sm:flex-none"
          value={day}
          timeZone={timeZone}
          onChange={onChange}
          ariaLabel="Date"
        />
        <Step
          icon="chevronRight"
          label="Next day"
          onClick={() => onChange(addDays(day, 1, timeZone))}
        />
        <button
          type="button"
          disabled={isToday}
          onClick={() => onChange(startOfLocalDay(new Date(), timeZone))}
          className="h-10 shrink-0 rounded-[10px] px-3 text-[12.5px] font-semibold lg:h-8.5"
          style={{
            background: "rgba(68,88,121,0.07)",
            color: "var(--slate)",
            opacity: isToday ? 0.4 : 1,
            cursor: isToday ? "default" : "pointer",
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
          items={strip}
          value={day.toISOString()}
          onChange={(value) => onChange(new Date(value))}
          size="sm"
        />
      </div>
    </div>
  );
}

/**
 * One day back or forward. A 34px chip is comfortable under a mouse and mean
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
