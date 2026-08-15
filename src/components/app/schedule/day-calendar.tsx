"use client";

import { useEffect, useRef } from "react";

import { decimalHour, formatHourLabel } from "~/lib/dates";
import { dayWindow, packOverlaps } from "./day-layout";

/**
 * One day, drawn down the page.
 *
 * The same arithmetic as the rooms grid — decimal local hours against a fixed
 * pixel height per hour — with a single column instead of one per room, so a
 * lecture's height is how long it lasts and the gaps between them are the gaps
 * in the day. A red line marks the present, which is the one thing a student
 * opening this screen is really asking about.
 */

export interface DayCalendarEvent {
  id: string;
  start: Date;
  end: Date;
  title: string;
  roomCode?: string | null;
  /** Whatever the viewer's perspective wants said about it, most useful first. */
  lines?: string[];
}

const GUTTER = 58;
/** Enough for a title even on a fifteen-minute sitting. */
const MIN_BLOCK = 26;
const PADDING = 16;
const TITLE_LINE = 17;
const SMALL_LINE = 15;

export function DayCalendar({
  events,
  timeZone,
  now,
  /** Whether the day on screen is the one the clock is in. */
  isToday = true,
  rowHeight = 84,
  onEventClick,
}: {
  events: DayCalendarEvent[];
  timeZone: string;
  now: Date;
  isToday?: boolean;
  rowHeight?: number;
  onEventClick?: (event: DayCalendarEvent) => void;
}) {
  const nowRef = useRef<HTMLDivElement>(null);

  const { startHour, endHour } = dayWindow(events, isToday ? now : null, timeZone);
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const height = (endHour - startHour) * rowHeight;

  const nowHour = decimalHour(now, timeZone);
  const showNow = isToday && nowHour >= startHour && nowHour <= endHour;

  // Bring the present into view on arrival, but only when it is not already
  // there — nobody wants the page to jump under them for no reason.
  useEffect(() => {
    const line = nowRef.current;
    if (!line) return;
    const box = line.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight) {
      line.scrollIntoView({ block: "center" });
    }
    // Only on arrival: re-running this every tick would fight the scrollbar.
  }, []);

  return (
    <div className="relative" style={{ height }}>
      {/* Hour labels and the lines they name */}
      {hours.map((hour) => (
        <div key={hour}>
          <div
            className="text-faint absolute -translate-y-1/2 font-mono text-[11px]"
            style={{ top: (hour - startHour) * rowHeight, left: 0, width: GUTTER - 12 }}
          >
            <span className="block text-right">
              {formatHourLabel(new Date(Date.UTC(2000, 0, 1, hour, 0)), "UTC")}
            </span>
          </div>
          <div
            className="absolute right-0"
            style={{
              top: (hour - startHour) * rowHeight,
              left: GUTTER,
              boxShadow: "inset 0 1px 0 var(--hair-soft)",
              height: 1,
            }}
          />
          {hour < endHour && (
            <div
              className="absolute right-0"
              style={{
                top: (hour - startHour + 0.5) * rowHeight,
                left: GUTTER,
                boxShadow: "inset 0 1px 0 rgba(68,88,121,0.05)",
                height: 1,
              }}
            />
          )}
        </div>
      ))}

      {packOverlaps(events).map(({ event, column, columns }) => {
        const from = decimalHour(event.start, timeZone);
        const to = decimalHour(event.end, timeZone) || 24;
        const live = event.start <= now && now < event.end;
        const past = event.end <= now;
        const span = to - from;

        const when = `${formatHourLabel(event.start, timeZone)} – ${formatHourLabel(event.end, timeZone)}`;
        const room = [when, event.roomCode].filter(Boolean).join(" · ");

        // As much as the block can actually hold, worked out from its height
        // rather than guessed at: a short lecture spilling its text over the one
        // below reads far worse than one that says less.
        const boxHeight = Math.max(MIN_BLOCK, span * rowHeight - 4);
        const spare = boxHeight - PADDING - TITLE_LINE - (span >= 0.5 ? SMALL_LINE : 0);
        const lines = (event.lines ?? []).slice(
          0,
          Math.max(0, Math.floor(spare / SMALL_LINE)),
        );

        return (
          <button
            key={event.id}
            type="button"
            onClick={onEventClick ? () => onEventClick(event) : undefined}
            className="plr-clip absolute overflow-hidden rounded-xl px-3 py-2 text-left"
            style={{
              top: (from - startHour) * rowHeight + 2,
              height: boxHeight,
              left: `calc(${GUTTER}px + ${(column / columns) * 100}% - ${(GUTTER * column) / columns}px)`,
              width: `calc(${(1 / columns) * 100}% - ${GUTTER / columns}px - 4px)`,
              background: live ? "rgba(220,56,72,0.10)" : "var(--card-soft)",
              boxShadow: live
                ? "inset 0 0 0 1px var(--red)"
                : "inset 0 0 0 1px var(--card-ring)",
              opacity: past && !live ? 0.62 : 1,
              cursor: onEventClick ? "pointer" : "default",
            }}
          >
            <span className="text-title block truncate text-[13px] leading-tight font-semibold">
              {event.title}
            </span>
            {span >= 0.5 && (
              <span className="text-muted mt-0.5 block truncate font-mono text-[11px]">
                {room}
              </span>
            )}
            {lines.map((line) => (
              <span
                key={line}
                className="text-faint mt-0.5 block truncate text-[11px]"
              >
                {line}
              </span>
            ))}
          </button>
        );
      })}

      {showNow && (
        <div
          ref={nowRef}
          className="pointer-events-none absolute right-0 z-[5] flex items-center"
          style={{ left: 0, top: (nowHour - startHour) * rowHeight }}
        >
          <span
            className="font-mono text-[11px] font-semibold"
            style={{ color: "var(--red)", width: GUTTER - 12, textAlign: "right" }}
          >
            {formatHourLabel(now, timeZone)}
          </span>
          <span
            className="ml-[6px] h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ background: "var(--red)" }}
          />
          <span className="h-[2px] flex-1" style={{ background: "var(--red)" }} />
        </div>
      )}
    </div>
  );
}
