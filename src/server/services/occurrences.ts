/**
 * Materialisation of recurring events into `EventOccurrence` rows.
 *
 * Every write to an Event or its exceptions must call `regenerateOccurrences`
 * inside the *same* transaction. That is the single invariant this table
 * depends on: readers (the grid, conflict checks, availability) then never have
 * to think about recurrence rules or exceptions at all.
 *
 * Regeneration reconciles rather than rebuilding: each sitting is the row for
 * one natural start (its `originalStart`), and keeps that row, and its id,
 * across every edit that leaves the natural start where it was. That is not an
 * optimisation. Registers hang off occurrence ids (`AttendanceSession` cascades
 * from `EventOccurrence`), so a rebuild that deleted and recreated the rows
 * deleted every register ever taken for the class, on any edit at all.
 */

import type {
  EventStatus,
  Prisma,
  PrismaClient,
} from "../../../generated/prisma";
import { ExceptionType } from "../../../generated/prisma";

import { expandSeries, hasCount, setCount, setUntil } from "~/lib/recurrence";
import { enqueueForEvent } from "./calendar/sync";
import { dispatchAfterResponse } from "./notifications/notify";
import { recordClassChanges } from "./push/record";
import type { Sitting } from "./push/diff";

/** Prisma client or an interactive transaction — services accept either. */
export type Db = PrismaClient | Prisma.TransactionClient;

export interface RegenerateResult {
  written: number;
  prunedExceptions: number;
}

/**
 * Brings every occurrence row for one event into line with its rule and its
 * exceptions.
 *
 * Exceptions are matched to natural occurrences by `originalStart`. Cancelled
 * occurrences are still written (with CANCELLED status) so the UI can show a
 * ghost and offer to restore them; scheduling queries filter them out.
 * Exceptions whose anchor no longer exists (because the series was retimed)
 * are deleted, otherwise they would silently suppress the wrong dates.
 *
 * Rows are matched to the sittings they stand for by natural start: a row that
 * still has its sitting is updated where it differs, a sitting with no row gets
 * one, and a row whose sitting no longer exists is deleted, unless a register
 * has been taken on it. Then it is history, kept as it was rather than erased
 * along with the attendance it carries.
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
  /** The natural start each row in `rows` stands for, by index. */
  const keys: number[] = [];
  const matchedExceptionIds = new Set<string>();

  for (const { start, end } of natural) {
    keys.push(start.getTime());
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

  // Read before anything changes: this is what the sittings were, which is
  // both what the rows are matched against and, for a class-change
  // notification, the "before" of what changed.
  const existing = await db.eventOccurrence.findMany({
    where: { eventId },
    select: {
      id: true,
      start: true,
      end: true,
      roomId: true,
      groupId: true,
      facultyId: true,
      kind: true,
      status: true,
      exceptionId: true,
      exception: { select: { originalStart: true } },
      _count: { select: { attendance: true } },
    },
  });
  const sittingsBefore: Sitting[] = existing.map((row) => ({
    start: row.start,
    end: row.end,
    roomId: row.roomId,
    facultyId: row.facultyId,
    status: row.status,
  }));

  // A row's sitting is its exception's original start, or its own start when
  // it has no exception (an unmodified sitting sits where the rule put it).
  const byKey = new Map<number, (typeof existing)[number]>();
  for (const row of existing) {
    const key = (row.exception?.originalStart ?? row.start).getTime();
    if (!byKey.has(key)) byKey.set(key, row);
  }

  const creates: Prisma.EventOccurrenceCreateManyInput[] = [];
  const kept = new Set<string>();
  // Updates grouped by what they change, so a series-wide edit (a new room for
  // every sitting) is one statement rather than one per sitting.
  const updates = new Map<string, { data: OccurrenceFields; ids: string[] }>();
  rows.forEach((row, index) => {
    const current = byKey.get(keys[index]!);
    if (!current || kept.has(current.id)) {
      creates.push(row);
      return;
    }
    kept.add(current.id);
    const data = changedFields(current, row);
    if (!data) return;
    const signature = JSON.stringify(data);
    const group = updates.get(signature) ?? { data, ids: [] };
    group.ids.push(current.id);
    updates.set(signature, group);
  });

  const leftOver = existing.filter((row) => !kept.has(row.id));
  const history = leftOver.filter((row) => row._count.attendance > 0);
  const gone = leftOver.filter((row) => row._count.attendance === 0);

  if (gone.length) {
    await db.eventOccurrence.deleteMany({
      where: { id: { in: gone.map((row) => row.id) } },
    });
  }
  if (history.length) {
    // Detached from the rule's exceptions: the sitting they stood for is gone,
    // and an exception id is unique to the one row that does stand for it.
    await db.eventOccurrence.updateMany({
      where: { id: { in: history.map((row) => row.id) } },
      data: { exceptionId: null },
    });
  }
  if (orphanIds.length) {
    await db.eventException.deleteMany({ where: { id: { in: orphanIds } } });
  }
  for (const { data, ids } of updates.values()) {
    await db.eventOccurrence.updateMany({ where: { id: { in: ids } }, data });
  }
  if (creates.length) {
    await db.eventOccurrence.createMany({ data: creates });
  }

  // Everyone whose Google Calendar mirrors this event is now out of date.
  //
  // Here, and not in the routers, for the same reason regeneration itself is
  // here: this function is the one place every write to a series passes
  // through, so a new caller cannot forget it. It enqueues rows in the caller's
  // transaction and talks to nobody — the cron does the talking — so a Google
  // outage can never fail an edit to the timetable.
  await enqueueForEvent(db, eventId);

  // And everyone it concerns is told what changed, by the same rule: queued
  // here, in this transaction, addressed and pushed after the response.
  if (await recordClassChanges(db, event, sittingsBefore, rows as Sitting[])) {
    await dispatchAfterResponse();
  }

  return { written: rows.length, prunedExceptions: orphanIds.length };
}

