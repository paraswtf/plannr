/**
 * Turning an approved plan into real classes.
 *
 * This is the only part of the schedule builder that writes to the live
 * timetable, and it is deliberately the last thing that happens: a plan is a
 * weekly pattern until someone with the permission to do so applies it, at
 * which point each placed session becomes one weekly recurring `Event` running
 * from the plan's anchor week to its end date.
 *
 * Everything the plan promised is re-checked here against live data inside the
 * transaction. A plan approved on Tuesday and applied on Friday may well have
 * been overtaken by a booking made on Wednesday, and the timetable is the
 * authority, not the plan.
 */

import { TRPCError } from "@trpc/server";

import { addDays, fromWallTime, toWallTime } from "~/lib/dates";
import { buildRRule } from "~/lib/recurrence";
import { checkConflicts, hasHardConflict, type Conflict } from "../conflicts";
import { regenerateOccurrences, type Db } from "../occurrences";
import { mondayOf } from "./live-week";

/**
 * The course a planned session teaches, made if this is its first sighting.
 *
 * The plan carries a subject as text and the group says which programme it
 * belongs to, which is everything a course needs. Where the same subject is
 * planned twice it finds the existing row, so a plan applied in two passes does
 * not leave two courses behind. The teacher chosen for the session is recorded
 * as one who may take it.
 */
async function courseFor(
  tx: Db,
  input: {
    orgId: string;
    semesterId: string | null;
    groupId: string | null;
    title: string;
    facultyId: string | null;
  },
): Promise<string | null> {
  if (!input.semesterId || !input.groupId) return null;
  const group = await tx.group.findUnique({
    where: { id: input.groupId },
    select: { programmeId: true },
  });
  if (!group) return null;

  const course = await tx.course.upsert({
    where: {
      semesterId_programmeId_title: {
        semesterId: input.semesterId,
        programmeId: group.programmeId,
        title: input.title,
      },
    },
    update: {},
    create: {
      orgId: input.orgId,
      semesterId: input.semesterId,
      programmeId: group.programmeId,
      title: input.title,
    },
    select: { id: true },
  });

  await tx.groupCourse.upsert({
    where: { groupId_courseId: { groupId: input.groupId, courseId: course.id } },
    update: {},
    create: { groupId: input.groupId, courseId: course.id },
  });
  if (input.facultyId) {
    await tx.courseFaculty.upsert({
      where: { courseId_facultyId: { courseId: course.id, facultyId: input.facultyId } },
      update: {},
      create: { courseId: course.id, facultyId: input.facultyId },
    });
  }
  return course.id;
}

/** The columns of a plan this module needs. */
export interface ApplyPlan {
  id: string;
  orgId: string;
  name: string;
  semesterId: string | null;
  weekStart: Date;
  repeatUntil: Date | null;
}

export interface ApplySession {
  id: string;
  title: string;
  groupId: string;
  facultyIds: string[];
  dayOfWeek: number | null;
  startMinutes: number | null;
  durationMinutes: number;
  roomId: string | null;
}

/** One session, resolved to the instants and rule an `Event` needs. */
export interface ApplyCandidate {
  sessionId: string;
  title: string;
  groupId: string;
  roomId: string;
  /**
   * `Event` carries one teacher. When a session names several, the first takes
   * the column and the rest are written into the notes — the plan keeps the
   * full list either way, and the UI warns before applying.
   */
  facultyId: string | null;
  coTeacherIds: string[];
  startTime: Date;
  endTime: Date;
  rrule: string;
}

/**
 * Resolves the placed sessions into concrete series.
 *
 * Sessions with no slot or no room are skipped rather than guessed at: an
 * unplaced session is a question for the scheduler, not something to invent an
 * answer to.
 */
export function buildApplyCandidates(
  plan: ApplyPlan,
  sessions: ApplySession[],
  timeZone: string,
): { candidates: ApplyCandidate[]; skipped: ApplySession[] } {
  const monday = mondayOf(plan.weekStart, timeZone);
  const candidates: ApplyCandidate[] = [];
  const skipped: ApplySession[] = [];

  for (const session of sessions) {
    if (session.dayOfWeek === null || session.startMinutes === null || !session.roomId) {
      skipped.push(session);
      continue;
    }

    const day = addDays(monday, session.dayOfWeek - 1, timeZone);
    const wall = toWallTime(day, timeZone);
    const startTime = fromWallTime(
      { ...wall, hour: 0, minute: session.startMinutes, second: 0 },
      timeZone,
    );
    const endTime = new Date(startTime.getTime() + session.durationMinutes * 60_000);

    // The series must be bounded — occurrences are materialised, so there is
    // no horizon to extend later. Without an end date the plan's own week is
    // the only one that gets scheduled.
    const until = plan.repeatUntil
      ? (() => {
          const end = toWallTime(plan.repeatUntil, timeZone);
          return fromWallTime({ ...end, hour: 23, minute: 59, second: 59 }, timeZone);
        })()
      : endTime;

    candidates.push({
      sessionId: session.id,
      title: session.title,
      groupId: session.groupId,
      roomId: session.roomId,
      facultyId: session.facultyIds[0] ?? null,
      coTeacherIds: session.facultyIds.slice(1),
      startTime,
      endTime,
      rrule: buildRRule({
        freq: "WEEKLY",
        byWeekday: [session.dayOfWeek - 1],
        until,
        timeZone,
      }),
    });
  }

  return { candidates, skipped };
}

