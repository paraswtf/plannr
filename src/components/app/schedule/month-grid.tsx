"use client";

import { useLongPress } from "~/components/ui/use-long-press";
import { courseTone } from "~/lib/course-colour";
import { formatDayLabel, formatHourLabel, toWallTime } from "~/lib/dates";
import type { DayCalendarEvent } from "./day-calendar";
import { MONTH_ROW_HEIGHT, type MonthCell } from "./month-layout";

/**
 * A month at a glance: seven columns, four to six rows, and each day's classes
 * as chips on it.
 *
 * The month answers a different question from the day and the week — not "where
 * am I at two o'clock" but "which days am I busy" — so a chip carries only what
 * a glance needs, and the day view is one tap away for everything else.
 *
 * Touch targets are the one house rule this screen cannot keep: five weeks of
 * 40px chips is a 1400px grid nobody would scroll. The compensation is stated
 * rather than hidden — the *cell* is the target, comfortably above the minimum
 * at 124px tall, a tap anywhere in it opens that day at full size, and nothing
 * whatever is reachable only through a chip.
 */

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthGrid({
  weeks,
  timeZone,
  now,
  onDayClick,
  onEventClick,
  onEventPress,
}: {
  weeks: Array<Array<MonthCell<DayCalendarEvent>>>;
  timeZone: string;
  now: Date;
  onDayClick: (day: Date) => void;
  onEventClick?: (event: DayCalendarEvent) => void;
  onEventPress?: (event: DayCalendarEvent) => void;
}) {
  return (
    <div
      className="bg-surface overflow-hidden rounded-[var(--radius-card)]"
      style={{ boxShadow: "var(--ring), var(--shadow-card)" }}
    >
      <div
        className="grid grid-cols-7"
        style={{ boxShadow: "0 1px 0 var(--hair)" }}
      >
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="text-muted py-2 text-center text-[11.5px] font-semibold"
          >
            {/* Two letters is all a 50px cell can hold, and "Mo" is no less
                legible above a column of numbers than "Mon" is. */}
            <span className="sm:hidden">{name.slice(0, 2)}</span>
            <span className="hidden sm:inline">{name}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {weeks.flatMap((week, row) =>
          week.map((cell, column) => (
            <Cell
              key={cell.day.toISOString()}
              cell={cell}
              timeZone={timeZone}
              now={now}
              firstRow={row === 0}
              firstColumn={column === 0}
              onDayClick={onDayClick}
              onEventClick={onEventClick}
              onEventPress={onEventPress}
            />
          )),
        )}
      </div>
    </div>
  );
}

function Cell({
  cell,
  timeZone,
  now,
  firstRow,
  firstColumn,
  onDayClick,
  onEventClick,
  onEventPress,
}: {
  cell: MonthCell<DayCalendarEvent>;
  timeZone: string;
  now: Date;
  firstRow: boolean;
  firstColumn: boolean;
  onDayClick: (day: Date) => void;
  onEventClick?: (event: DayCalendarEvent) => void;
  onEventPress?: (event: DayCalendarEvent) => void;
}) {
  const wall = toWallTime(cell.day, timeZone);

  return (
    <div
      className="relative"
      style={{
        height: MONTH_ROW_HEIGHT,
        boxShadow: [
          firstRow ? null : "inset 0 1px 0 var(--hair-soft)",
          firstColumn ? null : "inset 1px 0 0 var(--hair-soft)",
        ]
          .filter(Boolean)
          .join(", "),
      }}
    >
      {/*
       * The day's own target, drawn *behind* the chips rather than around them.
       * A chip inside a day button would be a button inside a button — invalid,
       * and with genuinely undefined activation behaviour — and this way there
       * is no propagation to fight either.
       */}
      <button
        type="button"
        aria-label={`Open ${formatDayLabel(cell.day, timeZone)}`}
        onClick={() => onDayClick(cell.day)}
        className="absolute inset-0 cursor-pointer"
      />

      <div className="pointer-events-none relative flex h-full flex-col gap-[3px] p-1.5">
        <div className="flex shrink-0 items-center justify-between">
          <span
            className={`font-display flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11.5px] font-bold ${
              cell.isToday
                ? "text-white"
                : cell.inMonth
                  ? "text-title"
                  : "text-faint"
            }`}
            style={cell.isToday ? { background: "var(--slate)" } : undefined}
          >
            {wall.day}
          </span>
        </div>

        {cell.events.slice(0, cell.shown).map((event) => (
          <Chip
            key={event.id}
            event={event}
            now={now}
            timeZone={timeZone}
            onClick={onEventClick}
            onPress={onEventPress}
          />
        ))}

        {cell.more > 0 && (
          // A disclosure rather than a class, so it takes no press gesture: it
          // drops into the day, which is where the rest of them are full size.
          <button
            type="button"
            onClick={() => onDayClick(cell.day)}
            className="text-muted pointer-events-auto shrink-0 cursor-pointer truncate px-1 text-left text-[10.5px] font-semibold"
          >
            +{cell.more} more
          </button>
        )}
      </div>
    </div>
  );
}

function Chip({
  event,
  now,
  timeZone,
  onClick,
  onPress,
}: {
  event: DayCalendarEvent;
  now: Date;
  timeZone: string;
  onClick?: (event: DayCalendarEvent) => void;
  onPress?: (event: DayCalendarEvent) => void;
}) {
  const press = useLongPress(onPress ? () => onPress(event) : undefined);
  const live = event.start <= now && now < event.end;
  const past = event.end <= now;
  const tone = courseTone(event.courseTitle);

  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(event) : undefined}
      {...press}
      title={`${formatHourLabel(event.start, timeZone)} · ${event.title}`}
      className="pointer-events-auto flex h-5 shrink-0 items-center gap-1 overflow-hidden rounded-[6px] px-1.5 text-left select-none"
      style={{
        background: live ? "var(--live-fill)" : tone.fill,
        boxShadow: live
          ? "inset 0 0 0 1px var(--red)"
          : `inset 0 0 0 1px ${tone.ring}`,
        opacity: past && !live ? 0.62 : 1,
        cursor: onClick ? "pointer" : "default",
        WebkitTouchCallout: "none",
      }}
    >
      {/* The time is the first thing to go: a 50px cell has room for a title or
          a time, and the title is what tells one busy day from another. */}
      <span className="text-faint hidden shrink-0 font-mono text-[9.5px] sm:inline">
        {formatHourLabel(event.start, timeZone)}
      </span>
      <span className="text-title min-w-0 truncate text-[10.5px] font-semibold">
        {event.title}
      </span>
    </button>
  );
}
