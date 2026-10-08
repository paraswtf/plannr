"use client";

import { useLongPress } from "~/components/ui/use-long-press";
import { courseTone } from "~/lib/course-colour";
import { formatDayLabel, formatHourLabel, toWallTime } from "~/lib/dates";
import { blockPaint } from "./block-paint";
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
    /*
     * The ring is drawn by a pseudo-element over the cells rather than as the
     * box's own inset shadow, which paints under its children: a lead-in or
     * lead-out day, on the paper, would otherwise paint over the card's edge
     * and its rounded corner and run straight into the page.
     */
    <div className="bg-surface relative overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[var(--ring)]">
      <div className="grid grid-cols-7 shadow-[0_1px_0_var(--hair)]">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="text-muted py-2 text-center text-xs font-semibold"
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
    /*
     * A day outside the month sits on the paper rather than the surface, so
     * "not this month" no longer reads the same as "already happened": past
     * chips are paler now, and lead-in days are a different ground.
     */
    <div
      className={`relative ${cell.inMonth ? "" : "bg-paper"}`}
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
        // A wash under the pointer says the whole cell is the target, and the
        // ring is inset: the card clips its edges and the next cell paints
        // over anything drawn outside this one.
        className="hover:bg-tint-hover absolute inset-0 cursor-pointer transition-colors focus-visible:outline-offset-[-2px]"
      />

      <div className="pointer-events-none relative flex h-full flex-col gap-[3px] p-1.5">
        <div className="flex shrink-0 items-center justify-between">
          {/* 18px tall, which `DATE_LINE` in month-layout.ts budgets for. */}
          <span
            className={`font-display flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-xs font-semibold ${
              cell.isToday
                ? "bg-slate text-white"
                : cell.inMonth
                  ? "text-title"
                  : "text-faint"
            }`}
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
          //
          // A chip's height, 20px, rather than a line of text: it is its own
          // stop for a keyboard and its own target for a finger, and it is
          // exactly the overflow slot `monthLayout` leaves for it. Below `sm` the
          // word goes to a screen reader only, because "+2 m…" truncated said
          // less than "+2" does.
          <button
            type="button"
            onClick={() => onDayClick(cell.day)}
            className="text-muted hover:bg-tint hover:text-title pointer-events-auto flex h-5 shrink-0 cursor-pointer items-center self-start rounded-[6px] px-1.5 font-mono text-[10.5px] font-semibold transition-colors focus-visible:outline-offset-[-2px]"
          >
            +{cell.more}
            <span className="max-sm:sr-only">&nbsp;more</span>
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
      /*
       * The 20px slot is the chip at every width, because `CHIP_HEIGHT` in
       * month-layout.ts counts it. What is painted inside it changes: from `sm`
       * the fill is the whole slot with the time and title on it, and below,
       * where a 50px cell could only show "Ma…", it is a 6px bar of the
       * course's colour with the words kept for a screen reader and on the
       * `title`. The cell behind is the target either way.
       */
      className="pointer-events-auto relative flex h-5 shrink-0 items-center gap-1 overflow-hidden rounded-[6px] px-1.5 text-left select-none hover:brightness-[0.97] focus-visible:outline-offset-[-2px]"
      style={{
        cursor: onClick ? "pointer" : "default",
        WebkitTouchCallout: "none",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-[6px] max-sm:inset-y-[7px] max-sm:rounded-full"
        style={blockPaint(tone, { live, past: past && !live })}
      />
      {/* The time is the first thing to go: a 50px cell has room for a title or
          a time, and the title is what tells one busy day from another. */}
      <span className="text-ink relative hidden shrink-0 font-mono text-[9.5px] font-medium sm:inline">
        {formatHourLabel(event.start, timeZone)}
      </span>
      <span className="text-title relative min-w-0 truncate text-[10.5px] font-semibold max-sm:sr-only">
        {event.title}
      </span>
    </button>
  );
}
