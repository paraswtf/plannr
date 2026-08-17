"use client";

import { useMemo } from "react";

import { formatSlot, WEEKDAY_SHORT } from "~/lib/schedule-plan";

/**
 * The proposed week, days across and time down.
 *
 * Deliberately not the room-by-room grid the live timetable uses: a plan is
 * read as "what does this group's week look like", and rooms are an outcome of
 * it rather than its axis. Sessions are absolutely positioned inside their day
 * column so a block's height is its length, and overlapping blocks — which a
 * filtered view will show, since two groups genuinely do sit at 9am on Monday —
 * share the column width between them.
 */

export interface PlanGridSession {
  id: string;
  title: string;
  groupLabel: string;
  roomCode: string | null;
  facultyNames: string[];
  dayOfWeek: number | null;
  startMinutes: number | null;
  durationMinutes: number;
  pinned: boolean;
  commentCount: number;
}

interface PlanWeekGridProps {
  sessions: PlanGridSession[];
  workingDays: number[];
  dayStartMinutes: number;
  dayEndMinutes: number;
  /** Pixel height of one hour. */
  rowHeight?: number;
  selectedId?: string | null;
  onSelect?: (session: PlanGridSession) => void;
  /** Drawn behind the sessions: what the live timetable already has. */
  busy?: Array<{
    dayOfWeek: number;
    startMinutes: number;
    endMinutes: number;
    label: string;
  }>;
}

const GUTTER = 58;

/**
 * Lays overlapping blocks out side by side.
 *
 * Sessions are swept in start order; a block joins the first lane whose last
 * occupant has finished. The lane count is per *cluster* of mutually
 * overlapping blocks, so one busy hour does not narrow the whole day.
 */
