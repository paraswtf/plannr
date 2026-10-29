import { TRPCError } from "@trpc/server";

import { ASSIGNMENT_TYPE_META } from "~/lib/assignments";
import { DEFAULT_TIMEZONE, formatDayLabel, formatHourLabel } from "~/lib/dates";
import { PermissionFlags, type PermissionBitField } from "~/lib/permissions";
import {
  EventKind,
  EventStatus,
  ExceptionType,
} from "../../../../generated/prisma";
import { notifyClassRequested } from "../approvals";
import { createEventInTx } from "../events/create";
import { notify } from "../notifications/notify";
import { regenerateOccurrences, type Db } from "../occurrences";

export { refreshAssignmentTimes, syncAssignmentSittings } from "./times";

/**
 * Pinning tests and presentation slots to class sittings.
 *
 * A pin is an `EventException` of type MODIFIED with no overrides: it changes
 * nothing about the sitting, but it is a row with the sitting's original start
 * that a series split carries to the new half, and `EventOccurrence.exceptionId`
 * points at it, which is what the timetable joins on. When the sitting stops
 * existing (the series is retimed away from it) the exception is pruned and the
 * pin's link goes to null, so the assignment says it has lost its class rather
 * than following a different one.
 */

/** How a pinned sitting stands now. */
export type SittingState =
  /** The class sitting is there and confirmed. */
  | "ok"
  /** The class was scheduled for this and waits for approval. */
  | "pending"
  /** The sitting was called off. */
  | "cancelled"
  /** The sitting no longer exists (its exception was pruned). */
  | "lost";

export interface PinnedSitting {
  exceptionId: string;
  eventId: string;
  originalStart: Date;
  startsAt: Date;
  endsAt: Date;
  state: SittingState;
}

async function orgTimezoneOf(db: Db, orgId: string): Promise<string> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true },
  });
  return org?.timezone ?? DEFAULT_TIMEZONE;
}

/**
 * Pins one sitting of a class: the sitting the rule put at `originalStart`.
 * Makes its exception when it has none (one it already has, from a move, is
 * kept as it is) and regenerates the event, which keeps every row and register
 * where it was. A called-off sitting cannot be pinned.
 */
export async function pinSitting(
  tx: Db,
  args: { orgId: string; eventId: string; originalStart: Date },
): Promise<PinnedSitting> {
  const event = await tx.event.findFirst({
    where: { id: args.eventId, orgId: args.orgId },
    select: { id: true, status: true },
  });
  if (!event) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That class is not on the timetable.",
    });
  }
  if (
    event.status === EventStatus.CANCELLED ||
    event.status === EventStatus.REJECTED
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That class has been called off. Pick another.",
    });
  }

  const sitting = await tx.eventOccurrence.findFirst({
    where: {
      eventId: event.id,
      OR: [
        { exception: { originalStart: args.originalStart } },
        { exceptionId: null, start: args.originalStart },
      ],
    },
    select: { id: true, status: true, exceptionId: true },
  });
  if (!sitting) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That class does not sit at that time. Pick one from the list.",
    });
  }
  if (sitting.status === EventStatus.CANCELLED) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That class is called off on that day. Pick another.",
    });
  }

  let exceptionId = sitting.exceptionId;
  if (!exceptionId) {
    const created = await tx.eventException.create({
      data: {
        eventId: event.id,
        originalStart: args.originalStart,
        type: ExceptionType.MODIFIED,
      },
      select: { id: true },
    });
    exceptionId = created.id;
    await regenerateOccurrences(tx, event.id);
  }

  const now = await tx.eventOccurrence.findFirstOrThrow({
    where: { exceptionId },
    select: { start: true, end: true, status: true },
  });
  return {
    exceptionId,
    eventId: event.id,
    originalStart: args.originalStart,
    startsAt: now.start,
    endsAt: now.end,
    state: event.status === EventStatus.PENDING ? "pending" : "ok",
  };
}

/**
 * Schedules a one-off class for an assignment and pins its only sitting.
 *
 * Through the same `createEventInTx` that `events.create` uses, so conflicts,
 * groups and sittings are made the one way. A teacher's extra class waits for
 * approval when the institution asks for changes to be approved, the setting
 * that already governs a teacher moving their own lecture; whoever schedules
 * the whole timetable never waits.
 */
