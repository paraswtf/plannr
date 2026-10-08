import { Skeleton } from "~/components/ui/skeleton";
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
      // The ring over the cells, as the grid draws it, so a paper lead-in day
      // does not cover the card's edge.
      className="bg-surface relative overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[var(--ring)]"
    >
      <div className="grid grid-cols-7 shadow-[0_1px_0_var(--hair)]">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className="text-muted py-2 text-center text-xs font-semibold"
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
              className={`relative ${cell.inMonth ? "" : "bg-paper"}`}
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
                {/*
                 * In the same row the grid wraps its date in. Straight in the
                 * column, the badge stretched to the cell's width, so the
                 * numbers sat centred and today was a full-width slate bar
                 * that jumped to a disc when the classes landed.
                 */}
                <div className="flex shrink-0 items-center justify-between">
                  <span
                    className={`font-display flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-xs font-semibold ${
                      cell.isToday
                        ? "bg-slate text-white"
                        : cell.inMonth
                          ? "text-title"
                          : "text-faint"
                    }`}
                  >
                    {toWallTime(cell.day, timeZone).day}
                  </span>
                </div>

                {Array.from(
                  { length: CHIPS[isoWeekday(cell.day, timeZone) - 1] ?? 0 },
                  (_, i) => (
                    // The chip's 20px slot, painted the way the grid paints
                    // it: the whole slot from `sm`, a 6px bar below.
                    <div
                      key={i}
                      className="flex h-5 shrink-0 items-center"
                      style={{
                        // Uneven widths, so the column does not read as a bar
                        // chart of something.
                        width: `${72 + ((i * 37) % 25)}%`,
                      }}
                    >
                      <Skeleton className="h-full w-full max-sm:h-1.5 max-sm:rounded-full" />
                    </div>
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
