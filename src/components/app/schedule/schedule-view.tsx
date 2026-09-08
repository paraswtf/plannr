"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "~/components/app/shell/page-header";
import { DayNavigator } from "~/components/app/timetable/day-navigator";
import { EventDrawer } from "~/components/app/timetable/event-drawer";
import { EventModal } from "~/components/app/timetable/event-modal";
import type { GridEvent } from "~/components/app/timetable/timetable-grid";
import { useNow } from "~/components/app/timetable/use-now";
import { Card } from "~/components/ui/card";
import { useCoarsePointer } from "~/components/ui/use-coarse-pointer";
import { Segmented } from "~/components/ui/segmented";
import {
  addDays,
  formatFullDate,
  formatMonthLabel,
  isSameLocalDay,
  startOfLocalDay,
  toWallTime,
} from "~/lib/dates";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import {
  spanHolds,
  SPAN_LABELS,
  SPAN_NOUNS,
  SPANS,
  startOfLocalWeek,
  stepSpan,
  type ScheduleSpan,
} from "~/lib/schedule-spans";
import {
  describeClass,
  PERSPECTIVE_LABELS,
  type Perspective,
} from "~/lib/schedule-views";
import { api, type RouterOutputs } from "~/trpc/react";
import { type Offset } from "./swipe-gesture";
import { DayCalendar, type DayCalendarEvent } from "./day-calendar";
import { dayWindow } from "./day-layout";
import { DaySkeleton } from "./day-skeleton";
import { MonthGrid } from "./month-grid";
import { monthLayout } from "./month-layout";
import { MonthSkeleton } from "./month-skeleton";
import { SpanCarousel } from "./span-carousel";
import { WeekCalendar } from "./week-calendar";
import { ViewAs, type ViewAsSubject } from "./view-as";
import { WeekSkeleton } from "./week-skeleton";

type Schedule = RouterOutputs["timetable"]["mySchedule"];

const SPAN_ITEMS = SPANS.map((span) => ({
  value: span,
  label: SPAN_LABELS[span],
}));

/**
 * The schedule: a day, a week or a month, from whichever angle you are involved
 * in it.
 *
 * The calendar is the same for everybody — time drawn down the page with a line
 * across the present — and the perspective decides what is written on each
 * class. The span decides how far you can see, and the two are independent: a
 * coordinator can look at somebody else's month.
 *
 * Somebody who is only one thing never sees the perspective chooser; somebody
 * who teaches and coordinates, or studies and administers, switches between
 * their own answers to "what am I doing?".
 */
