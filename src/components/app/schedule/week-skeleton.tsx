import { Skeleton } from "~/components/ui/skeleton";
import { formatHourLabel, isSameLocalDay, toWallTime } from "~/lib/dates";
import { GUTTER, ROW_HEIGHT } from "./day-layout";
import {
  CARD_FRAME,
  hourNudge,
  hoursIn,
  STICKY_GUTTER,
  STICKY_HOURS,
} from "./week-calendar";

/**
 * The week while it is still being fetched.
 *
 * The same argument as `DaySkeleton`: a previous week's classes drawn under a
 * new week's dates cannot be told apart from a real answer. The frame is drawn
 * for real — the dates come from the clock and the timezone, not from the
 * response, and so does which column is today — and only the classes are shapes.
 */

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Where the placeholder blocks sit in each weekday column, as fractions of the
 * window. Fixed rather than random, so a re-render during loading does not
 * reshuffle them, and different per column so the week does not read as a grid
 * of identical tiles.
 */
const BLOCKS: Array<Array<{ at: number; span: number }>> = [
  [
    { at: 0.08, span: 0.13 },
    { at: 0.42, span: 0.1 },
  ],
  [{ at: 0.24, span: 0.16 }],
  [
    { at: 0.1, span: 0.11 },
    { at: 0.55, span: 0.14 },
  ],
  [{ at: 0.36, span: 0.12 }],
  [
    { at: 0.14, span: 0.15 },
    { at: 0.62, span: 0.09 },
  ],
];

const GEOMETRY =
  "[--sched-day-w:118px] sm:[--sched-day-w:132px] lg:[--sched-day-w:140px]";

export function WeekSkeleton({
  days,
  timeZone,
  now,
  startHour = 8,
  endHour = 18,
  rowHeight = ROW_HEIGHT,
}: {
  days: Date[];
  timeZone: string;
  now: Date;
  startHour?: number;
  endHour?: number;
  rowHeight?: number;
}) {
  const span = Math.max(1, endHour - startHour);
  const height = span * rowHeight;

  // Framed as the calendar is, so the gutter does not cover the card's ring.
  return (
    <div className={CARD_FRAME}>
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading this week"
        className={`plr-scroll bg-surface overflow-x-auto rounded-[var(--radius-card)] shadow-[var(--shadow-card)] ${GEOMETRY}`}
      >
        <div style={{ minWidth: `calc(${GUTTER}px + 7 * var(--sched-day-w))` }}>
          <div className="flex shadow-[0_1px_0_var(--hair)]">
            <div
              className={`shrink-0 ${STICKY_GUTTER}`}
              style={{ width: GUTTER }}
            />
            {days.map((day, index) => {
              const isToday = isSameLocalDay(day, now, timeZone);
              return (
                <div
                  key={day.toISOString()}
                  className="flex flex-1 items-center justify-center gap-1.5 px-1 py-2"
                  style={{ minWidth: "var(--sched-day-w)" }}
                >
                  <span className="text-muted text-xs font-semibold">
                    {DAY_NAMES[index]}
                  </span>
                  <span
                    className={`font-display flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ${
                      isToday ? "bg-slate text-white" : "text-title"
                    }`}
                  >
                    {toWallTime(day, timeZone).day}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="relative flex" style={{ height }}>
            {/* Sticky as the calendar's is, so the frame pans the same way. */}
            <div
              className={`relative shrink-0 ${STICKY_HOURS}`}
              style={{ width: GUTTER }}
            >
              {hoursIn(startHour, endHour).map((hour) => (
                <span
                  key={hour}
                  className={`text-faint absolute right-3 font-mono text-[11px] ${hourNudge(hour, startHour, endHour)}`}
                  style={{ top: (hour - startHour) * rowHeight }}
                >
                  {formatHourLabel(
                    new Date(Date.UTC(2000, 0, 1, hour, 0)),
                    "UTC",
                  )}
                </span>
              ))}
            </div>

            {days.map((day, index) => (
              <div
                key={day.toISOString()}
                className="relative flex-1"
                style={{
                  minWidth: "var(--sched-day-w)",
                  boxShadow: "inset 1px 0 0 var(--hair-soft)",
                }}
              >
                {/* The calendar's rules, half hours included, so the frame
                  is the same frame. */}
                {hoursIn(startHour, endHour).map((hour) => (
                  <div key={hour}>
                    <div
                      className="absolute w-full"
                      style={{
                        top: (hour - startHour) * rowHeight,
                        boxShadow: "inset 0 1px 0 var(--hair-soft)",
                        height: 1,
                      }}
                    />
                    {hour < endHour && (
                      <div
                        className="absolute w-full"
                        style={{
                          top: (hour - startHour + 0.5) * rowHeight,
                          boxShadow: "inset 0 1px 0 var(--tint-hover)",
                          height: 1,
                        }}
                      />
                    )}
                  </div>
                ))}
                {/* Weekends are left empty: they usually are, and shapes on them
                  would promise a busier week than the answer is likely to be. */}
                {(BLOCKS[index] ?? []).map((block) => (
                  // An opaque base under the shared pulse, so the rules do not
                  // show through a shape that is standing in for a solid block.
                  <div
                    key={block.at}
                    className="bg-surface absolute overflow-hidden rounded-lg"
                    style={{
                      top: block.at * height + 2,
                      height: block.span * height - 4,
                      left: 2,
                      right: 2,
                    }}
                  >
                    <Skeleton className="h-full w-full" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
