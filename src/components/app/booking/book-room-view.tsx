"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { PageHeader } from "~/components/app/shell/page-header";
import {
  TimetableGrid,
  type GridEvent,
  type GridRange,
} from "~/components/app/timetable/timetable-grid";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import {
  addDays,
  decimalHour,
  localTimeOnDay,
  minutesOfDay,
  SNAP_MINUTES,
  startOfLocalDay,
} from "~/lib/dates";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { api, type RouterOutputs } from "~/trpc/react";
import { BookingDrawer, type BookingSpan } from "./booking-drawer";

type GridData = RouterOutputs["timetable"]["grid"];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/**
 * Book a room.
 *
 * The same rooms × time calendar as the Timetable screen, with one difference:
 * the booking panel is docked open permanently instead of appearing on a drag.
 * Booking is the whole point of this screen, so there is nothing sensible to
 * dismiss the panel to. A slot is chosen by sweeping the grid or by nudging the
 * times in the panel, and whichever you do, the grid draws it.
 */
export function BookRoomView({
  initial,
  permissions,
  preselectedRoomId,
}: {
  initial: GridData;
  permissions: string;
  preselectedRoomId?: string;
}) {
  const router = useRouter();
  const utils = api.useUtils();

  // Someone who can schedule for others gets the class/faculty fields;
  // everyone else is booking for themselves.
  const bits = new PermissionBitField(BigInt(permissions));
  const isSelfServe = !bits.has(PermissionFlags.ManageAllEvents);

  const [day, setDay] = useState(() =>
    startOfLocalDay(new Date(), initial.timeZone),
  );
  const [buildingId, setBuildingId] = useState<string | undefined>();
  // Seeded on the first render rather than in the effect below, so the panel is
  // part of the server-rendered page instead of appearing after hydration.
  const [span, setSpan] = useState<BookingSpan | null>(() => {
    const room =
      (preselectedRoomId
        ? initial.rooms.find((r) => r.id === preselectedRoomId)
        : undefined) ?? initial.rooms[0];
    if (!room) return null;
    return proposeSpan({
      roomId: room.id,
      day: startOfLocalDay(new Date(), initial.timeZone),
      timeZone: initial.timeZone,
      dayStart: initial.settings?.dayStartMinutes ?? 480,
      dayEnd: initial.settings?.dayEndMinutes ?? 1080,
      durationMinutes: initial.settings?.slotMinutes ?? 60,
    });
  });
  const [flash, setFlash] = useState<string | null>(null);

  const { data } = api.timetable.grid.useQuery(
    { date: day, buildingId },
    {
      initialData:
        day.getTime() ===
          startOfLocalDay(new Date(), initial.timeZone).getTime() && !buildingId
          ? initial
          : undefined,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
      placeholderData: (previous) => previous,
    },
  );

  const timeZone = data?.timeZone ?? initial.timeZone;
  const settings = data?.settings;
  const slotMinutes = settings?.slotMinutes ?? 60;
  const dayStart = settings?.dayStartMinutes ?? 480;
  const dayEnd = settings?.dayEndMinutes ?? 1080;
  // Memoised because the span-proposing effect depends on it; a fresh array
  // each render would re-run that effect on every render.
  const rooms = useMemo(() => data?.rooms ?? [], [data?.rooms]);

  // The panel is always up, so it always needs a span. One is proposed once
  // rooms are known, and again whenever the day changes or the chosen room
  // leaves the grid — otherwise the panel would point at a room that is no
  // longer on screen.
  useEffect(() => {
    if (rooms.length === 0) return;

    const roomStillShown = span && rooms.some((r) => r.id === span.roomId);
    const sameDay =
      span && startOfLocalDay(span.start, timeZone).getTime() === day.getTime();
    if (roomStillShown && sameDay) return;

    const preselected =
      preselectedRoomId && rooms.some((r) => r.id === preselectedRoomId)
        ? preselectedRoomId
        : undefined;

    setSpan(
      proposeSpan({
        roomId: preselected ?? (roomStillShown ? span.roomId : rooms[0]!.id),
        day,
        timeZone,
        dayStart,
        dayEnd,
        durationMinutes: slotMinutes,
      }),
    );
  }, [
    rooms,
    day,
    timeZone,
    dayStart,
    dayEnd,
    slotMinutes,
    preselectedRoomId,
    span,
  ]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 5_000);
    return () => clearTimeout(id);
  }, [flash]);

  const events: GridEvent[] = (data?.occurrences ?? []).map((o) => ({
    occurrenceId: o.occurrenceId,
    eventId: o.eventId,
    roomId: o.roomId,
    start: o.start,
    end: o.end,
    originalStart: o.originalStart,
    title: o.title,
    subtitle: o.groupLabel,
    isRecurring: o.isRecurring,
  }));

  const isToday =
    day.getTime() === startOfLocalDay(new Date(), timeZone).getTime();

  const monday = addDays(day, -((day.getDay() + 6) % 7), timeZone);
  const weekDays = DAY_LABELS.map((label, i) => ({
    value: addDays(monday, i, timeZone).toISOString(),
    label,
  }));

  const buildings = new Map(rooms.map((r) => [r.building.id, r.building.name]));

  // The grid works in decimal local hours; the panel works in instants. The end
  // is measured from the start rather than read off the clock, so a span
  // running to midnight does not come back as hour zero.
  const selection: GridRange | null = span && {
    roomId: span.roomId,
    startHour: decimalHour(span.start, timeZone),
    endHour:
      decimalHour(span.start, timeZone) +
      (span.end.getTime() - span.start.getTime()) / 3_600_000,
  };

  return (
    <div className="flex items-start">
      <div className="min-w-0 flex-1">
        <PageHeader
          title="Book a room"
          subtitle="Sweep a slot on the calendar, or set the times on the right"
        />
        <div className="px-9 pt-2 pb-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Segmented
              items={weekDays}
              value={day.toISOString()}
              onChange={(value) => setDay(new Date(value))}
            />
            <div className="flex items-center gap-3">
              <select
                value={buildingId ?? ""}
                onChange={(e) => setBuildingId(e.target.value || undefined)}
                className="bg-surface text-ink rounded-[10px] px-3 py-2 text-[13px] font-medium"
                style={{ boxShadow: "var(--ring)" }}
              >
                <option value="">All buildings</option>
                {[...buildings].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <span className="text-faint font-mono text-[12px]">
                rooms × time
              </span>
            </div>
          </div>

          {rooms.length > 0 ? (
            <TimetableGrid
              rooms={rooms.map((r) => ({ id: r.id, code: r.code }))}
              events={events}
              timeZone={timeZone}
              startHour={dayStart / 60}
              endHour={dayEnd / 60}
              snapMinutes={SNAP_MINUTES}
              showNowLine={isToday}
              onRangeSelect={(range) =>
                setSpan({
                  roomId: range.roomId,
                  start: localTimeOnDay(
                    day,
                    Math.round(range.startHour * 60),
                    timeZone,
                  ),
                  end: localTimeOnDay(
                    day,
                    Math.round(range.endHour * 60),
                    timeZone,
                  ),
                })
              }
              selection={selection}
            />
          ) : (
            <div
              className="bg-surface text-muted rounded-[var(--radius-card)] p-10 text-center text-[14px]"
              style={{ boxShadow: "var(--ring)" }}
            >
              No rooms yet. An admin can add them from the Rooms tab.
            </div>
          )}

          <p className="text-faint mt-3 text-[12.5px]">
            Drag down a room&apos;s column to sweep out a slot — the panel
            follows along.
          </p>
        </div>
      </div>

      {span && (
        <BookingDrawer
          span={span}
          rooms={rooms}
          timeZone={timeZone}
          dayStartMinutes={dayStart}
          dayEndMinutes={dayEnd}
          isSelfServe={isSelfServe}
          onChange={setSpan}
          onBooked={async (message) => {
            setFlash(message);
            await utils.timetable.invalidate();
            router.refresh();
            // Move on to the slot that follows rather than closing: booking a
            // run of periods should not mean starting the form again.
            setSpan((current) =>
              current
                ? proposeSpan({
                    roomId: current.roomId,
                    day,
                    timeZone,
                    dayStart,
                    dayEnd,
                    durationMinutes: Math.round(
                      (current.end.getTime() - current.start.getTime()) /
                        60_000,
                    ),
                    after: current.end,
                  })
                : current,
            );
          }}
        />
      )}

      {flash && (
        <div
          className="plr-toast fixed bottom-8 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 rounded-xl px-4 py-3"
          style={{
            background: "var(--surface)",
            boxShadow: "var(--ring), var(--shadow-float)",
          }}
        >
          <Icon name="checkCircle" size={18} color="#4e7d3a" stroke={2} />
          <span className="text-title text-[13.5px] font-semibold">
            {flash}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * A slot to point the panel at: the next boundary after `after` (or after now,
 * when the day being shown is today), kept inside the working window.
 */
function proposeSpan({
  roomId,
  day,
  timeZone,
  dayStart,
  dayEnd,
  durationMinutes,
  after,
}: {
  roomId: string;
  day: Date;
  timeZone: string;
  dayStart: number;
  dayEnd: number;
  durationMinutes: number;
  after?: Date;
}): BookingSpan {
  const now = new Date();
  const isToday = day.getTime() === startOfLocalDay(now, timeZone).getTime();

  const from = after
    ? minutesOfDay(after, timeZone)
    : isToday
      ? minutesOfDay(now, timeZone)
      : dayStart;

  // Rounded up to a snap boundary so the proposal lands on the grid's lines.
  const snapped =
    Math.ceil(Math.max(from, dayStart) / SNAP_MINUTES) * SNAP_MINUTES;
  const latestStart = Math.max(dayStart, dayEnd - durationMinutes);
  const startMinutes = Math.min(Math.max(snapped, dayStart), latestStart);

  const start = localTimeOnDay(day, startMinutes, timeZone);
  return {
    roomId,
    start,
    end: new Date(start.getTime() + durationMinutes * 60_000),
  };
}
