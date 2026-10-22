/**
 * Materialisation of recurring events into `EventOccurrence` rows.
 *
 * Every write to an Event or its exceptions must call `regenerateOccurrences`
 * inside the *same* transaction. That is the single invariant this table
 * depends on: readers (the grid, conflict checks, availability) then never have
 * to think about recurrence rules or exceptions at all.
 *
 * Regeneration deletes and rebuilds rather than diffing. A series is capped at
 * 500 occurrences, so correctness is worth more than the saved writes.
 */

import type {
  EventStatus,
  Prisma,
  PrismaClient,
} from "../../../generated/prisma";
import { ExceptionType } from "../../../generated/prisma";

import { expandSeries, hasCount, setCount, setUntil } from "~/lib/recurrence";
import { enqueueForEvent } from "./calendar/sync";
import { pushEnabled } from "./push/config";
import { recordClassChanges } from "./push/record";
import type { Sitting } from "./push/diff";

/** Prisma client or an interactive transaction — services accept either. */
export type Db = PrismaClient | Prisma.TransactionClient;

export interface RegenerateResult {
  written: number;
  prunedExceptions: number;
}

/**
 * Rebuilds every occurrence row for one event.
 *
 * Exceptions are matched to natural occurrences by `originalStart`. Cancelled
 * occurrences are still written (with CANCELLED status) so the UI can show a
 * ghost and offer to restore them; scheduling queries filter them out.
 * Exceptions whose anchor no longer exists — because the series was retimed —
 * are deleted, otherwise they would silently suppress the wrong dates.
 */
export async function regenerateOccurrences(
  db: Db,
  eventId: string,
): Promise<RegenerateResult> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { exceptions: true },
  });
  if (!event)
    throw new Error(`Cannot regenerate occurrences: no event ${eventId}`);

  const natural = expandSeries({
    startTime: event.startTime,
    endTime: event.endTime,
    timezone: event.timezone,
    rrule: event.rrule,
  });

  const byOriginalStart = new Map(
    event.exceptions.map((e) => [e.originalStart.getTime(), e]),
  );

  const rows: Prisma.EventOccurrenceCreateManyInput[] = [];
  const matchedExceptionIds = new Set<string>();

  for (const { start, end } of natural) {
    const exception = byOriginalStart.get(start.getTime());
    if (exception) matchedExceptionIds.add(exception.id);

    if (exception?.type === ExceptionType.CANCELLED) {
      rows.push({
        orgId: event.orgId,
        eventId: event.id,
        start,
        end,
        roomId: event.roomId,
        groupId: event.groupId,
        facultyId: event.facultyId,
        kind: event.kind,
        status: "CANCELLED",
        exceptionId: exception.id,
      });
      continue;
    }

    rows.push({
      orgId: event.orgId,
      eventId: event.id,
      start: exception?.newStartTime ?? start,
      end: exception?.newEndTime ?? end,
      roomId: exception?.newRoomId ?? event.roomId,
      groupId: event.groupId,
      facultyId: exception?.newFacultyId ?? event.facultyId,
      kind: event.kind,
      status: event.status,
      exceptionId: exception?.id ?? null,
    });
  }

  const orphanIds = event.exceptions
    .filter((e) => !matchedExceptionIds.has(e.id))
    .map((e) => e.id);

  // Read before the delete: once the rows are gone there is nothing to compare
  // the new ones with, and "what changed" is the whole of a push notification.
  const sittingsBefore: Sitting[] = pushEnabled()
    ? await db.eventOccurrence.findMany({
        where: { eventId },
        select: {
          start: true,
          end: true,
          roomId: true,
          facultyId: true,
          status: true,
        },
      })
    : [];

  await db.eventOccurrence.deleteMany({ where: { eventId } });
  if (orphanIds.length) {
    await db.eventException.deleteMany({ where: { id: { in: orphanIds } } });
  }
  if (rows.length) {
    await db.eventOccurrence.createMany({ data: rows });
  }

  // Everyone whose Google Calendar mirrors this event is now out of date.
  //
  // Here, and not in the routers, for the same reason regeneration itself is
  // here: this function is the one place every write to a series passes
  // through, so a new caller cannot forget it. It enqueues rows in the caller's
  // transaction and talks to nobody — the cron does the talking — so a Google
  // outage can never fail an edit to the timetable.
  await enqueueForEvent(db, eventId);

  // And everyone with a phone in their pocket is told what changed, by the same
  // rule: queued here, in this transaction, sent after the response.
  if (await recordClassChanges(db, event, sittingsBefore, rows as Sitting[])) {
    await sendAfterResponse();
  }

  return { written: rows.length, prunedExceptions: orphanIds.length };
}