export async function scheduleClassForAssignment(
  tx: Db,
  args: {
    orgId: string;
    actor: { id: string; bits: PermissionBitField };
    groupId: string;
    courseId: string | null;
    semesterId: string | null;
    roomId: string;
    startTime: Date;
    endTime: Date;
    title: string;
  },
): Promise<PinnedSitting & { scheduledForIt: true }> {
  if (args.endTime <= args.startTime) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The class has to end after it starts.",
    });
  }
  const room = await tx.room.findFirst({
    where: { id: args.roomId, orgId: args.orgId, isActive: true },
    select: { id: true },
  });
  if (!room) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That room is not available. Pick another.",
    });
  }

  const schedulesAll = args.actor.bits.has(PermissionFlags.ManageAllEvents);
  const faculty = await tx.facultyProfile.findUnique({
    where: { userId: args.actor.id },
    select: { id: true },
  });
  if (!faculty && !schedulesAll) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only a teacher can schedule a class for a test.",
    });
  }

  const [settings, timezone] = await Promise.all([
    tx.orgSettings.findUnique({ where: { orgId: args.orgId } }),
    orgTimezoneOf(tx, args.orgId),
  ]);
  const needsApproval =
    !schedulesAll && (settings?.requireApprovalChanges ?? true);

  const { event } = await createEventInTx(tx, {
    orgId: args.orgId,
    createdById: args.actor.id,
    kind: EventKind.CLASS,
    status: needsApproval ? EventStatus.PENDING : EventStatus.CONFIRMED,
    title: args.title,
    roomId: room.id,
    groupIds: [args.groupId],
    courseId: args.courseId,
    facultyId: faculty?.id ?? null,
    semesterId: args.semesterId,
    startTime: args.startTime,
    endTime: args.endTime,
    timezone,
    rrule: null,
    notes: null,
    blockConflicts: settings?.blockConflicts ?? true,
  });
  if (needsApproval) await notifyClassRequested(tx, event, args.actor.id);

  const pinned = await pinSitting(tx, {
    orgId: args.orgId,
    eventId: event.id,
    originalStart: event.startTime,
  });
  return { ...pinned, scheduledForIt: true };
}

/**
 * Withdraws the extra classes that were asked for tests and are now holding
 * nothing: still waiting for approval, scheduled for a test, and with no test
 * or slot pinned to them any more. Called after a test is deleted or moved, or
 * a slot is moved or cleared, so that an approver is not left to approve a
 * class whose only purpose has gone, which would put it on the group's
 * timetable. A class that is already on the timetable stays: people may have
 * planned around it, and cancelling it is the caller's choice.
 *
 * Returns how many were withdrawn.
 */
export async function withdrawIdleClasses(
  tx: Db,
  eventIds: Iterable<string>,
): Promise<number> {
  let withdrawn = 0;
  for (const eventId of new Set(eventIds)) {
    const event = await tx.event.findUnique({
      where: { id: eventId },
      select: {
        status: true,
        kind: true,
        _count: {
          select: {
            exceptions: { where: { assignmentSittings: { some: {} } } },
          },
        },
      },
    });
    if (
      event?.status !== EventStatus.PENDING ||
      event.kind !== EventKind.CLASS ||
      event._count.exceptions > 0
    ) {
      continue;
    }
    await tx.event.update({
      where: { id: eventId },
      data: { status: EventStatus.CANCELLED },
    });
    await regenerateOccurrences(tx, eventId);
    withdrawn += 1;
  }
  return withdrawn;
}

/** The classes these tests' own extra classes are, for `withdrawIdleClasses`. */
export async function classesScheduledFor(
  tx: Db,
  where: { assignmentId: string; teamId?: string | null },
): Promise<string[]> {
  const own = await tx.assignmentSitting.findMany({
    where: { ...where, scheduledForIt: true, exceptionId: { not: null } },
    select: { exception: { select: { eventId: true } } },
  });
  return own.flatMap((s) => (s.exception ? [s.exception.eventId] : []));
}

/**
 * Tells the students of the tests pinned to a class that the class was
 * refused. They were told the test was set and that its class waited for
 * approval; without this they would turn up on the day. The teacher who asked
 * for it hears through the decision itself. A presentation slot's news goes to
 * its team only.
 */
export async function announceRefusedClass(
  tx: Db,
  eventId: string,
): Promise<void> {
  const pins = await tx.assignmentSitting.findMany({
    where: { exception: { eventId }, endsAt: { gt: new Date() } },
    select: {
      id: true,
      startsAt: true,
      team: {
        select: {
          members: { select: { student: { select: { userId: true } } } },
        },
      },
      assignment: {
        select: {
          id: true,
          orgId: true,
          type: true,
          title: true,
          groupId: true,
        },
      },
    },
  });
  for (const pin of pins) {
    const { assignment } = pin;
    const zone = await orgTimezoneOf(tx, assignment.orgId);
    const label = ASSIGNMENT_TYPE_META[assignment.type].label;
    const at = `${formatDayLabel(pin.startsAt, zone)}, ${formatHourLabel(pin.startsAt, zone)}`;
    const students = pin.team
      ? pin.team.members.map((m) => m.student.userId)
      : (
          await tx.user.findMany({
            where: {
              studentProfile: {
                memberships: { some: { groupId: assignment.groupId } },
              },
            },
            select: { id: true },
          })
        ).map((u) => u.id);
    await notify(tx, students, {
      orgId: assignment.orgId,
      category: "ASSIGNMENTS",
      title: `${label} has no class yet: ${assignment.title}`,
      body: `The class asked for it on ${at} was not approved. Your teacher will set a new time.`,
      url: `/assignments/${assignment.id}`,
      sourceKey: `assignment-refused:${pin.id}`,
    });
  }
}