export function ScheduleView({
  initial,
  permissions,
}: {
  initial: Schedule;
  permissions: string;
}) {
  const now = useNow(30_000);
  const router = useRouter();
  const utils = api.useUtils();

  const [span, setSpan] = useState<ScheduleSpan>("day");

  /**
   * Whether the calendar is on a rail this can be pushed along.
   *
   * Two conditions, and both are about whether the gesture would mean anything.
   * A finger, because there is nothing to swipe with otherwise and a laptop
   * should not be fetching two extra spans for a rail it will never touch. And
   * not the week, whose columns already pan sideways inside their own scroller
   * — a gesture that means two things depending on where the finger landed is a
   * gesture nobody trusts.
   */
  const finger = useCoarsePointer();
  const live = finger && span !== "week";
  const [date, setDate] = useState(() => new Date(initial.anchor));
  /**
   * Whether the stretch on screen was chosen by the person reading it.
   *
   * The screen opens on the next class, which on a Friday evening is Monday — a
   * jump nobody asked for and, unexplained, one that reads as the app having
   * lost today. Saying so is only honest until they move it themselves — with
   * `Today`, the arrows, the date or a tab — after which it is their choice and
   * needs no caption.
   */
  const [moved, setMoved] = useState(false);
  const goTo = (day: Date) => {
    setMoved(true);
    setDate(day);
    // Asking for today is asking to see now, so the calendar is allowed to
    // centre the present again. Without this the latch below is written once
    // on arrival and never cleared, and `Today` quietly stopped scrolling to
    // the now-line at all — which is most of what the button is for.
    if (isSameLocalDay(day, new Date(), timeZone)) centred.current = false;
  };
  /** Whose schedule is on screen, when it is not your own. */
  const [asUserId, setAsUserId] = useState<string | null>(null);
  const [personQuery, setPersonQuery] = useState("");
  // Null means "however the server chose", which is what the page was rendered
  // with; picking from the dropdown is what makes it explicit.
  const [viewAs, setViewAs] = useState<Perspective | null>(null);
  const [opened, setOpened] = useState<{
    event: GridEvent;
    via: "click" | "press";
  } | null>(null);

  // Seeded only for the day and angle the page was rendered with. Handing the
  // same data to every other key would make it look answered — the client holds
  // results for half a minute — and changing the date, the span or the
  // perspective would appear to do nothing at all.
  const isRendered =
    span === "day" &&
    viewAs === null &&
    asUserId === null &&
    date.getTime() === new Date(initial.anchor).getTime();

  const { data, isPending, isPlaceholderData, isError, refetch } =
    api.timetable.mySchedule.useQuery(
      {
        date,
        span,
        viewAs: viewAs ?? undefined,
        asUserId: asUserId ?? undefined,
      },
      {
        initialData: isRendered ? initial : undefined,
        // The previous key's response is held on to, but only for the frame it
        // came in: the timezone, the perspectives on offer, whose schedule this
        // is. None of those change from one day to the next, so keeping them
        // stops the toolbar collapsing and rebuilding on every step.
        //
        // The classes are a different matter and are hidden until they are this
        // window's — see `stale` below.
        placeholderData: (previous) => previous,
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
      },
    );

  /**
   * Whether what is in `data` belongs to the window (or person) now being asked
   * about. Placeholder data is the previous key's answer, and a previous week's
   * lectures drawn under this week's dates cannot be told apart from real ones
   * — so while this is true the calendar gives way to a skeleton rather than
   * lying quietly. Switching span changes the query key, so this covers that
   * for free.
   */
  const stale = isPending || isPlaceholderData;

  const timeZone = data?.timeZone ?? "Asia/Kolkata";
  const views = data?.views ?? [];
  const detail = data?.detail ?? null;
  const classes = data?.occurrences ?? [];

  /**
   * What one answer draws as blocks on a calendar.
   *
   * A function rather than a value now, because there are three answers on
   * screen at once and each has to be read through its own `detail` — the
   * perspective is what decides the words on a class, and borrowing another
   * day's would put the wrong ones there.
   */
  const blocksOf = (from: Schedule | undefined): DayCalendarEvent[] => {
    const seen = from?.detail;
    if (!from || !seen) return [];
    return from.occurrences.map((o) => ({
      id: o.occurrenceId,
      start: o.start,
      end: o.end,
      title: o.title,
      roomCode: o.roomCode,
      lines: describeClass(o, seen),
    }));
  };

  const blocks = blocksOf(data);

  /*
   * The span either side of the one being read, fetched ahead of being asked
   * for.
   *
   * This is what makes the swipe a swipe rather than a wait. The rail puts
   * tomorrow on screen as the finger drags, so tomorrow has to exist before the
   * finger moves; and when the step lands, the main query's key becomes one of
   * these two, finds it already answered, and hands it over without a
   * placeholder — so `stale` never turns true and the skeleton never appears.
   * The day arrives instead of loading.
   *
   * Only where there is a rail. On a laptop this would be two queries a page
   * for a screen whose arrows nobody is going to press twice, and the week span
   * has no rail of its own.
   */
  const beforeDate = stepSpan(date, span, -1, timeZone);
  const afterDate = stepSpan(date, span, 1, timeZone);
  const neighbour = {
    enabled: live,
    // Neither of these belongs on a span nobody is looking at. It becomes the
    // main query the moment it is, and refetches then under its own options.
    refetchOnWindowFocus: false,
  };
  const before = api.timetable.mySchedule.useQuery(
    {
      date: beforeDate,
      span,
      viewAs: viewAs ?? undefined,
      asUserId: asUserId ?? undefined,
    },
    neighbour,
  );
  const after = api.timetable.mySchedule.useQuery(
    {
      date: afterDate,
      span,
      viewAs: viewAs ?? undefined,
      asUserId: asUserId ?? undefined,
    },
    neighbour,
  );

  // The columns a week is drawn in, and the cells a month is. Both are computed
  // from the date and the timezone rather than from the response, so the
  // skeletons can draw the identical frame while the classes are still coming.
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    addDays(startOfLocalWeek(date, timeZone), i, timeZone),
  );

  // The hours the calendar spans. Taken from whatever is in hand — the previous
  // window while the next loads — because the skeleton and the calendar have to
  // agree on the page's height or the switch shows up as a jump.
  //
  // "Is now in view" has to be asked the way the calendar itself asks it: a
  // week holding today stretches its window to reach the current hour even when
  // the anchor day is Monday and the clock says Friday evening, and a skeleton
  // that asked only about the anchor day would stand a couple of hours shorter
  // than the thing replacing it.
  const showsNow = weekDays.some((day) => isSameLocalDay(day, now, timeZone));
  /*
   * On a rail, all three days are asked about at once and given one answer.
   *
   * Three days each working out their own window would put 09:00 at a different
   * height in each of them, so the hour axis would shear as the finger dragged
   * across it and the page would change height every time a swipe landed. The
   * cost is a quiet hour or two drawn on a day whose neighbour starts earlier,
   * which is what an hour axis that holds still is worth.
   */
  const onRail = live && span === "day";
  const railDays = onRail ? [beforeDate, date, afterDate] : [date];
  const frame = dayWindow(
    onRail
      ? [...blocksOf(before.data), ...blocks, ...blocksOf(after.data)]
      : blocks,
    (
      span === "day"
        ? railDays.some((day) => isSameLocalDay(day, now, timeZone))
        : showsNow
    )
      ? now
      : null,
    timeZone,
  );

  const bits = new PermissionBitField(BigInt(permissions));
  const canMarkAttendance = bits.has(PermissionFlags.MarkAttendance);
  // Anybody who can open this screen may look at anybody else's schedule: a
  // timetable is noticeboard information, and `searchPeople` answers with names
  // alone. What each perspective *says* about a class is still decided server
  // side, and editing and attendance keep their own permissions.

  /**
   * Held back until somebody opens the picker, or is already looking at
   * somebody else's schedule.
   *
   * The perspectives and the people share one list now, and the list is behind
   * a button — so the names are not needed to draw the screen, and every
   * student loading their own timetable would otherwise pay for a directory
   * query they were never going to read. Once open it stays live: the point of
   * the control is switching, and switching again is the next thing it is for.
   */
  const [pickerUsed, setPickerUsed] = useState(false);

  /**
   * Whether the present has already been scrolled to on this screen.
   *
   * `DayCalendar` centres the now-line when it mounts, and it mounts again
   * every time the answer changes: switching to a colleague's schedule takes
   * the calendar down to a skeleton and brings it back, so the page jumped
   * under anybody who tapped a favourite. Arriving is the thing worth
   * scrolling for, and it happens once — a ref rather than state, because
   * recording it must not itself cause a render.
   */
  const centred = useRef(false);
  const { data: people, isFetching: peopleLoading } =
    api.timetable.searchPeople.useQuery(
      { query: personQuery || undefined },
      { enabled: pickerUsed || asUserId !== null },
    );

  const { data: favourites } = api.timetable.favourites.useQuery();

  const toggleFavourite = api.timetable.toggleFavourite.useMutation({
    onSuccess: () => utils.timetable.favourites.invalidate(),
    onError: (error) => toast.error(error.message),
  });
  const viewingAs = data?.viewingAs ?? null;

  /**
   * The one list the picker offers, and what is currently pointed at.
   *
   * Perspectives and people share a shape because they are one choice: "whose
   * schedule am I looking at". The server still keeps them apart — a
   * perspective is a `viewAs` and a person is an `asUserId` — and this is the
   * seam where the two become one control and back again.
   */
  const perspectiveOptions: ViewAsSubject[] = views.map((view) => ({
    kind: "perspective",
    subject: view,
    name: PERSPECTIVE_LABELS[view],
  }));

  const peopleOptions: ViewAsSubject[] = (people?.rows ?? []).map((person) => ({
    kind: "person",
    subject: person.id,
    name: person.name,
    hint: [person.kind === "faculty" ? "Faculty" : "Student", person.detail]
      .filter(Boolean)
      .join(" · "),
  }));

  const favouriteOptions: ViewAsSubject[] = (favourites ?? []).map((row) => ({
    kind: row.kind,
    subject: row.subject,
    name: row.name,
    hint: row.hint,
  }));

  const currentSubject: ViewAsSubject = viewingAs
    ? { kind: "person", subject: viewingAs.id, name: viewingAs.name }
    : {
        kind: "perspective",
        // `viewAs` is what was asked for and `data.viewAs` is what the server
        // settled on; before the first answer lands there is neither, and the
        // first perspective is what it will choose.
        subject: viewAs ?? data?.viewAs ?? views[0] ?? "student",
        name: PERSPECTIVE_LABELS[
          viewAs ?? data?.viewAs ?? views[0] ?? "student"
        ],
      };

  /**
   * Whether the screen has been pointed somewhere by hand, and so has somewhere
   * to come back from.
   *
   * Measured against where it would be sitting anyway, not against whether
   * anything was asked for. Counting the perspectives instead was wrong twice
   * over: somebody with two angles who picks the one already on screen got a
   * cross that undid nothing, and so did somebody who searched up their own
   * name and chose themselves — `asUserId` is set, but the server resolves it
   * to nobody, which is what `viewingAs` being null means. A cross that undoes
   * nothing is a control that has to be read before it can be ignored.
   *
   * `views[0]` is the default the same way `currentSubject` below assumes it
   * is: the server's own choice is only observable while nothing has been
   * asked for, so this is the nearest thing to it the screen can see.
   */
  const pointed =
    viewingAs !== null || (viewAs !== null && viewAs !== views[0]);

  /** Back to whatever the server would have chosen if it had never been asked. */
  const clearSubject = () => {
    setAsUserId(null);
    setViewAs(null);
  };

  /** Points the screen at one of them, whichever kind it is. */
  const pickSubject = (subject: ViewAsSubject) => {
    if (subject.kind === "person") {
      // Somebody else's schedule is described by what *they* are, so the
      // perspective goes with it rather than being carried across.
      setViewAs(null);
      setAsUserId(subject.subject);
      return;
    }
    setAsUserId(null);
    setViewAs(subject.subject as Perspective);
  };

  const canEdit =
    (detail?.modify ?? false) &&
    bits.hasAny(
      PermissionFlags.ManageAllEvents,
      PermissionFlags.ManageOwnEvents,
    );

  /**
   * Opening a class, whichever span it was found in and whichever way in was
   * used. Everybody gets the panel — a class is noticeboard information, and
   * what it *offers* is still decided by what the reader may do.
   */
  const open = (event: DayCalendarEvent, via: "click" | "press") => {
    const full = classes.find((o) => o.occurrenceId === event.id);
    if (!full) return;
    setOpened({ event: toGridEvent(full), via });
  };
  const onEventClick = (event: DayCalendarEvent) => open(event, "click");
  const onEventPress = (event: DayCalendarEvent) => open(event, "press");
  /** A day cell or a week's column heading drops into that day. */
  const dropIntoDay = (day: Date) => {
    setMoved(true);
    setSpan("day");
    setDate(startOfLocalDay(day, timeZone));
  };

  const noun = SPAN_NOUNS[span];

  /**
   * A swipe steps whatever unit is on screen.
   *
   * It goes through `goTo`, so a swipe counts as moving the screen by hand
   * exactly as the arrows do — the caption explaining why the screen opened
   * away from today drops away, and asking for today clears the latch that
   * stops the calendar scrolling to the present.
   */
  const swipeStep = (by: -1 | 1) => goTo(stepSpan(date, span, by, timeZone));

  /** What a screen reader is told after a flick has moved the screen. */
  const announceSpan =
    span === "day"
      ? formatFullDate(date, timeZone)
      : formatMonthLabel(
          toWallTime(date, timeZone).year,
          toWallTime(date, timeZone).month,
        );
  const busyDays = new Set(
    blocks.map((b) => startOfLocalDay(b.start, timeZone).getTime()),
  ).size;

  /** Which answer draws the span `offset` steps from the one being read. */
  const paneFor = (offset: Offset) =>
    offset === 0
      ? { at: date, from: data, stale, failed: isError, retry: refetch }
      : offset === -1
        ? {
            at: beforeDate,
            from: before.data,
            stale: before.isPending,
            failed: before.isError,
            retry: before.refetch,
          }
        : {
            at: afterDate,
            from: after.data,
            stale: after.isPending,
            failed: after.isError,
            retry: after.refetch,
          };

  /**
   * One pane of the rail: the span on screen at `offset`, drawn from its own
   * answer.
   *
   * The same branches this screen has always had — waiting, failed, month,
   * week, day, empty — asked once per pane instead of once. Off the rail there
   * is only ever pane zero, so a laptop renders exactly what it rendered
   * before.
   */
  const drawPane = (offset: Offset) => {
    const it = paneFor(offset);
    const current = offset === 0;
    const paneBlocks = current ? blocks : blocksOf(it.from);
    const weeks = monthLayout(it.at, paneBlocks, now, timeZone).weeks;

    if (it.stale) {
      // Sized from the window the last answer left behind, so the page does not
      // change height underneath whoever is reading it.
      return span === "day" ? (
        <DaySkeleton startHour={frame.startHour} endHour={frame.endHour} />
      ) : span === "week" ? (
        <WeekSkeleton
          days={weekDays}
          timeZone={timeZone}
          now={now}
          startHour={frame.startHour}
          endHour={frame.endHour}
        />
      ) : (
        <MonthSkeleton weeks={weeks} timeZone={timeZone} />
      );
    }

    /*
      A failed request is not an empty week. Without this branch the screen
      falls through to the card below and says "You have no classes of your
      own", which is the same untruth the skeleton was added to stop — stated
      with more confidence, because it reads as an answer rather than a wait.

      Not folded into the waiting branch: a skeleton that spins for ever is
      worse than either. An error has to say it is an error.
    */
    if (it.failed && !it.from) {
      return (
        <Card>
          <p className="text-title m-0 text-[14px] font-semibold">
            This {noun} could not be loaded.
          </p>
          <p className="text-muted mt-1 mb-3 text-[13px]">
            Nothing is wrong with your timetable — the request did not get
            through. It will try again on its own in a minute.
          </p>
          <button
            type="button"
            onClick={() => void it.retry()}
            className="min-h-10 cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold lg:min-h-0"
            style={{
              background: "rgba(68,88,121,0.07)",
              color: "var(--slate)",
            }}
          >
            Try again now
          </button>
        </Card>
      );
    }

    // The month draws its own empty days, so it stands whether or not anything
    // is on it — an empty month grid is a true and useful answer, where an
    // empty day column is just a blank.
    if (span === "month") {
      return (
        <MonthGrid
          weeks={weeks}
          timeZone={timeZone}
          now={now}
          onDayClick={dropIntoDay}
          onEventClick={onEventClick}
          onEventPress={onEventPress}
        />
      );
    }

    if (span === "week") {
      return (
        <WeekCalendar
          events={paneBlocks}
          days={weekDays}
          timeZone={timeZone}
          now={now}
          onEventClick={onEventClick}
          onEventPress={onEventPress}
          onDayClick={dropIntoDay}
        />
      );
    }

    const empty = paneBlocks.length === 0;
    const nothing =
      (it.from?.views ?? []).length === 0
        ? "You have no classes of your own — the full timetable is on the Timetable screen."
        : "Nothing scheduled for this day.";

    /*
     * A day with nothing on it is a sentence when it stands alone, and a grid
     * when it is on the rail.
     *
     * Alone, ruled lines from eight to six saying nothing are worse than a
     * sentence saying it. On the rail the grid is the point: the hour axis runs
     * continuously under a finger dragging across all three days, and a
     * Saturday that swapped it for a short card would collapse the page
     * mid-swipe and then grow back — which is the jump this whole design is
     * spent on not having. So the sentence is laid over the empty day instead.
     */
    if (empty && !onRail) {
      return (
        <Card>
          <p className="text-muted m-0 text-[14px]">{nothing}</p>
        </Card>
      );
    }

    return (
      <div className="relative">
        <DayCalendar
          events={paneBlocks}
          timeZone={timeZone}
          now={now}
          isToday={isSameLocalDay(it.at, now, timeZone)}
          // One window for the whole rail, so the hour axis holds still under a
          // finger dragging across it.
          frame={onRail ? frame : undefined}
          // Only the day being read may move the page. A neighbour scrolling
          // the reader to its own now-line is the page jumping for a day that
          // is not even on screen.
          centreOnNow={current && !centred.current}
          onCentred={current ? () => (centred.current = true) : undefined}
          onEventClick={onEventClick}
          onEventPress={onEventPress}
        />
        {empty && (
          <p className="text-muted pointer-events-none absolute inset-x-0 top-1/2 m-0 -translate-y-1/2 px-6 text-center text-[14px]">
            {nothing}
          </p>
        )}
      </div>
    );
  };

  return (
    // The drawer is a column beside the calendar from `lg`, and below it falls
    // in underneath: it is an ordinary item in this box, not a sheet over the
    // page, so the box has to stop being a row or the two would share one line
    // and the calendar would collapse to nothing beside a full-width panel.
    //
    // `min-h-screen` comes in with the docking, for the same reason it does on
    // the timetable: below lg it would add the hamburger bar's height to a full
    // screen and leave a phone scrolling past the end of the day.
    <div className="flex flex-col lg:min-h-screen lg:flex-row lg:items-start">
      {/*
        The calendar keeps its place at every width — it is what the drawer
        opens beside on a laptop, and what it opens under on a phone.
      */}
      <div className="min-w-0 flex-1">
        <PageHeader
          title="Schedule"
          subtitle={[
            viewingAs ? `${viewingAs.name}'s ${noun}` : null,
            // Why the screen is not on today. Drops away the moment the window
            // is stepped by hand, because from then on it is not a surprise —
            // and it asks whether *now* is in view rather than whether the day
            // is today, since on a Monday morning a week view is showing now.
            //
            // Backwards is the half-hour grace after a class that ended near
            // midnight still holding its own day: rare, but "the next class"
            // would be a plain untruth about a day that has already happened.
            !moved && !spanHolds(date, span, now, timeZone)
              ? date > now
                ? span === "day"
                  ? "Opened on the next class"
                  : `Opened on the ${noun} of your next class`
                : span === "day"
                  ? "Opened on your last class"
                  : `Opened on the ${noun} of your last class`
              : null,
            // The count is the previous window's until the new one lands, and
            // "4 classes" above an empty calendar is the same lie in words.
            stale ? "Loading…" : countPhrase(classes.length, busyDays, span),
            // Said out loud rather than quietly showing a short month: the cap
            // is a backstop, but a calendar missing sittings has to say so.
            data?.truncated ? "Too many classes to draw them all" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <div className="px-4 pt-3 pb-10 sm:px-6 lg:px-9">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {/*
             * First, because it changes what every other control in the row
             * means, and a control that redefines its neighbours belongs
             * upstream of them. A whole line to itself on a phone: three pills
             * come to about 200px, which shares a line with nothing that also
             * has to hold a date.
             */}
            <div className="w-full sm:w-auto">
              {/*
               * Changing the span deliberately does not count as moving. The
               * anchor stays exactly where it was — only how much of the
               * calendar around it is drawn changes — so the caption explaining
               * why the screen opened away from today is still owed. Consuming
               * it here left the week and month strings below unreachable, and
               * the surprise they exist to explain unexplained.
               */}
              <Segmented
                items={SPAN_ITEMS}
                value={span}
                onChange={setSpan}
                size="sm"
              />
            </div>

            <DayNavigator
              date={date}
              span={span}
              timeZone={timeZone}
              onChange={goTo}
            />
          </div>

          {/*
           * A line of its own, and not because it would not fit — though at
           * four controls it would not. "View as" changes whose schedule the
           * whole screen is about, which is a different order of thing from
           * stepping a day, and the favourites beside it need room to be
           * tapped rather than a gap at the end of a row.
           */}
          <div className="mb-4">
            <ViewAs
              current={currentSubject}
              perspectives={perspectiveOptions}
              people={peopleOptions}
              favourites={favouriteOptions}
              total={people?.total ?? 0}
              query={personQuery}
              onQueryChange={setPersonQuery}
              onOpen={() => setPickerUsed(true)}
              onPick={pickSubject}
              onClear={pointed ? clearSubject : undefined}
              onToggleFavourite={(subject, on) =>
                toggleFavourite.mutate({
                  kind: subject.kind,
                  subject: subject.subject,
                  on,
                })
              }
              loading={peopleLoading}
            />
          </div>

          <SpanCarousel
            live={live}
            at={`${span}:${date.toISOString()}`}
            onStep={swipeStep}
            announce={announceSpan}
            noun={noun}
            pane={drawPane}
          />
        </div>
      </div>

      {opened &&
        (() => {
          const Frame = opened.via === "press" ? EventModal : EventDrawer;
          return (
            <Frame
              event={opened.event}
              timeZone={timeZone}
              canEdit={canEdit}
              canMarkAttendance={canMarkAttendance}
              onClose={() => setOpened(null)}
              onChanged={async () => {
                await utils.timetable.invalidate();
                router.refresh();
              }}
            />
          );
        })()}
    </div>
  );
}

/**
 * How much is on. "Across N days" is the number that actually helps on a wide
 * span: forty-eight classes tells you nothing a month grid has not already
 * shown, and nineteen busy days out of thirty does.
 */
function countPhrase(
  count: number,
  busyDays: number,
  span: ScheduleSpan,
): string {
  if (count === 0) {
    return span === "day"
      ? "Nothing scheduled"
      : `Nothing scheduled this ${SPAN_NOUNS[span]}`;
  }
  const classes = `${count} class${count === 1 ? "" : "es"}`;
  if (span === "day" || busyDays <= 1) return classes;
  return `${classes} across ${busyDays} days`;
}

/** The drawer speaks the grid's language, so a class is translated on the way in. */
function toGridEvent(o: Schedule["occurrences"][number]): GridEvent {
  return {
    occurrenceId: o.occurrenceId,
    eventId: o.eventId,
    roomId: o.roomId,
    start: o.start,
    end: o.end,
    originalStart: o.originalStart,
    title: o.title,
    isRecurring: o.isRecurring,
    kind: o.kind,
    roomCode: o.roomCode,
    facultyName: o.facultyName,
    groupNames: o.cohorts.map((c) => c.name),
    attendanceMarked: o.attendanceMarked,
  };
}
