"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import {
  TimetableGrid,
  type GridEvent,
  type GridRange,
} from "~/components/app/timetable/timetable-grid";
import {
  DayControls,
  DayStrip,
} from "~/components/app/timetable/day-navigator";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Icon } from "~/components/ui/icon";
import { Select } from "~/components/ui/select";
import {
  decimalHour,
  isSameLocalDay,
  localTimeOnDay,
  minutesOfDay,
  SNAP_MINUTES,
  startOfLocalDay,
} from "~/lib/dates";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { api, type RouterOutputs } from "~/trpc/react";
import { BookingDrawer, type BookingSpan } from "./booking-drawer";
import { MyRequests } from "./my-requests";
import { unfitRoomIds } from "./room-fit";
import { useBookingDraft } from "./use-booking-draft";

type GridData = RouterOutputs["timetable"]["grid"];

/**
 * Book a room.
 *
 * The same rooms × time calendar as the Timetable screen, with one difference:
 * the booking panel is docked open permanently instead of appearing on a pick.
 * Booking is the whole point of this screen, so there is nothing sensible to
 * dismiss the panel to. A slot is chosen on the grid or by nudging the times in
 * the panel, and whichever you do, the grid draws it.
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

  const panelRef = useRef<HTMLElement>(null);
  // Counts picks made on the calendar. The panel here is permanent, so there is
  // no opening to watch for — and the span itself changes for reasons the panel
  // caused, which are exactly the ones that must not move the page.
  const [picks, setPicks] = useState(0);

  /**
   * Below `lg` the panel is a screen further down, so a pick on the calendar
   * re-times something the reader cannot see and the tap reads as having done
   * nothing. Take them to it.
   *
   * Gated on the pointer as well as the width, and not because thumbs are
   * bigger: a mouse reports the range live all the way through a drag, so
   * scrolling on each of those reports would pull the grid out from under the
   * cursor mid-sweep. Touch cannot drag this grid at all — every pick it makes
   * is one settled tap — which makes the input device, not the window width,
   * the thing that decides whether this is safe to do.
   */
  useEffect(() => {
    if (picks === 0) return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [picks]);

  // Held here rather than in the panel because the calendar reads it too: the
  // class being booked for is what decides which rooms are too small to offer.
  const draft = useBookingDraft({
    isSelfServe,
    roomId: span?.roomId ?? "",
    start: span?.start ?? null,
    end: span?.end ?? null,
    timeZone,
    room: rooms.find((r) => r.id === span?.roomId),
    onCreated: async (result) => {
      const code = rooms.find((r) => r.id === span?.roomId)?.code ?? "Room";
      setFlash(
        result.event.status === "PENDING"
          ? `${code} requested, waiting for approval`
          : `${code} booked`,
      );
      await utils.timetable.invalidate();
      router.refresh();
      // Move on to the slot that follows rather than clearing the panel:
      // booking a run of periods should not mean starting the form again.
      setSpan((current) =>
        current
          ? proposeSpan({
              roomId: current.roomId,
              day,
              timeZone,
              dayStart,
              dayEnd,
              durationMinutes: Math.round(
                (current.end.getTime() - current.start.getTime()) / 60_000,
              ),
              after: current.end,
            })
          : current,
      );
    },
  });

  const unavailableRooms = unfitRoomIds(rooms, draft.needs);

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

  const isToday = isSameLocalDay(day, new Date(), timeZone);

  // Not from `rooms` — those are what this very filter narrowed, so choosing a
  // building would leave no way to choose a different one.
  const buildings = data?.buildings ?? [];

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
    // Calendar and panel are columns beside each other only where there is
    // width for both; below that the panel is the next thing down the page.
    <div className="flex flex-col lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <PageHeader
          title="Book a room"
          wideActions
          /*
           * The day controls sit beside the title, as on the Timetable, where
           * "which day am I looking at" is asked. The subtitle used to carry
           * that date and a sentence of instructions; the date is the picker's
           * now, and the instructions are the hint under the calendar.
           */
          subtitle={`${rooms.length} rooms · ${events.length} scheduled`}
          actions={
            <DayControls date={day} timeZone={timeZone} onChange={setDay} />
          }
        />
        <PageBody>
          {/*
           * The dated tabs stay with the grid they index, and the building
           * filter shares their row: it narrows the same grid. On a phone the
           * strip scrolls inside itself and the filter takes the next row.
           */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <DayStrip
              date={day}
              timeZone={timeZone}
              onChange={setDay}
              className="w-full min-w-0 sm:w-auto sm:flex-1"
            />
            <Select
              ariaLabel="Building"
              className="w-full sm:w-auto"
              value={buildingId ?? ""}
              options={[
                { value: "", label: "All buildings" },
                ...buildings.map((b) => ({ value: b.id, label: b.name })),
              ]}
              onChange={(id) => setBuildingId(id || undefined)}
            />
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
              onRangeSelect={(range) => {
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
                });
                setPicks((n) => n + 1);
              }}
              selection={selection}
              unavailableRoomIds={unavailableRooms}
            />
          ) : (
            <Card pad={0}>
              <EmptyState icon="door" title="No rooms yet">
                An admin can add them from the Rooms page.
              </EmptyState>
            </Card>
          )}

          {/*
           * Both halves are true wherever this is read, rather than one of them
           * being swapped in on a coarse pointer: a tablet with a keyboard and a
           * trackpad can do either, and someone on a phone is better served by a
           * hint that names the mouse than by one that quietly withholds half
           * the screen's behaviour.
           */}
          <p className="text-faint mt-3 max-w-[72ch] text-xs">
            Tap a room&apos;s column to put a slot on it, then set the exact
            times in the booking panel. With a mouse, drag down the column to
            sweep the whole slot out in one go, and drag the block&apos;s edges
            or middle to shift it.
          </p>

          <MyRequests />
        </PageBody>
      </div>

      {span && (
        <BookingDrawer
          ref={panelRef}
          span={span}
          rooms={rooms}
          draft={draft}
          timeZone={timeZone}
          dayStartMinutes={dayStart}
          dayEndMinutes={dayEnd}
          canCancelOthers={bits.hasAny(
            PermissionFlags.ManageAllEvents,
            PermissionFlags.ManageOwnEvents,
          )}
          onOtherCancelled={async () => {
            await utils.timetable.invalidate();
            router.refresh();
          }}
          onChange={(next) => {
            setSpan(next);
            // Retiming onto another date takes the calendar with it; the grid
            // shows one day, so it would otherwise hide the slot being booked.
            if (!isSameLocalDay(next.start, day, timeZone)) {
              setDay(startOfLocalDay(next.start, timeZone));
            }
          }}
        />
      )}

      {/*
       * The live region is always there and the toast arrives inside it, so a
       * screen reader is told the booking went through: a region that appears
       * already holding its message is often not read at all.
       *
       * Clear of the panel's action bar, which rides the bottom of the screen
       * until the panel goes back to being a column of its own. It rises into
       * place on the house curve rather than the old overshooting spring, and
       * only fades under reduced motion.
       *
       * The bar is one row (about 84px) until the slot clashes, when the
       * verdict takes a row of its own above the button (about 144px). A
       * booking moves the panel on to the next slot, which on a busy day is
       * often the class after it, so the toast rises with the bar rather than
       * sitting on the red verdict; it travels there on the same curve.
       */}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 transition-[bottom] duration-200 ease-[var(--ease-out)] motion-reduce:transition-none lg:bottom-8 ${draft.clashed ? "bottom-40" : "bottom-24"}`}
      >
        {flash && (
          <div className="bg-surface plr-toast flex max-w-full items-center gap-2.5 rounded-[12px] px-4 py-3 shadow-[var(--ring),var(--shadow-md)]">
            <Icon
              name="checkCircle"
              size={18}
              stroke={2}
              className="text-good"
            />
            <span className="text-title text-base font-semibold">{flash}</span>
          </div>
        )}
      </div>
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