/** The state of each sitting, by sitting id. */
export async function sittingStates(
  db: Db,
  sittingIds: string[],
): Promise<Map<string, SittingState>> {
  const states = new Map<string, SittingState>();
  if (sittingIds.length === 0) return states;
  const sittings = await db.assignmentSitting.findMany({
    where: { id: { in: sittingIds } },
    select: {
      id: true,
      exception: {
        select: {
          type: true,
          event: { select: { status: true } },
          occurrence: { select: { status: true } },
        },
      },
    },
  });
  for (const s of sittings) {
    const ex = s.exception;
    states.set(
      s.id,
      !ex
        ? "lost"
        : ex.type === ExceptionType.CANCELLED ||
            ex.occurrence?.status === EventStatus.CANCELLED ||
            ex.event.status === EventStatus.CANCELLED ||
            ex.event.status === EventStatus.REJECTED
          ? "cancelled"
          : ex.event.status === EventStatus.PENDING
            ? "pending"
            : "ok",
    );
  }
  return states;
}

/**
 * The (group, course) pairs somebody teaches: a class they are timetabled to
 * teach, with that course, the group primary or one of a combined lecture's.
 * The timetable is the authority; being cleared to teach a course is not
 * teaching it. A class with no course (the timetable sync adds them that way)
 * still counts, as the group with a null course, so a test can be set in it.
 */
export async function teachingPairs(
  db: Db,
  args: { orgId: string; facultyId: string; semesterId: string | null },
): Promise<
  Array<{
    groupId: string;
    groupLabel: string;
    courseId: string | null;
    courseTitle: string | null;
  }>
> {
  const events = await db.event.findMany({
    where: {
      orgId: args.orgId,
      facultyId: args.facultyId,
      kind: EventKind.CLASS,
      status: { notIn: [EventStatus.CANCELLED, EventStatus.REJECTED] },
      ...(args.semesterId
        ? {
            OR: [
              { course: { semesterId: args.semesterId } },
              { courseId: null, semesterId: args.semesterId },
              { courseId: null, semesterId: null },
            ],
          }
        : {}),
    },
    select: {
      courseId: true,
      groupId: true,
      groups: { select: { groupId: true } },
      course: { select: { title: true } },
    },
  });

  const pairs = new Map<string, { groupId: string; courseId: string | null }>();
  const titles = new Map<string, string>();
  for (const e of events) {
    if (e.courseId) titles.set(e.courseId, e.course?.title ?? "");
    const groupIds = new Set(
      [e.groupId, ...e.groups.map((g) => g.groupId)].filter(
        (id): id is string => !!id,
      ),
    );
    for (const groupId of groupIds) {
      pairs.set(`${groupId}:${e.courseId ?? ""}`, {
        groupId,
        courseId: e.courseId,
      });
    }
  }

  const groups = await db.group.findMany({
    where: {
      id: { in: [...new Set([...pairs.values()].map((p) => p.groupId))] },
    },
    select: { id: true, name: true, label: true },
  });
  const labels = new Map(groups.map((g) => [g.id, g.label ?? g.name]));

  return [...pairs.values()]
    .map((p) => ({
      groupId: p.groupId,
      groupLabel: labels.get(p.groupId) ?? "",
      courseId: p.courseId,
      courseTitle: p.courseId ? (titles.get(p.courseId) ?? "") : null,
    }))
    .sort(
      (a, b) =>
        a.groupLabel.localeCompare(b.groupLabel) ||
        (a.courseTitle ?? "").localeCompare(b.courseTitle ?? ""),
    );
}

/** Whether that faculty member teaches the group (and the course, when given). */
export async function teaches(
  db: Db,
  args: {
    orgId: string;
    facultyId: string;
    groupId: string;
    courseId?: string | null;
  },
): Promise<boolean> {
  const count = await db.event.count({
    where: {
      orgId: args.orgId,
      facultyId: args.facultyId,
      kind: EventKind.CLASS,
      status: { notIn: [EventStatus.CANCELLED, EventStatus.REJECTED] },
      ...(args.courseId ? { courseId: args.courseId } : {}),
      OR: [
        { groupId: args.groupId },
        { groups: { some: { groupId: args.groupId } } },
      ],
    },
  });
  return count > 0;
}