export interface SessionConflicts {
  sessionId: string;
  title: string;
  conflicts: Conflict[];
}

/**
 * What applying this plan would run into, without writing anything.
 *
 * Sessions are checked against the timetable one at a time and *not* against
 * each other: the solver already guaranteed the plan is internally consistent,
 * so anything reported here is a genuine collision with live data.
 */
export async function previewApply(
  db: Db,
  plan: ApplyPlan,
  sessions: ApplySession[],
  timeZone: string,
): Promise<{
  candidates: ApplyCandidate[];
  skipped: ApplySession[];
  blocking: SessionConflicts[];
  warnings: SessionConflicts[];
}> {
  const { candidates, skipped } = buildApplyCandidates(plan, sessions, timeZone);

  const checked = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      conflicts: await checkConflicts(db, {
        orgId: plan.orgId,
        roomId: candidate.roomId,
        groupId: candidate.groupId,
        facultyId: candidate.facultyId,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        timezone: timeZone,
        rrule: candidate.rrule,
      }),
    })),
  );

  const blocking: SessionConflicts[] = [];
  const warnings: SessionConflicts[] = [];
  for (const { candidate, conflicts } of checked) {
    const hard = conflicts.filter((c) => c.severity === "hard");
    const soft = conflicts.filter((c) => c.severity === "warning");
    if (hard.length) {
      blocking.push({ sessionId: candidate.sessionId, title: candidate.title, conflicts: hard });
    }
    if (soft.length) {
      warnings.push({ sessionId: candidate.sessionId, title: candidate.title, conflicts: soft });
    }
  }

  return { candidates, skipped, blocking, warnings };
}

export interface ApplyResult {
  created: number;
  skipped: number;
  eventIds: string[];
}

/**
 * Writes the plan to the timetable. Must be called inside a transaction — the
 * caller owns it, so applying and marking the plan applied cannot come apart.
 *
 * Every series is re-checked as it is written, and each one is visible to the
 * checks that follow it: two sessions of the same plan can never end up
 * fighting over a room even if the plan was edited by hand after solving.
 */
export async function applyPlan(
  tx: Db,
  options: {
    plan: ApplyPlan;
    sessions: ApplySession[];
    timeZone: string;
    actorId: string;
    /** When false, a hard clash is reported as a warning instead of refusing. */
    blockOnConflict: boolean;
  },
): Promise<ApplyResult> {
  const { candidates, skipped } = buildApplyCandidates(
    options.plan,
    options.sessions,
    options.timeZone,
  );

  const eventIds: string[] = [];

  for (const candidate of candidates) {
    const conflicts = await checkConflicts(tx, {
      orgId: options.plan.orgId,
      roomId: candidate.roomId,
      groupId: candidate.groupId,
      facultyId: candidate.facultyId,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
      timezone: options.timeZone,
      rrule: candidate.rrule,
    });

    if (options.blockOnConflict && hasHardConflict(conflicts)) {
      const first = conflicts.find((c) => c.severity === "hard");
      throw new TRPCError({
        code: "CONFLICT",
        message: `${candidate.title} cannot be scheduled: ${first?.message ?? "the slot is taken."} Nothing has been added to the timetable.`,
      });
    }

    // A plan names its subject as free text, which is what a Course is. The
    // class it becomes should be no different from one the office scheduled by
    // hand, so the title is resolved to a course of this semester — created on
    // first use, because a plan is often how a new subject enters the app.
    const courseId = await courseFor(tx, {
      orgId: options.plan.orgId,
      semesterId: options.plan.semesterId,
      groupId: candidate.groupId,
      title: candidate.title,
      facultyId: candidate.facultyId,
    });

    const event = await tx.event.create({
      data: {
        orgId: options.plan.orgId,
        kind: "CLASS",
        status: "CONFIRMED",
        title: candidate.title,
        courseId,
        roomId: candidate.roomId,
        groupId: candidate.groupId,
        facultyId: candidate.facultyId,
        semesterId: options.plan.semesterId,
        createdById: options.actorId,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        timezone: options.timeZone,
        rrule: candidate.rrule,
        notes: `Scheduled from the plan "${options.plan.name}".`,
      },
    });
    await regenerateOccurrences(tx, event.id);

    await tx.schedulePlanSession.update({
      where: { id: candidate.sessionId },
      data: { appliedEventId: event.id },
    });
    eventIds.push(event.id);
  }

  return { created: eventIds.length, skipped: skipped.length, eventIds };
}
