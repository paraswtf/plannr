/**
 * Projecting the live timetable onto a plan's weekly grid.
 *
 * A plan thinks in weekdays and minutes; the timetable thinks in instants. This
 * is the one place the two meet. Occurrences from the plan's anchor week are
 * read in the org's timezone and flattened into weekly busy blocks, which is
 * what lets the solver schedule *around* what is already timetabled instead of
 * proposing a week that collides with it on day one.
 *
 * A class that runs past midnight would occupy two weekdays; that cannot happen
 * inside a working day, so it is clipped to the day it starts on rather than
 * silently wrapping.
 */

import { addDays, isoWeekday, minutesOfDay, startOfLocalDay } from "~/lib/dates";
import { OCCUPYING_STATUSES } from "../conflicts";
import type { Db } from "../occurrences";
import type { BusyBlock } from "./solve";

export interface LiveWeekQuery {
  orgId: string;
  /** Any instant inside the week to read. */
  weekStart: Date;
  timeZone: string;
  /** Occurrences belonging to these events are ignored — the plan's own. */
  ignoreEventIds?: string[];
}

/** The Monday of the week containing `instant`, at local midnight. */
export function mondayOf(instant: Date, timeZone: string): Date {
  const day = startOfLocalDay(instant, timeZone);
  return addDays(day, 1 - isoWeekday(day, timeZone), timeZone);
}

/**
 * What is already timetabled during the plan's anchor week, as weekly blocks.
 *
 * Only CLASS and BLOCK occurrences count as immovable. Ad-hoc bookings are
 * left out on purpose: a study-room reservation should not stop a term's
 * teaching being planned, and applying the plan re-checks every slot against
 * live data anyway.
 */
export async function loadLiveWeek(
  db: Db,
  query: LiveWeekQuery,
): Promise<BusyBlock[]> {
  const from = mondayOf(query.weekStart, query.timeZone);
  const to = addDays(from, 7, query.timeZone);

  const occurrences = await db.eventOccurrence.findMany({
    where: {
      orgId: query.orgId,
      status: { in: [...OCCUPYING_STATUSES] },
      kind: { in: ["CLASS", "BLOCK"] },
      start: { lt: to },
      end: { gt: from },
      ...(query.ignoreEventIds?.length
        ? { eventId: { notIn: query.ignoreEventIds } }
        : {}),
    },
    select: {
      start: true,
      end: true,
      roomId: true,
      groupId: true,
      facultyId: true,
      event: { select: { title: true } },
    },
    orderBy: { start: "asc" },
  });

  return occurrences.map((o) => {
    const dayOfWeek = isoWeekday(o.start, query.timeZone);
    const startMinutes = minutesOfDay(o.start, query.timeZone);
    const rawEnd = minutesOfDay(o.end, query.timeZone);
    // An end at or before the start means it crossed midnight; clip to the day.
    const endMinutes = rawEnd > startMinutes ? rawEnd : 24 * 60;

    return {
      dayOfWeek,
      startMinutes,
      endMinutes,
      roomId: o.roomId,
      groupId: o.groupId,
      facultyIds: o.facultyId ? [o.facultyId] : [],
      label: o.event.title,
    };
  });
}
