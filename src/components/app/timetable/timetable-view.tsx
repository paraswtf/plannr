"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  BookingDrawer,
  type BookingSpan,
} from "~/components/app/booking/booking-drawer";
import { unfitRoomIds } from "~/components/app/booking/room-fit";
import { useBookingDraft } from "~/components/app/booking/use-booking-draft";
import { PageHeader } from "~/components/app/shell/page-header";
import { Button, buttonClass, IconButton } from "~/components/ui/button";
import { Dialog } from "~/components/ui/dialog";
import { EmptyState } from "~/components/ui/empty-state";
import { Icon } from "~/components/ui/icon";
import {
  courseKey,
  courseTone,
  NO_COURSE,
  type CourseTone,
} from "~/lib/course-colour";
import { Select } from "~/components/ui/select";
import {
  decimalHour,
  formatHourLabel,
  isSameLocalDay,
  localTimeOnDay,
  startOfLocalDay,
} from "~/lib/dates";
import { DayControls, DayStrip } from "./day-navigator";
import { EventDrawer } from "./event-drawer";
import { EventModal } from "./event-modal";
import { softRing } from "./timetable-grid";
import { useNow } from "./use-now";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { api } from "~/trpc/react";
import {
  TimetableGrid,
  type GridEvent,
  type GridRange,
} from "./timetable-grid";

import type { RouterOutputs } from "~/trpc/react";

type GridData = RouterOutputs["timetable"]["grid"];

/** Name of the cookie the compact choice lives in. Read in the page above. */
export const COMPACT_COOKIE = "plannr-timetable-compact";

