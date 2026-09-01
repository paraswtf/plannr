import { isoWeekday, toWallTime } from "~/lib/dates";
import { MONTH_ROW_HEIGHT, type MonthCell } from "./month-layout";
import type { DayCalendarEvent } from "./day-calendar";

/**
 * The month while it is still being fetched.
 *
 * Almost all of a month grid is knowable without the answer — which days it
 * runs from, which of them belong to the month, which one is today — so all of
 * that is drawn for real and only the chips are shapes. Its height is `weeks ×
 * MONTH_ROW_HEIGHT`, which needs no data at all, so this cannot jump when the
 * classes land.
 */

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** How many placeholder chips a weekday cell gets, by column. Weekends: none. */
const CHIPS = [2, 1, 3, 2, 1, 0, 0];

export function MonthSkeleton({
  weeks,
  timeZone,
}: {
  weeks: Array<Array<MonthCell<DayCalendarEvent>>>;
  timeZone: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading this month"
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
            <span className="sm:hidden">{name.slice(0, 2)}</span>
            <span className="hidden sm:inline">{name}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {weeks.flatMap((week, row) =>
          week.map((cell, column) => (
            <div
              key={cell.day.toISOString()}
              className="relative"
              style={{
                height: MONTH_ROW_HEIGHT,
                boxShadow: [
                  row === 0 ? null : "inset 0 1px 0 var(--hair-soft)",
                  column === 0 ? null : "inset 1px 0 0 var(--hair-soft)",
                ]
                  .filter(Boolean)
                  .join(", "),
              }}
            >
              <div className="flex h-full flex-col gap-[3px] p-1.5">
                <span
                  className={`font-display flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[11.5px] font-bold ${
                    cell.isToday
                      ? "text-white"
                      : cell.inMonth
                        ? "text-title"
                        : "text-faint"
                  }`}
                  style={
                    cell.isToday ? { background: "var(--slate)" } : undefined
                  }
                >
                  {toWallTime(cell.day, timeZone).day}
                </span>

                {Array.from(
                  { length: CHIPS[isoWeekday(cell.day, timeZone) - 1] ?? 0 },
                  (_, i) => (
                    <div
                      key={i}
                      className="h-5 shrink-0 animate-pulse rounded-[6px] motion-reduce:animate-none"
                      style={{
                        background: "rgba(68,88,121,0.07)",
                        boxShadow: "inset 0 0 0 1px var(--card-ring)",
                        // Uneven widths, so the column does not read as a bar
                        // chart of something.
                        width: `${72 + ((i * 37) % 25)}%`,
                      }}
                    />
                  ),
                )}
              </div>
            </div>
          )),
        )}
      </div>
    </div>
  );
}
