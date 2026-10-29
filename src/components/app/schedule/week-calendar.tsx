"use client";

import { useEffect, useRef } from "react";

import { useLongPress } from "~/components/ui/use-long-press";
import { courseTone } from "~/lib/course-colour";
import {
  decimalHour,
  formatHourLabel,
  isSameLocalDay,
  toWallTime,
} from "~/lib/dates";
import {
  blockHeight,
  dayWindow,
  fitLines,
  GUTTER,
  packOverlaps,
  ROW_HEIGHT,
} from "./day-layout";
import { AssignmentMark } from "~/components/app/assignments/assignment-mark";
import { blockPaint, NowMark } from "./block-paint";
import { clashesWithNow, type DayCalendarEvent } from "./day-calendar";

/**
 * A week, drawn as seven of the day beside each other.
 *
 * The same unit as the day — decimal local hours at a fixed pixel height — and
 * deliberately the same `ROW_HEIGHT`, imported rather than restated, so that
 * stepping between the two spans does not read as two different applications.
 *
 * One window for the whole week, not one per column: seven columns each sized
 * to their own earliest class would give seven different heights and an hour
 * gutter that meant nothing at all.
 *
 * Monday to Sunday rather than the working week. `OrgSettings.workingDays` is
 * Monday–Friday, but a Saturday remedial class is a real thing here, and a week
 * that cannot show one is worse than two thin columns — which is all they cost,
 * the columns being `flex-1`.
 */

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Column geometry as a custom property, for the same reason the timetable grid
 * uses one: the minimum width and the scroller's own minimum have to agree, and
 * one of them is on an element the other cannot see.
 */
const GEOMETRY =
  "[--sched-day-w:118px] sm:[--sched-day-w:132px] lg:[--sched-day-w:140px]";

