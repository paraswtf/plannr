import { ASSIGNMENT_TYPE_META } from "~/lib/assignments";
import {
  DEFAULT_TIMEZONE,
  formatDayLabel,
  formatHourLabel,
  fromWallTime,
} from "~/lib/dates";
import { notify } from "../notifications/notify";
import type { Db } from "../occurrences";

/**
 * When assignments happen, kept in step with the classes they are pinned to.
 *
 * Apart from `sittings.ts` so that `regenerateOccurrences` can call it without
 * the two modules importing each other: pinning a sitting regenerates, and
 * regenerating moves pinned sittings.
 */

async function timezonesOf(db: Db, orgIds: string[]) {
  const orgs = await db.organization.findMany({
    where: { id: { in: orgIds } },
    select: { id: true, timezone: true },
  });
  return new Map(orgs.map((o) => [o.id, o.timezone ?? DEFAULT_TIMEZONE]));
}

/** Midnight at the start of a calendar day (a `@db.Date`) in `timeZone`. */
function startOfDate(date: Date, timeZone: string, plusDays = 0): Date {
  const day = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + plusDays,
    ),
  );
  return fromWallTime(
    {
      year: day.getUTCFullYear(),
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

/**
 * Recomputes when each assignment starts and ends, which is what the Upcoming
 * and Past lists sort and split on: its first sitting's start to its last
 * sitting's end. A presentation also spans its window, from the first day's
 * midnight to the midnight after the last, in the institution's timezone,
 * whatever is booked: the teams not booked yet still present inside it, so it
 * stays upcoming until the window is over even when the first slot has passed.
 * A test with no sitting has no times.
 */
export async function refreshAssignmentTimes(
  db: Db,
  assignmentIds: string[],
): Promise<void> {
  const ids = [...new Set(assignmentIds)];
  if (ids.length === 0) return;

  const assignments = await db.assignment.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      orgId: true,
      type: true,
      windowStart: true,
      windowEnd: true,
      startsAt: true,
      endsAt: true,
      sittings: { select: { startsAt: true, endsAt: true } },
    },
  });
  const zones = await timezonesOf(db, [
    ...new Set(assignments.map((a) => a.orgId)),
  ]);

  for (const a of assignments) {
    const spans = a.sittings.map((s) => ({ from: s.startsAt, to: s.endsAt }));
    if (a.type === "PRESENTATION" && a.windowStart && a.windowEnd) {
      const zone = zones.get(a.orgId) ?? DEFAULT_TIMEZONE;
      spans.push({
        from: startOfDate(a.windowStart, zone),
        to: startOfDate(a.windowEnd, zone, 1),
      });
    }
    const startsAt = spans.length
      ? new Date(Math.min(...spans.map((s) => s.from.getTime())))
      : null;
    const endsAt = spans.length
      ? new Date(Math.max(...spans.map((s) => s.to.getTime())))
      : null;
    if (
      startsAt?.getTime() !== a.startsAt?.getTime() ||
      endsAt?.getTime() !== a.endsAt?.getTime()
    ) {
      await db.assignment.update({
        where: { id: a.id },
        data: { startsAt, endsAt },
      });
    }
  }
}

/**
 * Called by `regenerateOccurrences` once an event's rows are reconciled: each
 * sitting pinned to one of the event's sittings takes that sitting's times as
 * they now stand, and the assignments concerned are told. A sitting whose
 * exception was pruned has already lost its link and keeps its last times.
 */
export async function syncAssignmentSittings(
  db: Db,
  eventId: string,
): Promise<void> {
  const pinned = await db.assignmentSitting.findMany({
    where: { exception: { eventId } },
    select: {
      id: true,
      exceptionId: true,
      assignmentId: true,
      startsAt: true,
      endsAt: true,
    },
  });
  if (pinned.length === 0) return;

  const occurrences = await db.eventOccurrence.findMany({
    where: {
      exceptionId: {
        in: pinned.map((p) => p.exceptionId).filter((id): id is string => !!id),
      },
    },
    select: { exceptionId: true, start: true, end: true },
  });
  const byException = new Map(occurrences.map((o) => [o.exceptionId, o]));

  const moved = new Set<string>();
  for (const sitting of pinned) {
    const now = byException.get(sitting.exceptionId);
    if (!now) continue;
    if (
      now.start.getTime() === sitting.startsAt.getTime() &&
      now.end.getTime() === sitting.endsAt.getTime()
    ) {
      continue;
    }
    await db.assignmentSitting.update({
      where: { id: sitting.id },
      data: { startsAt: now.start, endsAt: now.end },
    });
    moved.add(sitting.assignmentId);
  }
  await refreshAssignmentTimes(db, [...moved]);
}

/**
 * Tells the people concerned that a test or a presentation slot has lost its
 * class, because the sittings it was pinned to are about to stop existing: the
 * series was retimed away from them, split with a new time, or cut short.
 *
 * Called by `regenerateOccurrences` with the exceptions it is about to prune,
 * before it prunes them; afterwards the sittings' links are already null and
 * nothing could find them. Only sittings still to come are announced: a lost
 * pin on a test that has already happened is history, not news.
 *
 * The students hear that a new time is coming (for a presentation slot, only
 * the team presenting in it), and whoever set it hears that it needs a new
 * class, since nothing moves the test for them.
 */
export async function announceLostSittings(
  db: Db,
  exceptionIds: string[],
): Promise<void> {
  if (exceptionIds.length === 0) return;
  const lost = await db.assignmentSitting.findMany({
    where: { exceptionId: { in: exceptionIds }, endsAt: { gt: new Date() } },
    select: {
      id: true,
      startsAt: true,
      teamId: true,
      team: {
        select: {
          name: true,
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
          createdById: true,
        },
      },
    },
  });
  if (lost.length === 0) return;

  const zones = await timezonesOf(db, [
    ...new Set(lost.map((s) => s.assignment.orgId)),
  ]);
  for (const sitting of lost) {
    const { assignment } = sitting;
    const zone = zones.get(assignment.orgId) ?? DEFAULT_TIMEZONE;
    const label = ASSIGNMENT_TYPE_META[assignment.type].label;
    const at = `${formatDayLabel(sitting.startsAt, zone)}, ${formatHourLabel(sitting.startsAt, zone)}`;
    const students = sitting.team
      ? sitting.team.members.map((m) => m.student.userId)
      : (
          await db.user.findMany({
            where: {
              studentProfile: {
                memberships: { some: { groupId: assignment.groupId } },
              },
            },
            select: { id: true },
          })
        ).map((u) => u.id);
    const news = {
      orgId: assignment.orgId,
      category: "ASSIGNMENTS" as const,
      url: `/assignments/${assignment.id}`,
      // One per pin: the same test losing a later class is news again.
      sourceKey: `assignment-lost:${sitting.id}`,
    };
    const what = sitting.team
      ? `${sitting.team.name}'s slot on ${at}`
      : `The class on ${at}`;
    await notify(db, students, {
      ...news,
      title: `${label} needs a new time: ${assignment.title}`,
      body: `${what} has moved or been called off. Your teacher will set a new time.`,
    });
    await notify(db, [assignment.createdById], {
      ...news,
      title: `${label} lost its class: ${assignment.title}`,
      body: `${what} has moved or been called off. Pick another class for it.`,
    });
  }
}
