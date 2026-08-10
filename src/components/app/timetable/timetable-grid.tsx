"use client";

import { useMemo } from "react";

import { decimalHour, formatHourLabel } from "~/lib/dates";
import { useNow } from "./use-now";

/**
 * Rooms × time grid.
 *
 * A CSS grid provides the column structure; event blocks are absolutely
 * positioned inside their column so a booking's height encodes its duration.
 * All arithmetic is in decimal local hours (9.5 = 09:30), which is the unit the
 * whole screen thinks in.
 */

export interface GridRoom {
  id: string;
  code: string;
}

export interface GridEvent {
  occurrenceId: string;
  roomId: string;
  start: Date;
  end: Date;
  title: string;
  subtitle?: string | null;
  isRecurring?: boolean;
}

interface TimetableGridProps {
  rooms: GridRoom[];
  events: GridEvent[];
  timeZone: string;
  /** Working window in decimal local hours. */
  startHour: number;
  endHour: number;
  /** Pixel height of one hour. */
  rowHeight?: number;
  /** Show the now-line when the grid is displaying today. */
  showNowLine?: boolean;
  onEventClick?: (event: GridEvent) => void;
  onSlotClick?: (roomId: string, hour: number) => void;
  /** Booking granularity in minutes; empty-slot clicks snap to it. */
  slotMinutes?: number;
}

const GUTTER = 62;
const MIN_COLUMN = 118;

export function TimetableGrid({
  rooms,
  events,
  timeZone,
  startHour,
  endHour,
  rowHeight = 52,
  showNowLine = false,
  onEventClick,
  onSlotClick,
  slotMinutes = 60,
}: TimetableGridProps) {
  const now = useNow(30_000);
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = Math.floor(startHour); h < endHour; h++) out.push(h);
    return out;
  }, [startHour, endHour]);

  const bodyHeight = (endHour - startHour) * rowHeight;

  const byRoom = useMemo(() => {
    const map = new Map<string, GridEvent[]>();
    for (const event of events) {
      const list = map.get(event.roomId);
      if (list) list.push(event);
      else map.set(event.roomId, [event]);
    }
    return map;
  }, [events]);

  const nowHour = decimalHour(now, timeZone);
  const nowVisible = showNowLine && nowHour >= startHour && nowHour <= endHour;

  const gridTemplate = `${GUTTER}px repeat(${rooms.length}, minmax(${MIN_COLUMN}px, 1fr))`;

  return (
    <div
      className="plr-scroll overflow-x-auto rounded-[var(--radius-card)] bg-[var(--surface)]"
      style={{ boxShadow: "var(--ring), var(--shadow-card)" }}
    >
      <div style={{ minWidth: GUTTER + rooms.length * MIN_COLUMN }}>
        {/* Room headers */}
        <div
          className="sticky top-0 z-10 grid bg-[var(--surface)]"
          style={{
            gridTemplateColumns: gridTemplate,
            boxShadow: "0 1px 0 var(--hair)",
          }}
        >
          <div />
          {rooms.map((room) => (
            <div
              key={room.id}
              className="px-2 py-3 text-center font-[family-name:var(--font-display)] text-[13px] font-bold text-[var(--app-title)]"
            >
              {room.code}
            </div>
          ))}
        </div>

        {/* Body */}
        <div
          className="relative grid"
          style={{ gridTemplateColumns: gridTemplate, height: bodyHeight }}
        >
          {/* Hour gutter */}
          <div className="relative">
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 -translate-y-1/2 font-[family-name:var(--font-mono)] text-[11px] text-[var(--faint)]"
                style={{ top: (hour - startHour) * rowHeight }}
              >
                {formatHourLabel(
                  new Date(Date.UTC(2000, 0, 1, hour, 0)),
                  "UTC",
                )}
              </div>
            ))}
          </div>

          {rooms.map((room) => (
            <div
              key={room.id}
              className="relative"
              style={{ boxShadow: "inset 1px 0 0 var(--hair-soft)" }}
            >
              {/* Hour lines, and the click target for booking an empty slot */}
              {hours.map((hour) => (
                <div
                  key={hour}
                  className={onSlotClick ? "plr-slotcol absolute w-full cursor-pointer" : "absolute w-full"}
                  style={{
                    top: (hour - startHour) * rowHeight,
                    height: rowHeight,
                    boxShadow: "inset 0 1px 0 var(--hair-soft)",
                  }}
                  onClick={
                    onSlotClick
                      ? (e) => {
                          // Offset within the hour cell, snapped to granularity.
                          const bounds = e.currentTarget.getBoundingClientRect();
                          const withinHour =
                            (e.clientY - bounds.top) / rowHeight;
                          const step = slotMinutes / 60;
                          const snapped =
                            hour + Math.floor(withinHour / step) * step;
                          onSlotClick(room.id, snapped);
                        }
                      : undefined
                  }
                />
              ))}

              {(byRoom.get(room.id) ?? []).map((event) => {
                const from = decimalHour(event.start, timeZone);
                const to = decimalHour(event.end, timeZone);
                const live = event.start <= now && now < event.end;
                return (
                  <button
                    key={event.occurrenceId}
                    type="button"
                    onClick={() => onEventClick?.(event)}
                    className="plr-clip absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1.5 text-left"
                    style={{
                      top: (from - startHour) * rowHeight + 2,
                      height: Math.max(
                        22,
                        (to - from) * rowHeight - 4,
                      ),
                      background: live
                        ? "rgba(220,56,72,0.10)"
                        : "var(--card-soft)",
                      boxShadow: live
                        ? "inset 0 0 0 1px var(--red)"
                        : "inset 0 0 0 1px var(--card-ring)",
                      cursor: onEventClick ? "pointer" : "default",
                    }}
                  >
                    <span className="block truncate text-[12px] leading-tight font-semibold text-[var(--app-title)]">
                      {event.title}
                    </span>
                    {event.subtitle && (to - from) >= 0.75 && (
                      <span className="block truncate text-[11px] text-[var(--muted)]">
                        {event.subtitle}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {nowVisible && (
            <div
              className="pointer-events-none absolute right-0 z-[5] flex items-center"
              style={{
                left: GUTTER,
                top: (nowHour - startHour) * rowHeight,
              }}
            >
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: "var(--red)", marginLeft: -3.5 }}
              />
              <span
                className="h-[2px] flex-1"
                style={{ background: "var(--red)" }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