export function WeekCalendar({
  events,
  days,
  timeZone,
  now,
  rowHeight = ROW_HEIGHT,
  onEventClick,
  onEventPress,
  onDayClick,
}: {
  /** The whole week, unbucketed — this files them by local day itself. */
  events: DayCalendarEvent[];
  /** The columns: local midnights, Monday first. */
  days: Date[];
  timeZone: string;
  now: Date;
  rowHeight?: number;
  onEventClick?: (event: DayCalendarEvent) => void;
  onEventPress?: (event: DayCalendarEvent) => void;
  /** A column heading drops into that day. */
  onDayClick?: (day: Date) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const todayColumn = useRef<HTMLDivElement>(null);

  const holdsToday = days.some((day) => isSameLocalDay(day, now, timeZone));
  const { startHour, endHour } = dayWindow(
    events,
    holdsToday ? now : null,
    timeZone,
  );
  const height = (endHour - startHour) * rowHeight;

  const nowHour = decimalHour(now, timeZone);
  const showNow = holdsToday && nowHour >= startHour && nowHour <= endHour;

  const byDay = new Map<number, DayCalendarEvent[]>();
  for (const event of events) {
    // Filed by which column it lands in rather than by its own midnight, so a
    // stray occurrence just outside the week cannot invent an eighth column.
    // A sitting that began before the week opened — a class running through
    // Sunday midnight into Monday — is drawn on the first column it reaches
    // rather than dropped: it is genuinely part of this week, and the header
    // has already counted it, so leaving it out would be a count with nothing
    // under it.
    const column =
      days.find((day) => isSameLocalDay(day, event.start, timeZone)) ??
      (days[0] && event.start < days[0] && event.end > days[0]
        ? days[0]
        : undefined);
    if (!column) continue;
    const list = byDay.get(column.getTime());
    if (list) list.push(event);
    else byDay.set(column.getTime(), [event]);
  }

  // On arrival, put today's column on screen. Only sideways, and only this box:
  // `scrollIntoView` would walk every scrolling ancestor and drag the page with
  // it. Once — re-running it every tick would fight the reader's own scrolling.
  useEffect(() => {
    const box = scroller.current;
    const column = todayColumn.current;
    if (!box || !column) return;
    box.scrollLeft = Math.max(
      0,
      column.offsetLeft - GUTTER - (box.clientWidth - column.offsetWidth) / 2,
    );
  }, []);

  return (
    <div className={CARD_FRAME}>
      <div
        ref={scroller}
        // Containing the overscroll keeps a swipe that runs off the end of the
        // week from being read as the browser's back gesture. Only sideways: once
        // the day is taller than the box, a swipe that runs off the bottom has to
        // carry on down the page, which is what chaining does. The card's ring is
        // the frame's, drawn over this box rather than inside it.
        className={`plr-scroll bg-surface overflow-x-auto overscroll-x-contain rounded-[var(--radius-card)] shadow-[var(--shadow-card)] ${GEOMETRY}`}
      >
        <div
          style={{
            minWidth: `calc(${GUTTER}px + 7 * var(--sched-day-w))`,
          }}
        >
          {/* The dates across the top. */}
          <div className="flex shadow-[0_1px_0_var(--hair)]">
            {/*
             * The corner above the hour gutter holds still with it, so the
             * dates slide under one unbroken edge rather than under a gap.
             */}
            <div
              className={`shrink-0 ${STICKY_GUTTER}`}
              style={{ width: GUTTER }}
            />
            {days.map((day, index) => {
              const wall = toWallTime(day, timeZone);
              const isToday = isSameLocalDay(day, now, timeZone);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={onDayClick ? () => onDayClick(day) : undefined}
                  // A wash under the pointer, because this drops into the day
                  // and nothing else said it could be pressed. The focus ring is
                  // inset: the scroller clips anything drawn outside its box.
                  className="hover:bg-tint-hover flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 px-1 py-2 transition-colors focus-visible:outline-offset-[-2px] lg:min-h-0"
                  style={{
                    minWidth: "var(--sched-day-w)",
                    cursor: onDayClick ? "pointer" : "default",
                  }}
                >
                  <span className="text-muted text-xs font-semibold">
                    {DAY_NAMES[index]}
                  </span>
                  <span
                    className={`font-display flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ${
                      isToday ? "bg-slate text-white" : "text-title"
                    }`}
                  >
                    {wall.day}
                  </span>
                </button>
              );
            })}
          </div>

          {/* The week itself. */}
          <div className="relative flex" style={{ height }}>
            {/*
             * The hour gutter stays put while the columns pan under it.
             *
             * A phone opens the week centred on today, which used to leave the
             * gutter scrolled off to the left: no hours and no now-label on the
             * first screen, so not one block could be placed in time. Sticky
             * inside the scroller, over the blocks, with the surface behind it so
             * a class sliding underneath does not show through the labels. The
             * centring arithmetic above is unchanged by it.
             */}
            <div
              className={`relative shrink-0 ${STICKY_HOURS}`}
              style={{ width: GUTTER }}
            >
              {hoursIn(startHour, endHour).map((hour) => (
                <span
                  key={hour}
                  className={`text-faint absolute right-3 font-mono text-[11px] ${hourNudge(hour, startHour, endHour)}`}
                  style={{
                    top: (hour - startHour) * rowHeight,
                    visibility: clashesWithNow(
                      hour,
                      showNow ? nowHour : undefined,
                      rowHeight,
                    )
                      ? "hidden"
                      : undefined,
                  }}
                >
                  {formatHourLabel(
                    new Date(Date.UTC(2000, 0, 1, hour, 0)),
                    "UTC",
                  )}
                </span>
              ))}

              {/*
               * The now-label and its lamp, in the gutter that holds still, so
               * the time is on screen however far the week has been panned. The
               * faint line they lead into stays behind, all the way across.
               */}
              {showNow && (
                <div
                  className="pointer-events-none absolute left-0 flex -translate-y-1/2 items-center"
                  style={{ top: (nowHour - startHour) * rowHeight }}
                >
                  <span
                    className="text-bad text-right font-mono text-[11px] font-semibold"
                    style={{ width: GUTTER - 12 }}
                  >
                    {formatHourLabel(now, timeZone)}
                  </span>
                  <span className="bg-red ml-[6px] h-[7px] w-[7px] shrink-0 rounded-full" />
                </div>
              )}
            </div>

            {days.map((day) => {
              const isToday = isSameLocalDay(day, now, timeZone);
              return (
                <div
                  key={day.toISOString()}
                  ref={isToday ? todayColumn : null}
                  className="relative flex-1"
                  style={{
                    minWidth: "var(--sched-day-w)",
                    boxShadow: "inset 1px 0 0 var(--hair-soft)",
                  }}
                >
                  {/*
                   * The rules, as hairlines rather than as full-height bands. A
                   * band per hour would have to stop one short of `endHour` or
                   * stand a whole row proud of the column — which the scroller
                   * then offers as an hour of empty day to scroll into. Lines
                   * have no such end to get wrong, and they are drawn with a
                   * height of their own because an inset shadow on a box with no
                   * height paints nothing at all.
                   */}
                  {hoursIn(startHour, endHour).map((hour) => (
                    <div key={hour} className="pointer-events-none">
                      <div
                        className="absolute w-full"
                        style={{
                          top: (hour - startHour) * rowHeight,
                          height: 1,
                          boxShadow: "inset 0 1px 0 var(--hair-soft)",
                        }}
                      />
                      {hour < endHour && (
                        <div
                          className="absolute w-full"
                          style={{
                            top: (hour - startHour + 0.5) * rowHeight,
                            height: 1,
                            boxShadow: "inset 0 1px 0 var(--tint-hover)",
                          }}
                        />
                      )}
                    </div>
                  ))}

                  {packOverlaps(byDay.get(day.getTime()) ?? []).map(
                    ({ event, column, columns }) => (
                      <WeekBlock
                        key={event.id}
                        event={event}
                        column={column}
                        columns={columns}
                        startHour={startHour}
                        rowHeight={rowHeight}
                        timeZone={timeZone}
                        now={now}
                        onClick={onEventClick}
                        onPress={onEventPress}
                      />
                    ),
                  )}

                  {/*
                   * The bright half of the now-line, drawn inside today's column
                   * so that "which column is now in" needs no arithmetic about
                   * where that column starts.
                   */}
                  {showNow && isToday && (
                    <div
                      className="bg-red pointer-events-none absolute inset-x-0 z-[5] h-[2px]"
                      style={{ top: (nowHour - startHour) * rowHeight }}
                    />
                  )}
                </div>
              );
            })}

            {/*
             * And the faint half, all the way across: the hour you are at is read
             * against the other six columns as much as against today's. Its label
             * and lamp moved into the sticky gutter above; this is the line alone,
             * starting where the gutter ends. The red's own line token, so it is
             * the same faint red as every other quiet red edge in the app.
             */}
            {showNow && (
              <div
                className="bg-bad-line pointer-events-none absolute right-0 z-[4] h-[1px]"
                style={{
                  left: GUTTER,
                  top: (nowHour - startHour) * rowHeight,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One sitting in a week column.
 *
 * Narrower than the day's, so it says less: the room and the time share the
 * second line only where there is width for both, and `fitLines` — the same
 * rule the day applies — decides the rest.
 */
function WeekBlock({
  event,
  column,
  columns,
  startHour,
  rowHeight,
  timeZone,
  now,
  onClick,
  onPress,
}: {
  event: DayCalendarEvent;
  column: number;
  columns: number;
  startHour: number;
  rowHeight: number;
  timeZone: string;
  now: Date;
  onClick?: (event: DayCalendarEvent) => void;
  onPress?: (event: DayCalendarEvent) => void;
}) {
  const press = useLongPress(onPress ? () => onPress(event) : undefined);

  const from = decimalHour(event.start, timeZone);
  const to = decimalHour(event.end, timeZone) || 24;
  const live = event.start <= now && now < event.end;
  const past = event.end <= now;
  const tone = courseTone(event.courseTitle);
  const span = to - from;
  const lines = fitLines(span, rowHeight, event.lines ?? []);

  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(event) : undefined}
      {...press}
      // The day's states, at the week's size: see `DayBlock`.
      className="plr-clip absolute overflow-hidden rounded-lg px-2 py-1.5 text-left select-none hover:brightness-[0.97] focus-visible:outline-offset-[-3px] active:scale-[0.97]"
      style={{
        top: (from - startHour) * rowHeight + 2,
        height: blockHeight(span, rowHeight),
        // The gutter is a sibling of these columns rather than part of them, so
        // a block's geometry is a plain fraction of its own column — none of
        // the day view's arithmetic for subtracting a gutter it sits inside.
        left: `calc(2px + ${(column / columns) * 100}%)`,
        width: `calc(${(1 / columns) * 100}% - 4px)`,
        ...blockPaint(tone, { live, past: past && !live }),
        cursor: onClick ? "pointer" : "default",
        WebkitTouchCallout: "none",
      }}
    >
      {/* Solid inks on the fill, at `fitLines`'s sizes: see `DayBlock`. */}
      <span className="text-title block truncate text-[12px] leading-tight font-semibold">
        <AssignmentMark assignments={event.assignments} />
        {event.title}
      </span>
      {span >= 0.5 && (
        <span className="text-ink mt-0.5 block truncate font-mono text-[10.5px] font-medium">
          {live && <NowMark />}
          {[formatHourLabel(event.start, timeZone), event.roomCode]
            .filter(Boolean)
            .join(" · ")}
        </span>
      )}
      {lines.map((line) => (
        <span
          key={line}
          className="text-ink mt-0.5 block truncate text-[10.5px]"
        >
          {line}
        </span>
      ))}
    </button>
  );
}

/**
 * The gutter's sticky treatment, shared with the skeleton so the loading frame
 * pans the same way. Above the blocks (which have no z-index) and the now-line
 * (z-5), with a hairline down its right edge where the columns pass under it.
 * This one is the corner above the hours.
 */
export const STICKY_GUTTER =
  "bg-surface sticky left-0 z-[6] shadow-[inset_-1px_0_0_var(--hair-soft)]";

/**
 * The hours' half of the gutter: the same, plus the dates' bottom rule along
 * its top. That rule is the header row's outer shadow, so it lands on the first
 * pixel of the body, and an opaque gutter sitting over it cut the line short at
 * the gutter's right edge. Drawing it here carries it across to the card edge.
 */
export const STICKY_HOURS =
  "bg-surface sticky left-0 z-[6] shadow-[inset_-1px_0_0_var(--hair-soft),inset_0_1px_0_var(--hair)]";

/**
 * The box around the week's scroller, which draws the card's ring *over* it.
 *
 * The ring is an inset shadow, and an inset shadow paints under the box's own
 * children. The opaque sticky gutter covered it down the whole left side and
 * round both left corners, and a block panned to either edge covered it too.
 * As a pseudo-element above everything in the scroller (the gutter is z-6), it
 * stays a whole, rounded edge whatever slides beneath it. It cannot live inside
 * the scroller: an absolute child there scrolls away with the columns.
 * `isolate` keeps that z-7 local to the card. Pointer-transparent, so it takes
 * nothing from the cells or the scrollbar under it.
 */
export const CARD_FRAME =
  "relative isolate rounded-[var(--radius-card)] after:pointer-events-none after:absolute after:inset-0 after:z-[7] after:rounded-[inherit] after:shadow-[var(--ring)]";

/**
 * Where an hour label sits against its rule. Centred on it, except the first
 * and the last: the scroller clips its box on both axes, so a centred first
 * label was half under the dates' hairline and the last was cut by the card's
 * bottom edge. Those two sit just inside instead; nothing else moves.
 */
export function hourNudge(hour: number, startHour: number, endHour: number) {
  if (hour === startHour) return "translate-y-0.5";
  if (hour === endHour) return "-translate-y-[calc(100%+2px)]";
  return "-translate-y-1/2";
}

/** The whole hours the window spans, for the rules and the gutter labels. */
export function hoursIn(startHour: number, endHour: number): number[] {
  return Array.from(
    { length: endHour - startHour + 1 },
    (_, i) => startHour + i,
  );
}