/** The fields a series edit may change. Deliberately narrower than Prisma's
 * update input so a caller cannot rewrite `orgId` or detach the event. */
export interface SeriesEdits {
  title?: string;
  roomId?: string;
  groupId?: string | null;
  facultyId?: string | null;
  startTime?: Date;
  endTime?: Date;
  rrule?: string | null;
  notes?: string | null;
  status?: EventStatus;
}

/**
 * Splits a series at `pivotStart` for a "this and following events" edit.
 *
 * The original series is truncated to end before the pivot, a new series
 * carrying the edits starts at it, and any exceptions from the pivot onwards
 * move to the new series. Both halves are regenerated. Returns the new event's
 * id so callers can report or navigate to it.
 */
export async function splitSeriesAt(
  db: Db,
  eventId: string,
  pivotStart: Date,
  edits: SeriesEdits = {},
): Promise<string> {
  const original = await db.event.findUnique({
    where: { id: eventId },
    include: { exceptions: true },
  });
  if (!original) throw new Error(`Cannot split: no event ${eventId}`);
  if (!original.rrule) throw new Error("Cannot split a non-recurring event");

  // A counted series must hand the second half only the occurrences that are
  // left; inheriting the original COUNT would make the split produce more
  // meetings than the series ever had. UNTIL needs no such adjustment, since an
  // absolute end date stays true on both sides.
  const remaining = expandSeries({
    startTime: original.startTime,
    endTime: original.endTime,
    timezone: original.timezone,
    rrule: original.rrule,
  }).filter((o) => o.start >= pivotStart).length;

  const inheritedRrule = hasCount(original.rrule)
    ? setCount(original.rrule, remaining)
    : original.rrule;

  // One minute before the pivot, so the pivot itself belongs to the new half.
  const until = new Date(pivotStart.getTime() - 60_000);

  await db.event.update({
    where: { id: eventId },
    data: { rrule: setUntil(original.rrule, until, original.timezone) },
  });

  const durationMs = original.endTime.getTime() - original.startTime.getTime();
  const startTime = edits.startTime ?? pivotStart;
  const created = await db.event.create({
    data: {
      orgId: original.orgId,
      kind: original.kind,
      status: edits.status ?? original.status,
      title: edits.title ?? original.title,
      roomId: edits.roomId ?? original.roomId,
      groupId: edits.groupId === undefined ? original.groupId : edits.groupId,
      facultyId:
        edits.facultyId === undefined ? original.facultyId : edits.facultyId,
      semesterId: original.semesterId,
      createdById: original.createdById,
      startTime,
      endTime: edits.endTime ?? new Date(startTime.getTime() + durationMs),
      timezone: original.timezone,
      rrule: edits.rrule === undefined ? inheritedRrule : edits.rrule,
      notes: edits.notes === undefined ? original.notes : edits.notes,
    },
  });

  const movingIds = original.exceptions
    .filter((e) => e.originalStart.getTime() >= pivotStart.getTime())
    .map((e) => e.id);
  if (movingIds.length) {
    await db.eventException.updateMany({
      where: { id: { in: movingIds } },
      data: { eventId: created.id },
    });
  }

  await regenerateOccurrences(db, eventId);
  await regenerateOccurrences(db, created.id);

  return created.id;
}

/**
 * Asks for the queued notices to be sent once the response has gone.
 *
 * `after` runs when the request that made the edit has finished, which is after
 * its transaction committed; if the edit rolled back there is nothing queued
 * and the dispatcher finds nothing. Outside a request (a script, a test) there
 * is no `after`, and the hourly cron sweep sends them instead.
 */
async function sendAfterResponse() {
  try {
    const { after } = await import("next/server");
    after(async () => {
      const [{ db }, { dispatchPending }] = await Promise.all([
        import("~/server/db"),
        import("./push/dispatch"),
      ]);
      await dispatchPending(db).catch(() => undefined);
    });
  } catch {
    // Not inside a request: left for the cron.
  }
}
