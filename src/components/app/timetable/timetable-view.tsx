"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  BookingDrawer,
  type BookingSpan,
} from "~/components/app/booking/booking-drawer";
import { PageHeader } from "~/components/app/shell/page-header";
import { Dialog } from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import {
  addDays,
  decimalHour,
  localTimeOnDay,
  startOfLocalDay,
} from "~/lib/dates";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { api } from "~/trpc/react";
import {
  TimetableGrid,
  type GridEvent,
  type GridRange,
} from "./timetable-grid";

import type { RouterOutputs } from "~/trpc/react";

type GridData = RouterOutputs["timetable"]["grid"];

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function TimetableView({
  initialDate,
  initial,
  permissions,
}: {
  initialDate: string;
  initial: GridData;
  permissions: string;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const [date, setDate] = useState(() => new Date(initialDate));
  const [buildingId, setBuildingId] = useState<string | undefined>();
  // The span dragged out of the grid, held here so the grid can keep drawing it
  // while the drawer nudges it around.
  const [span, setSpan] = useState<BookingSpan | null>(null);
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(
    null,
  );
  // A move landed on a repeating event, so how far it should reach is a
  // question only the person dragging can answer.
  const [pendingMove, setPendingMove] = useState<{
    event: GridEvent;
    target: GridRange;
  } | null>(null);

  const bits = new PermissionBitField(BigInt(permissions));
  const canBook = bits.has(PermissionFlags.BookRoom);
  const isSelfServe = !bits.has(PermissionFlags.ManageAllEvents);
  const canMoveEvents = bits.hasAny(
    PermissionFlags.ManageAllEvents,
    PermissionFlags.ManageOwnEvents,
  );

  const { data } = api.timetable.grid.useQuery(
    { date, buildingId },
    {
      initialData:
        date.toISOString() === initialDate && !buildingId ? initial : undefined,
      // Other people book rooms too; pick their changes up without polling hard.
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
      placeholderData: (previous) => previous,
    },
  );

  const timeZone = data?.timeZone ?? "Asia/Kolkata";
  const settings = data?.settings;
  const dayStartMinutes = settings?.dayStartMinutes ?? 480;
  const dayEndMinutes = settings?.dayEndMinutes ?? 1080;
  const startHour = dayStartMinutes / 60;
  const endHour = dayEndMinutes / 60;

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

  const today = startOfLocalDay(new Date(), timeZone);
  const isToday = startOfLocalDay(date, timeZone).getTime() === today.getTime();

  // Monday-anchored week around the selected day.
  const weekStart = startOfLocalDay(date, timeZone);
  const weekdayIndex = (weekStart.getDay() + 6) % 7;
  const monday = addDays(weekStart, -weekdayIndex, timeZone);
  const weekDays = DAY_NAMES.slice(0, 5).map((label, i) => ({
    value: addDays(monday, i, timeZone).toISOString(),
    label,
  }));

  const buildings = new Map(
    (data?.rooms ?? []).map((r) => [r.building.id, r.building.name]),
  );

  // The drawer works in instants; the grid works in decimal local hours. The
  // end is measured from the start rather than read off the clock, so a span
  // that runs to midnight does not come back as hour zero.
  const selection: GridRange | null = span && {
    roomId: span.roomId,
    startHour: decimalHour(span.start, timeZone),
    endHour:
      decimalHour(span.start, timeZone) +
      (span.end.getTime() - span.start.getTime()) / 3_600_000,
  };

  const takeRange = (range: GridRange) =>
    setSpan({
      roomId: range.roomId,
      start: localTimeOnDay(date, Math.round(range.startHour * 60), timeZone),
      end: localTimeOnDay(date, Math.round(range.endHour * 60), timeZone),
    });

  const move = api.events.update.useMutation({
    onSuccess: async () => {
      setFlash({ text: "Moved" });
      await utils.timetable.invalidate();
      router.refresh();
    },
    // The server re-checks the slot, so a clash lands here rather than silently
    // leaving the block where it was dropped.
    onError: (error) => setFlash({ text: error.message, bad: true }),
  });

  const applyMove = (
    event: GridEvent,
    target: GridRange,
    scope: "occurrence" | "following" | "series",
  ) =>
    move.mutate({
      id: event.eventId,
      scope,
      originalStart: event.originalStart,
      patch: {
        roomId: target.roomId,
        startTime: localTimeOnDay(
          date,
          Math.round(target.startHour * 60),
          timeZone,
        ),
        endTime: localTimeOnDay(
          date,
          Math.round(target.endHour * 60),
          timeZone,
        ),
      },
    });

  const takeMove = (event: GridEvent, target: GridRange) => {
    if (event.isRecurring) setPendingMove({ event, target });
    else applyMove(event, target, "series");
  };

  return (
    // The booking panel is a column beside the page, not a sheet over it: the
    // grid narrows to make room and stays draggable while a booking is drafted.
    <div className="flex min-h-screen items-start">
      <div className="min-w-0 flex-1">
        <PageHeader
          title="Timetable"
          subtitle={`${data?.rooms.length ?? 0} rooms · ${events.length} scheduled`}
        />
        <div className="px-9 pt-2 pb-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Segmented
              items={weekDays}
              value={startOfLocalDay(date, timeZone).toISOString()}
              onChange={(value) => {
                setDate(new Date(value));
                setSpan(null);
              }}
            />
            <div className="flex items-center gap-3">
              <select
                value={buildingId ?? ""}
                onChange={(e) => {
                  setBuildingId(e.target.value || undefined);
                  setSpan(null);
                }}
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

          {data && data.rooms.length > 0 ? (
            <TimetableGrid
              rooms={data.rooms.map((r) => ({ id: r.id, code: r.code }))}
              events={events}
              timeZone={timeZone}
              startHour={startHour}
              endHour={endHour}
              showNowLine={isToday}
              onRangeSelect={canBook ? takeRange : undefined}
              onEventMove={canMoveEvents ? takeMove : undefined}
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
            {canBook
              ? "Drag down a room's column to book it, in 15-minute steps. Either edge of the block moves it, and the middle drags the whole thing."
              : "Each block is a scheduled class or booking."}
            {canMoveEvents &&
              " Booked blocks can be dragged to another time or room."}
          </p>
        </div>
      </div>

      {span && data && (
        <BookingDrawer
          span={span}
          rooms={data.rooms}
          timeZone={timeZone}
          dayStartMinutes={dayStartMinutes}
          dayEndMinutes={dayEndMinutes}
          isSelfServe={isSelfServe}
          onChange={setSpan}
          onClose={() => setSpan(null)}
          onBooked={async (message) => {
            setSpan(null);
            setFlash({ text: message });
            await utils.timetable.invalidate();
            router.refresh();
          }}
        />
      )}

      {pendingMove && (
        <Dialog
          open
          icon="calendar"
          title="This is a repeating event"
          width={430}
          onClose={() => setPendingMove(null)}
        >
          <p className="text-muted mb-4 text-[13.5px]">
            {pendingMove.event.title} repeats. Which of it should move?
          </p>
          <div className="flex flex-col gap-2">
            {(
              [
                ["occurrence", "Only this one"],
                ["following", "This one and the ones after it"],
                ["series", "Every one of them"],
              ] as const
            ).map(([scope, label]) => (
              <button
                key={scope}
                type="button"
                onClick={() => {
                  applyMove(pendingMove.event, pendingMove.target, scope);
                  setPendingMove(null);
                }}
                className="bg-surface text-title cursor-pointer rounded-[10px] px-3.5 py-2.5 text-left text-[13.5px] font-semibold"
                style={{ boxShadow: "var(--ring)" }}
              >
                {label}
              </button>
            ))}
          </div>
        </Dialog>
      )}

      {flash && (
        <div
          className="plr-toast fixed right-8 bottom-8 z-40 flex items-center gap-2.5 rounded-xl px-4 py-3"
          style={{
            background: "var(--surface)",
            boxShadow: "var(--ring), var(--shadow-float)",
          }}
        >
          <Icon
            name={flash.bad ? "alert" : "checkCircle"}
            size={18}
            color={flash.bad ? "var(--red)" : "#4e7d3a"}
            stroke={2}
          />
          <span className="text-title max-w-[320px] text-[13.5px] font-semibold">
            {flash.text}
          </span>
          <button
            type="button"
            onClick={() => setFlash(null)}
            aria-label="Dismiss"
            className="ml-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg"
          >
            <Icon name="x" size={13} color="var(--muted)" />
          </button>
        </div>
      )}
    </div>
  );
}