function packColumns(sessions: PlanGridSession[]): Array<{
  session: PlanGridSession;
  lane: number;
  lanes: number;
}> {
  const sorted = [...sessions].sort(
    (a, b) =>
      (a.startMinutes ?? 0) - (b.startMinutes ?? 0) ||
      a.title.localeCompare(b.title),
  );

  const out: Array<{ session: PlanGridSession; lane: number; lanes: number }> =
    [];
  let cluster: typeof out = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  const closeCluster = () => {
    for (const item of cluster) item.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };

  for (const session of sorted) {
    const start = session.startMinutes ?? 0;
    const end = start + session.durationMinutes;
    if (start >= clusterEnd && cluster.length > 0) closeCluster();

    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }

    cluster.push({ session, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length > 0) closeCluster();

  return out;
}

export function PlanWeekGrid({
  sessions,
  workingDays,
  dayStartMinutes,
  dayEndMinutes,
  rowHeight = 62,
  selectedId,
  onSelect,
  busy = [],
}: PlanWeekGridProps) {
  const days = useMemo(
    () => [...workingDays].sort((a, b) => a - b),
    [workingDays],
  );

  const hours = useMemo(() => {
    const out: number[] = [];
    for (
      let minute = Math.floor(dayStartMinutes / 60) * 60;
      minute < dayEndMinutes;
      minute += 60
    ) {
      out.push(minute);
    }
    return out;
  }, [dayStartMinutes, dayEndMinutes]);

  const spanMinutes = Math.max(60, dayEndMinutes - dayStartMinutes);
  const bodyHeight = (spanMinutes / 60) * rowHeight;
  const top = (minutes: number) =>
    ((minutes - dayStartMinutes) / 60) * rowHeight;

  const byDay = useMemo(() => {
    const map = new Map<number, PlanGridSession[]>();
    for (const session of sessions) {
      if (session.dayOfWeek === null || session.startMinutes === null) continue;
      const list = map.get(session.dayOfWeek);
      if (list) list.push(session);
      else map.set(session.dayOfWeek, [session]);
    }
    return map;
  }, [sessions]);

  return (
    // A working week is wider than a phone whatever is done to it, so the grid
    // scrolls inside its own card and the page never moves. How narrow a day
    // may get is a custom property rather than a number here, because it is the
    // one measurement that has to change with the screen — 104px still fits a
    // subject code and a room, and puts three days in view at once.
    <div
      className="bg-surface plr-scroll overflow-x-auto rounded-[var(--radius-card)] [--plan-day-w:104px] sm:[--plan-day-w:126px] lg:[--plan-day-w:150px]"
      style={{ boxShadow: "var(--ring), var(--shadow-card)" }}
    >
      <div
        style={{
          minWidth: `calc(${GUTTER}px + ${days.length} * var(--plan-day-w))`,
        }}
      >
        {/* Day headings */}
        <div
          className="flex"
          style={{ boxShadow: "inset 0 -1px 0 var(--hair)" }}
        >
          <div style={{ width: GUTTER }} />
          {days.map((day) => (
            <div
              key={day}
              className="text-title flex-1 px-2 py-2.5 text-center text-[12.5px] font-bold"
              style={{ boxShadow: "inset 1px 0 0 var(--hair-soft)" }}
            >
              {WEEKDAY_SHORT[day] ?? day}
            </div>
          ))}
        </div>

        <div className="flex" style={{ height: bodyHeight }}>
          {/* Hour gutter */}
          <div className="relative shrink-0" style={{ width: GUTTER }}>
            {hours.map((minute) => (
              <span
                key={minute}
                className="text-faint absolute right-2 font-mono text-[10.5px]"
                style={{ top: top(minute) - 6 }}
              >
                {formatSlot(minute)}
              </span>
            ))}
          </div>

          {days.map((day) => {
            const packed = packColumns(byDay.get(day) ?? []);
            const dayBusy = busy.filter((b) => b.dayOfWeek === day);

            return (
              <div
                key={day}
                className="relative flex-1"
                style={{ boxShadow: "inset 1px 0 0 var(--hair-soft)" }}
              >
                {hours.map((minute) => (
                  <div
                    key={minute}
                    className="absolute right-0 left-0"
                    style={{
                      top: top(minute),
                      height: rowHeight,
                      boxShadow: "inset 0 -1px 0 var(--hair-soft)",
                    }}
                  />
                ))}

                {/* What the live timetable already has, as a hatched ghost. */}
                {dayBusy.map((block, index) => (
                  <div
                    key={`${block.startMinutes}-${index}`}
                    title={`${block.label} — already on the timetable`}
                    className="pointer-events-none absolute right-1 left-1 rounded-md"
                    style={{
                      top: top(block.startMinutes),
                      height: Math.max(
                        10,
                        ((block.endMinutes - block.startMinutes) / 60) *
                          rowHeight -
                          2,
                      ),
                      background:
                        "repeating-linear-gradient(45deg, rgba(68,88,121,0.07) 0 6px, transparent 6px 12px)",
                      boxShadow: "inset 0 0 0 1px rgba(68,88,121,0.12)",
                    }}
                  />
                ))}

                {packed.map(({ session, lane, lanes }) => {
                  const selected = session.id === selectedId;
                  const width = `calc((100% - 8px) / ${lanes})`;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => onSelect?.(session)}
                      title={`${session.title} · ${session.groupLabel}${
                        session.roomCode ? ` · ${session.roomCode}` : ""
                      }`}
                      className="plr-clip absolute overflow-hidden rounded-[8px] px-2 py-1.5 text-left"
                      style={{
                        top: top(session.startMinutes!) + 1,
                        height: Math.max(
                          22,
                          (session.durationMinutes / 60) * rowHeight - 3,
                        ),
                        left: `calc(4px + ${lane} * ${width})`,
                        width,
                        cursor: onSelect ? "pointer" : "default",
                        background: selected
                          ? "var(--slate)"
                          : "color-mix(in srgb, var(--slate) 11%, #fff)",
                        color: selected ? "#fff" : "#324464",
                        boxShadow: selected
                          ? "0 2px 10px rgba(68,88,121,0.32)"
                          : "inset 0 0 0 1px rgba(68,88,121,0.22)",
                      }}
                    >
                      <span className="flex items-center gap-1">
                        {session.pinned && (
                          <span
                            className="inline-block h-[5px] w-[5px] shrink-0 rounded-full"
                            style={{
                              background: selected ? "#fff" : "var(--orange)",
                            }}
                          />
                        )}
                        <span className="truncate text-[11.5px] font-bold">
                          {session.title}
                        </span>
                      </span>
                      <span
                        className="block truncate text-[10.5px]"
                        style={{ opacity: 0.75 }}
                      >
                        {session.groupLabel}
                      </span>
                      {session.roomCode && (
                        <span
                          className="block truncate font-mono text-[10px]"
                          style={{ opacity: 0.7 }}
                        >
                          {session.roomCode}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
