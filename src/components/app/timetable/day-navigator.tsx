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
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="flex items-center gap-1.5">
        <Step
          icon="chevronLeft"
          label="Previous day"
          onClick={() => onChange(addDays(day, -1, timeZone))}
        />
        <DatePicker
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
          className="rounded-[10px] px-3 py-2 text-[12.5px] font-semibold"
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

      <Segmented
        items={strip}
        value={day.toISOString()}
        onChange={(value) => onChange(new Date(value))}
        size="sm"
      />
    </div>
  );
}

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
      className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-[10px]"
      style={{ background: "rgba(68,88,121,0.07)" }}
    >
      <Icon name={icon} size={14} color="var(--slate)" stroke={2.2} />
    </button>
  );
}