/** What a regeneration may change on a row that keeps standing for its sitting. */
type OccurrenceFields = Pick<
  Prisma.EventOccurrenceUncheckedUpdateManyInput,
  | "start"
  | "end"
  | "roomId"
  | "groupId"
  | "facultyId"
  | "kind"
  | "status"
  | "exceptionId"
>;

/** The fields of `wanted` that differ from `current`, or null when none do. */
function changedFields(
  current: {
    start: Date;
    end: Date;
    roomId: string;
    groupId: string | null;
    facultyId: string | null;
    kind: string;
    status: string;
    exceptionId: string | null;
  },
  wanted: Prisma.EventOccurrenceCreateManyInput,
): OccurrenceFields | null {
  const data: OccurrenceFields = {};
  const start = new Date(wanted.start);
  const end = new Date(wanted.end);
  if (current.start.getTime() !== start.getTime()) data.start = start;
  if (current.end.getTime() !== end.getTime()) data.end = end;
  if (current.roomId !== wanted.roomId) data.roomId = wanted.roomId;
  if (current.groupId !== (wanted.groupId ?? null))
    data.groupId = wanted.groupId ?? null;
  if (current.facultyId !== (wanted.facultyId ?? null))
    data.facultyId = wanted.facultyId ?? null;
  if (current.kind !== wanted.kind) data.kind = wanted.kind;
  if (current.status !== wanted.status) data.status = wanted.status;
  if (current.exceptionId !== (wanted.exceptionId ?? null))
    data.exceptionId = wanted.exceptionId ?? null;
  return Object.keys(data).length ? data : null;
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
  // The sittings from the pivot on go with them, so that a register taken on
  // one stays on it: regenerating the new series then finds these rows and
  // updates them, rather than deleting them from the old series and making new
  // ones without their registers.
  await db.eventOccurrence.updateMany({
    where: {
      eventId,
      OR: [
        ...(movingIds.length ? [{ exceptionId: { in: movingIds } }] : []),
        { exceptionId: null, start: { gte: pivotStart } },
      ],
    },
    data: { eventId: created.id },
  });

  await regenerateOccurrences(db, eventId);
  await regenerateOccurrences(db, created.id);

  return created.id;
}