export function TimetableView({
  initialDate,
  initial,
  permissions,
  defaultCompact = false,
}: {
  initialDate: string;
  initial: GridData;
  permissions: string;
  /** What the cookie was holding when the page was rendered. */
  defaultCompact?: boolean;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const [date, setDate] = useState(() => new Date(initialDate));
  const [buildingId, setBuildingId] = useState<string | undefined>();
  /**
   * Remembered, the way the sidebar's fold is and for the same reason: it is a
   * choice about how this screen is drawn, and being asked it again on every
   * visit is what makes a preference not worth setting. Read on the server so
   * the grid is rendered the shape it is about to be — discovered after paint,
   * a compact grid would draw full size and visibly collapse.
   */
  const [compact, setCompactState] = useState(defaultCompact);
  const setCompact = (next: boolean) => {
    setCompactState(next);
    document.cookie = `${COMPACT_COOKIE}=${next ? "on" : "off"}; path=/; max-age=31536000; samesite=lax`;
  };
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
  // Only for the empty state: whoever can add rooms is offered the way there.
  const canManageRooms = bits.has(PermissionFlags.ManageRooms);
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
        ? `${formatHourLabel(span.start, timeZone)}-${formatHourLabel(span.end, timeZone)}`
        : "";
      const code = rooms.find((r) => r.id === span?.roomId)?.code ?? "Room";
      setSpan(null);
      setFlash({
        text:
          result.event.status === "PENDING"
            ? `${code} requested for ${when}, waiting for approval`
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
    courseTitle: o.courseTitle,
    isMine: o.isMine,
    attendanceMarked: o.attendanceMarked,
    assignments: o.assignments,
  }));

  // Whether anything on this day is the viewer's own, which is what decides
  // whether the gold is worth explaining. An admin with no classes of their own
  // would otherwise be told about a colour that never appears.
  const hasMine = events.some((e) => e.isMine);

  /*
   * Whether anything drawn is running this minute, which is what decides
   * whether the red is explained. The one clock on the screen: it is handed
   * down to the grid, which draws its now line and its live blocks from it
   * rather than from a tick of its own, so the key and the blocks cannot
   * disagree about the minute.
   */
  const now = useNow(30_000);

  /**
   * The subjects actually on screen, in the order they first appear.
   *
   * Built from the day being drawn rather than from the course catalogue, and
   * not only to save a request: `courses.list` is behind `ViewGroups`, which a
   * student deliberately does not hold — a key that fetched it would be a key
   * that 403s for most of the people reading this screen. What is drawn is what
   * is explained, which is the same rule the gold line below already follows.
   */
  const drawnRooms = new Set((data?.rooms ?? []).map((room) => room.id));
  const subjects: Array<{ title: string; count: number }> = [];
  const seenSubjects = new Map<string, number>();
  let uncoursed = 0;
  for (const event of events) {
    // Only what is drawn. An occurrence in an archived room comes back in the
    // response but has no column on the grid, and a key counting it describes
    // a colour nobody can find.
    if (!drawnRooms.has(event.roomId)) continue;
    /*
     * And only in the colour it is actually drawn in. One of the viewer's own
     * classes is gold whatever it teaches, so naming its subject here would put
     * a swatch in the key that is on no block — and counting it as "no subject"
     * would be worse, since the neutral is not what it is wearing either.
     *
     * Live blocks are deliberately not excluded, even though red outranks the
     * tone for the hour they are running: that is a colour this screen holds
     * for forty minutes, and a key that dropped a subject at 11:05 and put it
     * back at 11:50 would be reporting on the clock rather than on the day.
     */
    if (event.isMine) continue;
    if (!event.courseTitle) {
      uncoursed += 1;
      continue;
    }
    const key = courseKey(event.courseTitle);
    const at = seenSubjects.get(key);
    if (at === undefined) {
      seenSubjects.set(key, subjects.length);
      subjects.push({ title: event.courseTitle, count: 1 });
    } else {
      subjects[at]!.count += 1;
    }
  }

  const liveNow = events.some(
    (e) => drawnRooms.has(e.roomId) && e.start <= now && now < e.end,
  );

  /*
   * The named subjects, gathered by the colour they are drawn in.
   *
   * There are eight course tones and a campus day can teach twice that many
   * subjects, so some of them share a colour — and a key listing sixteen
   * swatches, three of them the same pink, invites the reader to tell apart
   * three things that cannot be told apart. One swatch per colour, followed by
   * everything drawn in it, says the sharing out loud instead. The palette
   * itself is not this screen's to change; how honestly it is presented is.
   */
  const toneGroups: Array<{ tone: CourseTone; titles: string[] }> = [];
  for (const subject of subjects.slice(0, KEY_LIMIT)) {
    const tone = courseTone(subject.title);
    const group = toneGroups.find((g) => g.tone === tone);
    if (group) group.titles.push(subject.title);
    else toneGroups.push({ tone, titles: [subject.title] });
  }
  // Phone only: the subjects fold away behind their count, since grouped by
  // colour they still wrap to a dozen lines under a 390px grid.
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const subjectsId = useId();
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = useId();

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
          : "Change requested, waiting for approval",
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
      {/*
       * Solid paper rather than glass: the coloured grid scrolls up behind this
       * header, and the blur showed every block smeared under the controls.
       */}
      <div className="min-w-0 flex-1">
        <PageHeader
          title="Timetable"
          wideActions
          compact
          opaque
          /*
           * No date here any more. The picker beside the title carries it, and
           * a header that said it twice would be spending two lines of a screen
           * this control now sits at the top of.
           */
          subtitle={`${data?.rooms.length ?? 0} rooms · ${events.length} scheduled`}
          actions={
            <>
              <DayControls date={date} timeZone={timeZone} onChange={goToDay} />
              {/*
               * What the grid is *of*, rather than what day it is — kept
               * together on one line so the pair reads as a unit when the
               * header wraps.
               */}
              {/*
               * 6px between the pair at `lg`, the same as between the day
               * controls, and two pixels of the room the row needs to stay on
               * the title's line at 1024px (see `CompactToggle`).
               */}
              <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto lg:gap-1.5">
                <Select
                  ariaLabel="Building"
                  // The compact toggle sits beside it, so it takes what that
                  // leaves rather than the whole width.
                  className="min-w-0 flex-1 sm:w-auto"
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
                <CompactToggle on={compact} onChange={setCompact} />
              </div>
            </>
          }
        />
        {/*
         * Its own wrapper rather than `PageBody`, on purpose: the gutters are
         * the same 16/24/36px, but the vertical padding here is part of what
         * `--tt-ceiling` subtracts, and the compact fit is measured against it.
         */}
        <div className="px-4 pt-2 pb-8 sm:px-6 lg:px-9 lg:pb-10">
          {/* The tabs stay with the grid they index. */}
          <div className="mb-4">
            <DayStrip date={date} timeZone={timeZone} onChange={goToDay} />
          </div>

          {data && data.rooms.length > 0 ? (
            <TimetableGrid
              rooms={data.rooms.map((r) => ({ id: r.id, code: r.code }))}
              events={events}
              timeZone={timeZone}
              startHour={startHour}
              endHour={endHour}
              showNowLine={isToday}
              now={now}
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
              compact={compact}
              // The block the open panel describes, so the two can be matched
              // up across the screen.
              highlightedOccurrenceId={opened?.event.occurrenceId}
            />
          ) : (
            /*
             * Two different emptinesses. A building with nothing in it is a
             * filter to change; a campus with no rooms at all is set-up work,
             * offered to whoever may do it and simply stated to everyone else
             * — a student told to go and add rooms is being told to do
             * something they cannot.
             */
            <div className="bg-surface rounded-[var(--radius-card)] shadow-[var(--ring),var(--shadow-card)]">
              {buildingId ? (
                <EmptyState icon="building" title="No rooms in this building">
                  Choose another building, or all of them, from the filter
                  above.
                </EmptyState>
              ) : (
                <EmptyState
                  icon="grid"
                  title="No rooms yet"
                  action={
                    canManageRooms ? (
                      <Link
                        href="/rooms"
                        className={buttonClass("primary", "md")}
                      >
                        Add rooms
                      </Link>
                    ) : undefined
                  }
                >
                  {canManageRooms
                    ? "Each room becomes a column here once it has been added."
                    : "No rooms have been set up yet."}
                </EmptyState>
              )}
            </div>
          )}

          {/*
           * The key: every colour on screen, and nothing that is not.
           *
           * Swatches rather than sentences, because the reader matching a
           * colour to a word should not have to take the word's account of
           * which colour it means — and because a paragraph explaining six
           * tints would be longer than the thing it explains. Named only where
           * it is actually drawn: an admin whose day holds none of their own
           * classes is not told about gold, and a day of unattached bookings is
           * not given a list of subjects it does not contain.
           *
           * The two signals lead, on a line of their own with the neutral:
           * "yours" and "on now" are what somebody scanning a campus grid is
           * looking for, and the only colours whose meaning is written nowhere
           * else. The subjects follow, one swatch per colour.
           */}
          {(hasMine || liveNow || subjects.length > 0 || uncoursed > 0) && (
            <section
              aria-label="Key"
              // One run of entries that wraps, rather than a grid of columns:
              // the colour groups are as long as the subjects in them, and a
              // grid gave the one-subject colours a column's worth of empty
              // space each and the page two extra lines.
              className="text-muted mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs"
            >
              {hasMine && (
                <Swatch fill="var(--mine-fill)" ring="var(--mine-ring)">
                  Yours
                </Swatch>
              )}
              {liveNow && (
                <Swatch fill="var(--live-fill)" ring="var(--red)" live>
                  On now
                </Swatch>
              )}
              {/*
               * The honest half. Most classes on this deployment have no
               * course attached — the sync does not set one — so without this
               * line the grey is read as a colour that failed rather than a
               * fact about the data.
               */}
              {uncoursed > 0 && (
                <Swatch fill={NO_COURSE.fill} ring={softRing(NO_COURSE.ring)}>
                  {uncoursed} with no subject
                </Swatch>
              )}
              {subjects.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  // Pulled left by its own padding so its words line up with
                  // the swatches' edge when it wraps onto a line of its own.
                  className="-ml-3 sm:hidden"
                  aria-expanded={subjectsOpen}
                  aria-controls={subjectsId}
                  onClick={() => setSubjectsOpen((open) => !open)}
                >
                  Subjects ({subjects.length})
                  <Chevron open={subjectsOpen} />
                </Button>
              )}
              {toneGroups.length > 0 && (
                /*
                 * `contents`, so the entries join the run above as if the list
                 * were not there; the explicit role keeps it announced as a
                 * list, which some browsers stop doing for a box that is not
                 * drawn.
                 */
                <ul
                  id={subjectsId}
                  role="list"
                  className={`${subjectsOpen ? "contents" : "hidden"} sm:contents`}
                >
                  {toneGroups.map((group) => (
                    <li key={group.titles[0]} className="max-w-full">
                      <Swatch
                        fill={group.tone.fill}
                        ring={softRing(group.tone.ring)}
                        wrap
                      >
                        {group.titles.join(", ")}
                      </Swatch>
                    </li>
                  ))}
                  {/*
                   * Never a silent cut: a campus day can hold more subjects
                   * than a key has room for, and a list that quietly stopped
                   * would read as the rest having no colour at all.
                   */}
                  {subjects.length > KEY_LIMIT && (
                    <li>
                      and {subjects.length - KEY_LIMIT} more{" "}
                      {subjects.length - KEY_LIMIT === 1
                        ? "subject"
                        : "subjects"}
                    </li>
                  )}
                </ul>
              )}
            </section>
          )}

          {/*
           * One plain line for what the grid is, and the rest folded away.
           *
           * The full account used to be a seventy-word paragraph under the
           * grid that everybody skipped. It is still all here, behind "How the
           * grid works", and split by the hand doing it rather than swapped on
           * a coarse pointer: a tablet with a trackpad can do both, and
           * someone on a phone is better served by seeing what the mouse does
           * than by a hint that quietly withholds half the screen's behaviour.
           * What it may not do is describe a drag as the only way in, which is
           * what it did while touch could only tap.
           */}
          <div className="text-muted mt-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-1">
              <p>
                {canBook
                  ? "Tap a room's column to start a booking, or open a block for its details."
                  : canMoveEvents
                    ? "Each block is a scheduled class or booking. Open one for its details."
                    : "Each block is a scheduled class or booking. Open one to see who teaches it, which groups sit in it and how long it runs."}
              </p>
              <Button
                variant="link"
                size="sm"
                aria-expanded={helpOpen}
                aria-controls={helpId}
                onClick={() => setHelpOpen((open) => !open)}
              >
                How the grid works
                <Chevron open={helpOpen} />
              </Button>
            </div>
            <dl
              id={helpId}
              hidden={!helpOpen}
              className="mt-1 grid max-w-[78ch] gap-x-4 gap-y-1.5 sm:grid-cols-[auto_1fr]"
            >
              <dt className="text-title font-semibold">On a touch screen</dt>
              <dd>
                {canBook
                  ? "Tap a room's column to start a 15-minute slot, then set the exact times in the panel. Press and hold a block for its details without leaving the grid."
                  : "Press and hold a block for its details without leaving the grid."}
              </dd>
              <dt className="text-title font-semibold">With a mouse</dt>
              <dd>
                {canBook ? (
                  <>
                    Drag down a column to sweep a longer slot out in one go, and
                    drag the chosen block&apos;s edges or middle to adjust it
                    {canMoveEvents &&
                      ", or drag a booked block to another time or room"}
                    . Right-click a block for its details without leaving the
                    grid.
                  </>
                ) : canMoveEvents ? (
                  "Drag a block to another time or room. Right-click it for its details without leaving the grid."
                ) : (
                  "Right-click a block for its details without leaving the grid."
                )}
              </dd>
            </dl>
          </div>
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
          <p className="text-muted mb-4 text-sm">
            {pendingMove.event.title} repeats. Which of it should move?
          </p>
          {/*
           * Three answers, and one of them is the safe one: moving only the
           * occurrence that was dragged is what a drag means on every other
           * block, so it is the dialog's one primary and the wider reaches are
           * the alternatives beside it.
           */}
          <div className="flex flex-col gap-2">
            {(
              [
                ["occurrence", "Only this one"],
                ["following", "This one and the ones after it"],
                ["series", "Every one of them"],
              ] as const
            ).map(([scope, label]) => (
              <Button
                key={scope}
                variant={scope === "occurrence" ? "primary" : "secondary"}
                block
                className="justify-start"
                onClick={() => {
                  applyMove(pendingMove.event, pendingMove.target, scope);
                  setPendingMove(null);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </Dialog>
      )}

      {/*
       * Spoken: a move or a booking settles off to one side of where the
       * reader is looking, so a screen reader is told — politely for a
       * success, at once for a failure. The two live regions are always
       * mounted and only their words change, because a region that arrives
       * already holding its message is one VoiceOver tends not to read at all;
       * the toast below is what is seen, and these are what is heard.
       */}
      <p role="status" className="sr-only">
        {flash && !flash.bad ? flash.text : ""}
      </p>
      <p role="alert" className="sr-only">
        {flash?.bad ? flash.text : ""}
      </p>
      {flash && (
        /*
         * Raised, like every other thing that hangs over the page. Not itself
         * a live region (the pair above is), so it is not announced twice.
         */
        <div className="plr-toast bg-surface fixed inset-x-4 bottom-4 z-40 flex items-center gap-2.5 rounded-[12px] py-2 pr-2 pl-4 shadow-[var(--ring),var(--shadow-md)] sm:inset-x-auto sm:right-8 sm:bottom-8">
          <Icon
            name={flash.bad ? "alert" : "checkCircle"}
            size={18}
            stroke={2}
            className={flash.bad ? "text-bad" : "text-good"}
          />
          <span className="text-title min-w-0 flex-1 text-sm font-semibold sm:max-w-[320px] sm:flex-none">
            {flash.text}
          </span>
          <IconButton
            icon="x"
            label="Dismiss"
            size="sm"
            iconSize={14}
            onClick={() => setFlash(null)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * How many subjects the key names before it starts counting them instead.
 *
 * A whole campus day unfiltered can carry more courses than there are tones,
 * and a key longer than the grid it explains has stopped being a key.
 */
const KEY_LIMIT = 14;

/**
 * One entry in the key: the colour, then what it means.
 *
 * The swatch is drawn the way a block is — the same fill, the same ring — so
 * that matching one to the other is a matter of looking, not decoding. `live`
 * adds the red leading edge the running blocks carry. `wrap` lets a colour
 * shared by several subjects list them all over two lines rather than cutting
 * the list off at whatever fits.
 */
function Swatch({
  fill,
  ring,
  live = false,
  wrap = false,
  children,
}: {
  fill: string;
  ring: string;
  live?: boolean;
  wrap?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`flex min-w-0 gap-2 ${wrap ? "items-start" : "items-center"}`}
    >
      <span
        className={`h-3 w-5 shrink-0 rounded-[4px] ${wrap ? "mt-[3px]" : ""}`}
        style={{
          background: fill,
          boxShadow: live
            ? `inset 2px 0 0 ${ring}, inset 0 0 0 1px ${ring}`
            : `inset 0 0 0 1px ${ring}`,
        }}
      />
      <span className={`min-w-0 ${wrap ? "" : "truncate"}`}>{children}</span>
    </span>
  );
}

/** The disclosure arrow, turned up while what it discloses is open. */
function Chevron({ open }: { open: boolean }) {
  return (
    <Icon
      name="chevronDown"
      size={13}
      stroke={2}
      className={`transition-transform duration-150 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
    />
  );
}

/**
 * Whether the whole timetable is fitted to the screen.
 *
 * Not a `Segmented`, though the shape is tempting: there is already a segmented
 * strip of dated tabs on this row, and a second pill group beside it reads as
 * one control with two halves that disagree. This is a single binary, so it
 * takes the shape the row's other buttons already have — a white button like
 * Today and the building field — as a pressed toggle. On,
 * it sinks into the slate wash with a slate edge, the way a pressed key does,
 * rather than filling slate with a glow: slate fill is what the one primary
 * button on a screen wears, and this is a view setting, not the screen's
 * action.
 *
 * Tighter than a stock button at `lg` (the field's 12px inset, a 6px gap, 12px
 * type), for the same reason as Today along the row: the whole action row has
 * to fit on the title's line with the sidebar open at 1024px, because
 * `--tt-ceiling` assumes a one-line header there, and a toggle whose job is to
 * fit the day on screen cannot be what pushes it below the fold.
 */
function CompactToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Button
      variant="secondary"
      icon="grid"
      pressed={on}
      title="Fit the whole timetable on screen"
      onClick={() => onChange(!on)}
      className="lg:gap-1.5 lg:px-3 lg:text-xs"
    >
      Compact
    </Button>
  );
}
