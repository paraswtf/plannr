"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "~/components/app/shell/page-header";
import { DayNavigator } from "~/components/app/timetable/day-navigator";
import { EventDrawer } from "~/components/app/timetable/event-drawer";
import type { GridEvent } from "~/components/app/timetable/timetable-grid";
import { useNow } from "~/components/app/timetable/use-now";
import { Card } from "~/components/ui/card";
import { SearchSelect } from "~/components/ui/entity-picker";
import { Select } from "~/components/ui/select";
import { isSameLocalDay } from "~/lib/dates";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import {
  describeClass,
  PERSPECTIVE_LABELS,
  type Perspective,
} from "~/lib/schedule-views";
import { api, type RouterOutputs } from "~/trpc/react";
import { CalendarSync } from "./calendar-sync";
import { DayCalendar } from "./day-calendar";
import { dayWindow } from "./day-layout";
import { DaySkeleton } from "./day-skeleton";

type Schedule = RouterOutputs["timetable"]["mySchedule"];

/** The chooser's own entry for "not one of my own angles". */
const SOMEONE_ELSE = "__someone";

/**
 * The schedule: one day, from whichever angle you are involved in it.
 *
 * The calendar is the same for everybody — the day drawn top to bottom with a
 * line across the present — and the perspective decides what is written on each
 * class and whether it can be opened. Somebody who is only one thing never sees
 * the chooser; somebody who teaches and coordinates, or studies and administers,
 * switches between their own answers to "what am I doing today?".
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

  const [date, setDate] = useState(() => new Date(initial.from));
  /**
   * Whether the day on screen was chosen by the person reading it.
   *
   * The screen opens on the day of the next class, which on a Friday evening is
   * Monday — a jump nobody asked for and, unexplained, one that reads as the
   * app having lost today. Saying so is only honest until they move the day
   * themselves — with `Today`, the arrows, the date or a tab — after which it
   * is their choice and needs no caption.
   */
  const [moved, setMoved] = useState(false);
  const goTo = (day: Date) => {
    setMoved(true);
    setDate(day);
  };
  /** Whose day is on screen, when it is not your own. */
  const [asUserId, setAsUserId] = useState<string | null>(null);
  const [pickingPerson, setPickingPerson] = useState(false);
  const [personQuery, setPersonQuery] = useState("");
  // Null means "however the server chose", which is what the page was rendered
  // with; picking from the dropdown is what makes it explicit.
  const [viewAs, setViewAs] = useState<Perspective | null>(null);
  const [opened, setOpened] = useState<GridEvent | null>(null);

  // Seeded only for the day and angle the page was rendered with. Handing the
  // same data to every other key would make it look answered — the client holds
  // results for half a minute — and changing the date or the perspective would
  // appear to do nothing at all.
  const isRendered =
    viewAs === null &&
    asUserId === null &&
    date.getTime() === new Date(initial.from).getTime();

  const { data, isPending, isPlaceholderData, isError, refetch } =
    api.timetable.mySchedule.useQuery(
      { date, viewAs: viewAs ?? undefined, asUserId: asUserId ?? undefined },
      {
        initialData: isRendered ? initial : undefined,
        // The previous day's response is held on to, but only for the frame it
        // came in: the timezone, the perspectives on offer, whose day this is.
        // None of those change from one day to the next, so keeping them stops
        // the toolbar collapsing and rebuilding on every step.
        //
        // The classes are a different matter and are hidden until they are this
        // day's — see `stale` below.
        placeholderData: (previous) => previous,
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
      },
    );

  /**
   * Whether what is in `data` belongs to the day (or person) now being asked
   * about. Placeholder data is the previous key's answer, and a previous day's
   * lectures drawn under today's date cannot be told apart from real ones — so
   * while this is true the calendar gives way to a skeleton rather than lying
   * quietly.
   */
  const stale = isPending || isPlaceholderData;

  const timeZone = data?.timeZone ?? "Asia/Kolkata";
  const views = data?.views ?? [];
  const detail = data?.detail ?? null;
  const classes = data?.occurrences ?? [];

  // The hours the day spans. Taken from whatever is in hand — the previous day
  // while the next loads — because the skeleton and the calendar have to agree
  // on the page's height or the switch shows up as a jump.
  const frame = dayWindow(
    classes,
    isSameLocalDay(date, now, timeZone) ? now : null,
    timeZone,
  );

  const bits = new PermissionBitField(BigInt(permissions));
  const canMarkAttendance = bits.has(PermissionFlags.MarkAttendance);
  // Looking at a named individual's day needs more than seeing the timetable.
  const canViewOthers = bits.hasAll(
    PermissionFlags.ViewAllEvents,
    PermissionFlags.ViewUsers,
  );

  // Live for as long as the picker is on screen. Switching it off once
  // somebody is chosen is exactly when it is needed: to choose somebody else.
  const { data: people } = api.timetable.peopleWithSchedules.useQuery(
    { query: personQuery || undefined },
    { enabled: canViewOthers && (pickingPerson || asUserId !== null) },
  );
  const viewingAs = data?.viewingAs ?? null;
  const canEdit =
    (detail?.modify ?? false) &&
    bits.hasAny(PermissionFlags.ManageAllEvents, PermissionFlags.ManageOwnEvents);

  const openable = canEdit || canMarkAttendance;

  return (
    // The drawer is a column beside the day from `lg`, and below it falls in
    // underneath: it is an ordinary item in this box, not a sheet over the
    // page, so the box has to stop being a row or the two would share one line
    // and the day would collapse to nothing beside a full-width panel.
    //
    // `min-h-screen` comes in with the docking, for the same reason it does on
    // the timetable: below lg it would add the hamburger bar's height to a full
    // screen and leave a phone scrolling past the end of the day.
    <div className="flex flex-col lg:min-h-screen lg:flex-row lg:items-start">
      {/*
        The day keeps its place at every width — it is what the drawer opens
        beside on a laptop, and what it opens under on a phone.
      */}
      <div className="min-w-0 flex-1">
        <PageHeader
          title="Schedule"
          subtitle={[
            viewingAs ? `${viewingAs.name}'s day` : null,
            // Why the screen is not on today. Drops away the moment the day is
            // stepped by hand, because from then on it is not a surprise.
            //
            // Backwards is the half-hour grace after a class that ended near
            // midnight still holding its own day: rare, but "the next class"
            // would be a plain untruth about a day that has already happened.
            !moved && !isSameLocalDay(date, now, timeZone)
              ? date > now
                ? "Opened on the next class"
                : "Opened on your last class"
              : null,
            // The count is the previous day's until the new one lands, and
            // "4 classes" above an empty calendar is the same lie in words.
            stale
              ? "Loading…"
              : classes.length > 0
                ? `${classes.length} class${classes.length === 1 ? "" : "es"}`
                : "Nothing scheduled",
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <div className="px-4 pt-3 pb-10 sm:px-6 lg:px-9">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <DayNavigator date={date} timeZone={timeZone} onChange={goTo} />

            {/*
              Only on your own day. Somebody else's classes are not yours to
              put in your calendar, and the control would be claiming to sync
              whatever is currently on screen.
            */}
            {!viewingAs && <CalendarSync />}

            {(views.length > 1 || canViewOthers) && (
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <span className="text-faint font-mono text-[12px]">view as</span>
                <Select
                  value={
                    viewingAs || pickingPerson
                      ? SOMEONE_ELSE
                      : (viewAs ?? data?.viewAs ?? views[0] ?? SOMEONE_ELSE)
                  }
                  options={[
                    ...views.map((view) => ({
                      value: view,
                      label: PERSPECTIVE_LABELS[view],
                    })),
                    ...(canViewOthers
                      ? [{ value: SOMEONE_ELSE, label: "Someone else…" }]
                      : []),
                  ]}
                  onChange={(value) => {
                    if (value === SOMEONE_ELSE) {
                      setPickingPerson(true);
                      return;
                    }
                    setPickingPerson(false);
                    setAsUserId(null);
                    setViewAs(value as Perspective);
                  }}
                  size="sm"
                  ariaLabel="View this schedule as"
                />

                {(pickingPerson || viewingAs) && (
                  <div className="w-full sm:w-[260px]">
                    <SearchSelect
                      value={
                        viewingAs
                          ? { id: viewingAs.id, label: viewingAs.name }
                          : null
                      }
                      onChange={(id) => {
                        setAsUserId(id);
                        // Stay in person mode either way: clearing goes back to
                        // an open picker, not out of it.
                        setPickingPerson(true);
                        setPersonQuery("");
                      }}
                      page={{
                        rows: (people ?? []).map((person) => ({
                          id: person.id,
                          label: person.name,
                          hint: [
                            person.kind === "faculty" ? "Faculty" : "Student",
                            person.detail,
                          ]
                            .filter(Boolean)
                            .join(" · "),
                        })),
                        total: people?.length ?? 0,
                        hasMore: (people?.length ?? 0) >= 30,
                      }}
                      query={personQuery}
                      onQueryChange={setPersonQuery}
                      placeholder="Search students and staff…"
                      emptyOption="Back to my own day"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {stale ? (
            // Sized from the window the last day left behind, so the page does
            // not change height underneath whoever is reading it.
            <DaySkeleton startHour={frame.startHour} endHour={frame.endHour} />
          ) : isError && !data ? (
            /*
              A failed request is not an empty day. Without this branch the
              screen falls through to the card below and says "You have no
              classes of your own", which is the same untruth the skeleton was
              added to stop — stated with more confidence, because it reads as
              an answer rather than a wait.

              Not folded into `stale`: a skeleton that spins for ever is worse
              than either. An error has to say it is an error.
            */
            <Card>
              <p className="text-title m-0 text-[14px] font-semibold">
                This day could not be loaded.
              </p>
              <p className="text-muted mt-1 mb-3 text-[13px]">
                Nothing is wrong with your timetable — the request did not get
                through. It will try again on its own in a minute.
              </p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="min-h-10 cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold lg:min-h-0"
                style={{ background: "rgba(68,88,121,0.07)", color: "var(--slate)" }}
              >
                Try again now
              </button>
            </Card>
          ) : classes.length > 0 && detail ? (
            <DayCalendar
              events={classes.map((o) => ({
                id: o.occurrenceId,
                start: o.start,
                end: o.end,
                title: o.title,
                roomCode: o.roomCode,
                lines: describeClass(o, detail),
              }))}
              timeZone={timeZone}
              now={now}
              isToday={isSameLocalDay(date, now, timeZone)}
              onEventClick={
                openable
                  ? (event) => {
                      const full = classes.find(
                        (o) => o.occurrenceId === event.id,
                      );
                      if (!full) return;
                      if (!canEdit && canMarkAttendance) {
                        router.push(`/attendance/${full.occurrenceId}`);
                        return;
                      }
                      setOpened(toGridEvent(full));
                    }
                  : undefined
              }
            />
          ) : (
            <Card>
              <p className="text-muted m-0 text-[14px]">
                {views.length === 0
                  ? "You have no classes of your own — the full timetable is on the Timetable screen."
                  : "Nothing scheduled for this day."}
              </p>
            </Card>
          )}
        </div>
      </div>

      {opened && (
        <EventDrawer
          event={opened}
          timeZone={timeZone}
          canEdit={canEdit}
          canMarkAttendance={canMarkAttendance}
          onClose={() => setOpened(null)}
          onChanged={async () => {
            await utils.timetable.invalidate();
            router.refresh();
          }}
        />
      )}
    </div>
  );
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
  };
}
