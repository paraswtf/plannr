import { TRPCError } from "@trpc/server";

import {
  ExceptionType,
  type EventKind,
  type EventStatus,
} from "../../../../generated/prisma";
import { checkConflicts, hasHardConflict, type Conflict } from "../conflicts";
import { regenerateOccurrences, type Db } from "../occurrences";

/** Conflicts a client may safely be shown; the raw error carries the same list. */
export function conflictError(conflicts: Conflict[]): TRPCError {
  const first = conflicts.find((c) => c.severity === "hard");
  return new TRPCError({
    code: "CONFLICT",
    message: first?.message ?? "That slot is no longer free.",
    cause: conflicts,
  });
}

/** Everything a new class or booking is, once the caller has decided it may exist. */
export interface NewEvent {
  orgId: string;
  createdById: string;
  kind: EventKind;
  status: EventStatus;
  title: string;
  roomId: string;
  /** The first is the primary group; the rest ride along on the join table. */
  groupIds: string[];
  courseId?: string | null;
  facultyId?: string | null;
  semesterId?: string | null;
  startTime: Date;
  endTime: Date;
  timezone: string;
  rrule?: string | null;
  notes?: string | null;
  /** Dates of a series left out from the start, kept as cancelled sittings. */
  skipDates?: Date[];
  /** The institution's `blockConflicts`: refuse a hard clash rather than report it. */
  blockConflicts: boolean;
}

/**
 * Writes a new event and its sittings, inside the caller's transaction.
 *
 * The one way an event comes into being, shared by `events.create` and by an
 * assignment scheduling a class for a test, so the order that matters here is
 * kept in one place: conflicts checked again inside the transaction, the event,
 * then its groups, then its skipped dates, then the sittings. Who may create
 * what, and with which status, is the caller's decision; this only refuses a
 * clash.
 */
export async function createEventInTx(
  tx: Db,
  input: NewEvent,
): Promise<{
  event: Awaited<ReturnType<Db["event"]["create"]>>;
  skipped: number;
  warnings: Conflict[];
}> {
  const skipped = new Set(
    (input.skipDates ?? []).map((date) => date.getTime()),
  );
  const primaryGroupId = input.groupIds[0] ?? null;

  // Re-checked inside the transaction: the client's preflight is a courtesy,
  // not a guarantee, and the slot may have gone since.
  const found = await checkConflicts(tx, {
    orgId: input.orgId,
    roomId: input.roomId,
    groupId: primaryGroupId,
    groupIds: input.groupIds,
    facultyId: input.facultyId,
    startTime: input.startTime,
    endTime: input.endTime,
    timezone: input.timezone,
    rrule: input.rrule,
  });
  // A date being skipped is not booked, so whatever it clashed with is no
  // longer this event's problem.
  const conflicts = found.filter(
    (c) => !c.candidate || !skipped.has(c.candidate.start.getTime()),
  );
  if (input.blockConflicts && hasHardConflict(conflicts)) {
    throw conflictError(conflicts);
  }

  const event = await tx.event.create({
    data: {
      orgId: input.orgId,
      kind: input.kind,
      status: input.status,
      title: input.title,
      roomId: input.roomId,
      groupId: primaryGroupId,
      courseId: input.courseId ?? null,
      facultyId: input.facultyId ?? null,
      semesterId: input.semesterId ?? null,
      createdById: input.createdById,
      startTime: input.startTime,
      endTime: input.endTime,
      timezone: input.timezone,
      rrule: input.rrule ?? null,
      notes: input.notes ?? null,
    },
  });

  // Before the sittings are made: the class-change notice they trigger reads
  // who attends from this table.
  if (input.groupIds.length > 0) {
    await tx.eventGroup.createMany({
      data: input.groupIds.map((groupId) => ({ eventId: event.id, groupId })),
    });
  }

  // Skipped dates are recorded the same way a cancelled occurrence is, so the
  // series stays one event and the gaps are visible as exceptions.
  if (skipped.size > 0) {
    await tx.eventException.createMany({
      data: [...skipped].map((time) => ({
        eventId: event.id,
        originalStart: new Date(time),
        type: ExceptionType.CANCELLED,
        reason: "Skipped when the series was booked",
      })),
    });
  }
  await regenerateOccurrences(tx, event.id);

  return {
    event,
    skipped: skipped.size,
    warnings: conflicts.filter((c) => c.severity === "warning"),
  };
}
