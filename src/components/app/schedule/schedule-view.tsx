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
import { DayCalendar } from "./day-calendar";

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

  const { data } = api.timetable.mySchedule.useQuery(
    { date, viewAs: viewAs ?? undefined, asUserId: asUserId ?? undefined },
    {
      initialData: isRendered ? initial : undefined,
      // Keep the day on screen while the next one loads, rather than blinking.
      placeholderData: (previous) => previous,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  );

  const timeZone = data?.timeZone ?? "Asia/Kolkata";
  const views = data?.views ?? [];
  const detail = data?.detail ?? null;
  const classes = data?.occurrences ?? [];

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
    <div className="flex min-h-screen items-start">
      <div className="min-w-0 flex-1">
        <PageHeader
          title="Schedule"
          subtitle={[
            viewingAs ? `${viewingAs.name}'s day` : null,
            classes.length > 0
              ? `${classes.length} class${classes.length === 1 ? "" : "es"}`
              : "Nothing scheduled",
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <div className="px-9 pt-3 pb-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <DayNavigator date={date} timeZone={timeZone} onChange={setDate} />

            {(views.length > 1 || canViewOthers) && (
              <div className="flex flex-wrap items-center gap-2">
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
                  <div className="w-[260px]">
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

          {classes.length > 0 && detail ? (
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
