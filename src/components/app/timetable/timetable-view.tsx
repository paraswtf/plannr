"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  BookingDrawer,
  type BookingSpan,
} from "~/components/app/booking/booking-drawer";
import { unfitRoomIds } from "~/components/app/booking/room-fit";
import { useBookingDraft } from "~/components/app/booking/use-booking-draft";
import { PageHeader } from "~/components/app/shell/page-header";
import { Dialog } from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
import { Select } from "~/components/ui/select";
import {
  decimalHour,
  formatFullDate,
  formatHourLabel,
  isSameLocalDay,
  localTimeOnDay,
  startOfLocalDay,
} from "~/lib/dates";
import { DayNavigator } from "./day-navigator";
import { EventDrawer } from "./event-drawer";
import { EventModal } from "./event-modal";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { api } from "~/trpc/react";
import {
  TimetableGrid,
  type GridEvent,
  type GridRange,
} from "./timetable-grid";

import type { RouterOutputs } from "~/trpc/react";

type GridData = RouterOutputs["timetable"]["grid"];

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
  const canMarkAttendance = bits.has(PermissionFlags.MarkAttendance);
  /**
   * The block that was opened, and which way in was used.
   *
   * Both frames show the same thing; a click gets the drawer beside the
   * calendar, and a press-and-hold or a right-click gets it over the block
   * instead, which on a phone is the difference between the answer and a
   * screen's worth of scrolling to reach it.
   */
  const [opened, setOpened] = useState<{
    event: GridEvent;
    via: "click" | "press";
  } | null>(null);

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
  const rooms = data?.rooms ?? [];

  // The draft is held here rather than in the drawer because the grid reads it
  // too: the class being scheduled is what decides which rooms are too small.
  const draft = useBookingDraft({
    isSelfServe,
    roomId: span?.roomId ?? "",
    start: span?.start ?? null,
    end: span?.end ?? null,
    timeZone,
    room: rooms.find((r) => r.id === span?.roomId),
    onCreated: async (result) => {
      const when = span
        ? `${formatHourLabel(span.start, timeZone)}–${formatHourLabel(span.end, timeZone)}`
        : "";
      const code = rooms.find((r) => r.id === span?.roomId)?.code ?? "Room";
      setSpan(null);
      setFlash({
        text:
          result.event.status === "PENDING"
            ? `${code} requested for ${when} — waiting for approval`
            : `${code} booked for ${when}`,
      });
      await utils.timetable.invalidate();
      router.refresh();
    },
  });

  const unavailableRooms = unfitRoomIds(rooms, draft.needs);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 5_000);
    return () => clearTimeout(id);
  }, [flash]);

  const panelRef = useRef<HTMLDivElement>(null);
  // Counts picks taken from the grid, so that a second one moves the page as
  // readily as the first. Watching the panel open instead would fire once and
  // then never again, leaving every later tap silent — which is the same fault
  // one tap further on.
  const [picks, setPicks] = useState(0);
  // Whether the pick being counted is the one that opened the panel. Read in
  // the effect below, so it is written before the state that runs it.
  const opening = useRef(false);

  /**
   * Where the panel sits under the calendar rather than beside it, a pick on the
   * grid would otherwise appear to do nothing — the form it filled in is a
   * screen further down. Only when it is genuinely in the flow: a panel drawn
   * over the page has no height of its own and is on screen already.
   *
   * With a mouse, only the pick that opened the panel moves the page. A mouse
   * reports the range live all the way through a resize or a move drag, and
   * scrolling on each of those reports would pull the grid out from under the
   * cursor; the opening pick is the one that cannot be mid-drag, since there was
   * no chosen block to take hold of yet. Touch cannot drag this grid at all, so
   * every pick it makes is one settled tap and every one of them can be shown.
   */
  useEffect(() => {
    if (picks === 0) return;
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    if (!opening.current && !window.matchMedia("(pointer: coarse)").matches) {
      return;
    }
    const panel = panelRef.current;
    if (!panel || panel.offsetHeight === 0) return;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [picks]);

  const events: GridEvent[] = (data?.occurrences ?? []).map((o) => ({
    occurrenceId: o.occurrenceId,
    eventId: o.eventId,
    roomId: o.roomId,
    start: o.start,
    end: o.end,
    originalStart: o.originalStart,
    title: o.title,
    // A combined lecture names every group rather than only the first.
    subtitle: o.groupNames.join(", ") || o.groupLabel,
    isRecurring: o.isRecurring,
    kind: o.kind,
    roomCode: o.roomCode,
    facultyName: o.facultyName,
    groupNames: o.groupNames,
    isMine: o.isMine,
    attendanceMarked: o.attendanceMarked,
  }));

  // Whether anything on this day is the viewer's own, which is what decides
  // whether the gold is worth explaining. An admin with no classes of their own
  // would otherwise be told about a colour that never appears.
  const hasMine = events.some((e) => e.isMine);

  /**
   * Every block opens, for everybody.
   *
   * It used to open only for somebody who could change it or take its register,
   * and a lecturer holding only the latter was sent straight past the panel to
   * the register itself. Both were the screen apologising for a panel most
   * people could not reach: a class is noticeboard information, and now that
   * everyone gets the panel, routing one group around it would cost them the
   * room, the cohorts, the lecturer and the duration to save a single tap —
   * with the register still one tap away in the footer.
   */
  const openEvent = (event: GridEvent) => setOpened({ event, via: "click" });
  const pressEvent = (event: GridEvent) => setOpened({ event, via: "press" });

  const isToday = isSameLocalDay(date, new Date(), timeZone);

  /** Keeps the URL on the day being shown, so a reload or a shared link lands there. */
  const writeDateToUrl = (day: Date) => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", day.toISOString());
    window.history.replaceState(null, "", url);
  };

  /** Moving the day drops the drafted span — it belongs to the day it was drawn on. */
  const goToDay = (next: Date) => {
    setDate(next);
    setSpan(null);
    writeDateToUrl(next);
  };

  /**
   * The panel can retime a booking onto another date, and the calendar shows
   * one day, so the screen follows it rather than leaving the block behind.
   */
  const changeSpan = (next: BookingSpan) => {
    setSpan(next);
    if (!isSameLocalDay(next.start, date, timeZone)) {
      const day = startOfLocalDay(next.start, timeZone);
      setDate(day);
      writeDateToUrl(day);
    }
  };

  // From the response's own unfiltered list, never from the rooms on screen:
  // those are what the filter narrowed.
  const buildings = data?.buildings ?? [];

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

  const takeRange = (range: GridRange) => {
    opening.current = !span;
    setSpan({
      roomId: range.roomId,
      start: localTimeOnDay(date, Math.round(range.startHour * 60), timeZone),
      end: localTimeOnDay(date, Math.round(range.endHour * 60), timeZone),
    });
    setPicks((n) => n + 1);
  };

  const move = api.events.update.useMutation({
    onSuccess: async (result) => {
      // Somebody without the authority to rewrite the timetable has asked for
      // this rather than done it, and the block is about to spring back to
      // where it was. Saying so is the difference between "my drag was filed"
      // and "the app ignored me".
      setFlash({
        text: result.applied
          ? "Moved"
          : "Change requested — waiting for approval",
      });
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
    // There is no room for that beside a phone — narrowing the grid to a couple
    // of centimetres would defeat the point — so below lg it falls in under the
    // calendar instead, and the screen takes you to it. The full-screen floor
    // is what gives the docked panel something to stick against, so it comes in
    // with the docking: below lg it would only add the topbar's height to the
    // page and leave a phone scrolling past the end of the day.
    <div className="flex flex-col lg:min-h-screen lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <PageHeader
          title="Timetable"
          subtitle={`${formatFullDate(date, timeZone)} · ${data?.rooms.length ?? 0} rooms · ${events.length} scheduled`}
        />
        <div className="px-4 pt-2 pb-8 sm:px-6 lg:px-9 lg:pb-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <DayNavigator date={date} timeZone={timeZone} onChange={goToDay} />
            <Select
              ariaLabel="Building"
              // On its own line under the day controls it may as well be the
              // width of that line; a 120px stub floating at the left reads as
              // something that came loose.
              className="w-full sm:w-auto"
              value={buildingId ?? ""}
              options={[
                { value: "", label: "All buildings" },
                ...buildings.map((b) => ({ value: b.id, label: b.name })),
              ]}
              onChange={(id) => {
                setBuildingId(id || undefined);
                setSpan(null);
              }}
            />
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
              // Always live. Every block is a real button whatever may be done
              // with it, so withholding the handler left a focusable control
              // that answered to nothing; a reader who can change none of this
              // can still ask what it is.
              onEventClick={openEvent}
              onEventPress={pressEvent}
              selection={selection}
              unavailableRoomIds={unavailableRooms}
            />
          ) : (
            <div
              className="bg-surface text-muted rounded-[var(--radius-card)] p-6 text-center text-[14px] sm:p-10"
              style={{ boxShadow: "var(--ring)" }}
            >
              No rooms yet. An admin can add them from the Rooms tab.
            </div>
          )}

          {/*
           * The gold is the only thing telling one block from another, so it is
           * named wherever it is actually on screen — and only there. A swatch
           * rather than the word "gold" alone, because the reader matching a
           * colour to a sentence should not have to take the sentence's word for
           * which colour it means.
           */}
          {hasMine && (
            <p className="text-faint mt-3 flex items-center gap-2 text-[12.5px]">
              <span
                className="h-[13px] w-[21px] shrink-0 rounded-[5px]"
                style={{
                  background: "var(--mine-fill)",
                  boxShadow: "inset 0 0 0 1px var(--mine-ring)",
                }}
              />
              Blocks in gold are your own — the classes you attend or teach.
            </p>
          )}

          {/*
           * Every clause is true wherever this is read, rather than one set of
           * words being swapped in on a coarse pointer: a tablet with a trackpad
           * can do both, and someone on a phone is better served by a hint that
           * names the mouse than by one that quietly withholds half the screen's
           * behaviour. What it may not do is describe a drag as the only way in,
           * which is what it did while touch could only tap.
           */}
          <p className="text-faint mt-3 text-[12.5px]">
            {canBook ? (
              <>
                Tap a room&apos;s column to start a 15-minute slot, then set the
                exact times in the panel. With a mouse, drag down a column to
                sweep a longer slot out in one go, and drag the chosen
                block&apos;s edges or middle to adjust it
                {canMoveEvents &&
                  ", or drag a booked block to another time or room"}
                . Press and hold a block, or right-click it, for its details
                without leaving the grid.
              </>
            ) : canMoveEvents ? (
              <>
                Each block is a scheduled class or booking. With a mouse, one
                can be dragged to another time or room; press and hold, or
                right-click, for its details without leaving the grid.
              </>
            ) : (
              <>
                Each block is a scheduled class or booking — open one to see who
                teaches it, which groups sit in it and how long it runs. Press
                and hold, or right-click, to see the same without leaving the
                grid.
              </>
            )}
          </p>
        </div>
      </div>

      {span && data && (
        // Stretching the wrapper on a desktop keeps the panel's own stickiness
        // alive: caged in a box its exact height, it would have nowhere to
        // travel and would scroll away with the page.
        <div
          ref={panelRef}
          className="shrink-0 scroll-mt-(--topbar-h) lg:self-stretch"
        >
          <BookingDrawer
            span={span}
            rooms={data.rooms}
            draft={draft}
            timeZone={timeZone}
            dayStartMinutes={dayStartMinutes}
            dayEndMinutes={dayEndMinutes}
            canCancelOthers={canMoveEvents}
            onChange={changeSpan}
            onClose={() => setSpan(null)}
            onOtherCancelled={async () => {
              await utils.timetable.invalidate();
              router.refresh();
            }}
          />
        </div>
      )}

      {opened &&
        (() => {
          const Frame = opened.via === "press" ? EventModal : EventDrawer;
          return (
            <Frame
              event={opened.event}
              timeZone={timeZone}
              canEdit={canMoveEvents}
              canMarkAttendance={canMarkAttendance}
              onClose={() => setOpened(null)}
              onChanged={async () => {
                await utils.timetable.invalidate();
                router.refresh();
              }}
            />
          );
        })()}

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
                className="bg-surface text-title cursor-pointer rounded-[10px] px-3.5 py-3.5 text-left text-[13.5px] font-semibold lg:py-2.5"
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
          className="plr-toast fixed inset-x-4 bottom-4 z-40 flex items-center gap-2.5 rounded-xl px-4 py-3 sm:inset-x-auto sm:right-8 sm:bottom-8"
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
          <span className="text-title min-w-0 flex-1 text-[13.5px] font-semibold sm:max-w-[320px] sm:flex-none">
            {flash.text}
          </span>
          <button
            type="button"
            onClick={() => setFlash(null)}
            aria-label="Dismiss"
            className="-mr-1.5 ml-1.5 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg sm:mr-0 sm:h-6 sm:w-6"
          >
            <Icon name="x" size={13} color="var(--muted)" />
          </button>
        </div>
      )}
    </div>
  );
}
