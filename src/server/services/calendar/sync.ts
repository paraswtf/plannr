/**
 * Keeping people's Google Calendars level with the timetable.
 *
 * The shape is a durable outbox drained by a cron, matching what `EmailOutbox`
 * already sketches in the schema. Nothing calls Google inside a request: an
 * edit to a lecture with sixty students would otherwise turn one click into
 * sixty round trips, fail halfway, and leave the timetable saved but half the
 * calendars wrong. Instead the write and the *intent* to sync commit in the
 * same transaction, and the drain makes it true afterwards.
 *
 * Reconcile rather than replay. A task says only "this person's copy of this
 * event may be stale"; the work re-derives what their calendar should contain
 * and makes it so. A task that runs twice is therefore harmless, a task that
 * runs late still converges, and a task lost entirely is repaired by the next
 * sweep — which is the only way a queue that talks to somebody else's API can
 * be trusted.
 */

import { env } from "~/env";
import {
  CalendarSyncStatus,
  CalendarTaskStatus,
  type PrismaClient,
} from "../../../../generated/prisma";
import type { Db } from "../occurrences";
import { open, seal } from "./crypto";
import {
  calendarDescription,
  calendarSummary,
  digestOf,
  toGoogleEvent,
  type MirrorableOccurrence,
} from "./describe";
import * as google from "./google";

/**
 * How much of the timetable is mirrored, relative to now.
 *
 * A bounded window rather than the whole term: it caps what one person's
 * calendar can cost us at a few hundred events instead of a whole degree's
 * worth, and a class in April is of no use in a calendar today. The past week
 * is kept because attendance is argued about after the fact.
 *
 * The window slides, so occurrences drift into it over time and would never be
 * written by edit-driven tasks alone. `sweepStaleConnections` is what covers
 * that, and is not optional.
 */
const HORIZON_PAST_DAYS = 7;
const HORIZON_FUTURE_DAYS = 120;

/** Attempts before a task is left alone for a human to look at. */
const MAX_ATTEMPTS = 6;

/** How long a claimed task is hidden from other drains. */
const LEASE_MS = 5 * 60_000;

/** A connection idle longer than this is swept for horizon drift. */
const RESYNC_AFTER_MS = 20 * 60 * 60_000;

function horizon(now = new Date()) {
  return {
    from: new Date(now.getTime() - HORIZON_PAST_DAYS * 86_400_000),
    to: new Date(now.getTime() + HORIZON_FUTURE_DAYS * 86_400_000),
  };
}

/** Whether the feature is configured at all. Checked before every enqueue. */
export function syncEnabled(): boolean {
  return env.GOOGLE_CALENDAR_SYNC_ENABLED;
}

// ─── Enqueueing ─────────────────────────────────────────────────────────────

/**
 * Marks everybody's copy of one event as needing a look.
 *
 * Called from `regenerateOccurrences`, so it runs inside the same transaction
 * as the change that prompted it: either the lecture moved and the tasks exist,
 * or neither happened. There is no window in which the timetable has been
 * edited and nobody is going to be told.
 *
 * The audience is the union of two sets, and the second is the important one:
 *
 * - who should have this event now — the students in the groups it is for, and
 *   whoever teaches it;
 * - who has a mirror of it already.
 *
 * Without the second, moving a lecture to a different section would update the
 * new section's calendars and leave it sitting in the old section's for ever.
 * A dropped student, a reassigned lecturer and a deleted event are all the same
 * case: they hold a mirror, they are no longer entitled, reconcile removes it.
 */
export async function enqueueForEvent(db: Db, eventId: string): Promise<number> {
  if (!syncEnabled()) return 0;

  const connectionIds = await audienceFor(db, eventId);
  if (connectionIds.length === 0) return 0;

  // `createMany` with `skipDuplicates` rather than an upsert loop: the unique
  // constraint on (connection, event) is doing the coalescing, so editing the
  // same lecture five times before the cron runs leaves one pending row.
  const created = await db.calendarSyncTask.createMany({
    data: connectionIds.map((connectionId) => ({ connectionId, eventId })),
    skipDuplicates: true,
  });

  // A task that had already failed, or already run, must come back to PENDING —
  // `skipDuplicates` leaves those rows untouched, and a DONE row for an event
  // that has just changed again is exactly the stale state we must not keep.
  await db.calendarSyncTask.updateMany({
    where: { eventId, connectionId: { in: connectionIds } },
    data: {
      status: CalendarTaskStatus.PENDING,
      attempts: 0,
      nextAttemptAt: new Date(),
      lastError: null,
    },
  });

  return created.count;
}

/**
 * The same, for events that are about to be deleted outright.
 *
 * Must be called *before* the delete, and that ordering is the whole point:
 * once the rows are gone there is no way to work out who was in the room, and
 * the lecture would sit in their calendars for ever with nothing left to say it
 * should not. Deleting a group or a room takes its classes with it — those are
 * the only two paths that remove events without going through
 * `regenerateOccurrences`, so they are the only two that need this by hand.
 */
export async function enqueueForEvents(
  db: Db,
  eventIds: string[],
): Promise<number> {
  if (!syncEnabled() || eventIds.length === 0) return 0;
  let queued = 0;
  for (const eventId of eventIds) queued += await enqueueForEvent(db, eventId);
  return queued;
}

/**
 * The connections that care about one event.
 *
 * Entitlement is deliberately the same rule the schedule screen uses — an
 * occurrence is yours if its group is one of yours or its faculty is you — so
 * that a calendar and `/schedule` can never disagree about what "my classes"
 * means. (That rule reads the occurrence's own `groupId`, which for a combined
 * lecture is the primary section only; if that is ever widened to the
 * `EventGroup` join, widening it here in step is what keeps the two honest.)
 */
async function audienceFor(db: Db, eventId: string): Promise<string[]> {
  const occurrences = await db.eventOccurrence.findMany({
    where: { eventId },
    select: { groupId: true, facultyId: true },
  });

  const groupIds = [
    ...new Set(occurrences.map((o) => o.groupId).filter((id): id is string => !!id)),
  ];
  const facultyIds = [
    ...new Set(occurrences.map((o) => o.facultyId).filter((id): id is string => !!id)),
  ];

  const [entitled, existing] = await Promise.all([
    db.calendarConnection.findMany({
      where: {
        status: CalendarSyncStatus.ACTIVE,
        user: {
          OR: [
            ...(groupIds.length
              ? [{ studentProfile: { memberships: { some: { groupId: { in: groupIds } } } } }]
              : []),
            ...(facultyIds.length
              ? [{ facultyProfile: { id: { in: facultyIds } } }]
              : []),
          ],
        },
      },
      select: { id: true },
    }),
    db.calendarMirror.findMany({
      where: { eventId, connection: { status: CalendarSyncStatus.ACTIVE } },
      select: { connectionId: true },
      distinct: ["connectionId"],
    }),
  ]);

  return [
    ...new Set([
      ...entitled.map((c) => c.id),
      ...existing.map((m) => m.connectionId),
    ]),
  ];
}

/**
 * Queues every event one person could possibly care about.
 *
 * Used on connect, on reconnect, and by the horizon sweep. Includes events they
 * merely hold mirrors for, so a resync also cleans up after a membership change
 * that happened while they were disconnected.
 */
export async function enqueueFullResync(
  db: Db,
  connectionId: string,
): Promise<number> {
  if (!syncEnabled()) return 0;

  const connection = await db.calendarConnection.findUnique({
    where: { id: connectionId },
    select: { userId: true },
  });
  if (!connection) return 0;

  const scope = await scopeOf(db, connection.userId);
  const { from, to } = horizon();

  const [current, mirrored] = await Promise.all([
    scope.groupIds.length || scope.facultyId
      ? db.eventOccurrence.findMany({
          where: {
            start: { lt: to },
            end: { gt: from },
            OR: [
              ...(scope.groupIds.length ? [{ groupId: { in: scope.groupIds } }] : []),
              ...(scope.facultyId ? [{ facultyId: scope.facultyId }] : []),
            ],
          },
          select: { eventId: true },
          distinct: ["eventId"],
        })
      : Promise.resolve([]),
    db.calendarMirror.findMany({
      where: { connectionId },
      select: { eventId: true },
      distinct: ["eventId"],
    }),
  ]);

  const eventIds = [
    ...new Set([
      ...current.map((o) => o.eventId),
      ...mirrored.map((m) => m.eventId),
    ]),
  ];
  if (eventIds.length === 0) return 0;

  await db.calendarSyncTask.createMany({
    data: eventIds.map((eventId) => ({ connectionId, eventId })),
    skipDuplicates: true,
  });
  await db.calendarSyncTask.updateMany({
    where: { connectionId, eventId: { in: eventIds } },
    data: {
      status: CalendarTaskStatus.PENDING,
      attempts: 0,
      nextAttemptAt: new Date(),
      lastError: null,
    },
  });

  return eventIds.length;
}

/** What somebody is, for deciding which classes are theirs. */
async function scopeOf(db: Db, userId: string) {
  const [student, faculty] = await Promise.all([
    db.studentProfile.findUnique({
      where: { userId },
      select: { memberships: { select: { groupId: true } } },
    }),
    db.facultyProfile.findUnique({ where: { userId }, select: { id: true } }),
  ]);
  return {
    groupIds: student?.memberships.map((m) => m.groupId) ?? [],
    facultyId: faculty?.id ?? null,
  };
}

// ─── Draining ───────────────────────────────────────────────────────────────

export interface DrainReport {
  claimed: number;
  done: number;
  failed: number;
  retried: number;
  inserted: number;
  patched: number;
  deleted: number;
}

/**
 * Works through pending tasks, oldest first.
 *
 * Bounded by `limit` because this runs in a serverless function with a wall
 * clock: it is better to do fifty and be invoked again than to do four hundred
 * and be killed at three hundred and ninety with nothing recorded.
 *
 * Takes the real client rather than the `Db` union the rest of the file
 * accepts: claiming a batch opens a transaction of its own, and it must not be
 * nested inside a caller's.
 */
export async function drain(
  db: PrismaClient,
  limit = 50,
): Promise<DrainReport> {
  const report: DrainReport = {
    claimed: 0,
    done: 0,
    failed: 0,
    retried: 0,
    inserted: 0,
    patched: 0,
    deleted: 0,
  };
  if (!syncEnabled()) return report;

  const tasks = await claim(db, limit);
  report.claimed = tasks.length;

  for (const task of tasks) {
    try {
      const counts = await reconcile(db, task.connectionId, task.eventId);
      report.inserted += counts.inserted;
      report.patched += counts.patched;
      report.deleted += counts.deleted;
      await db.calendarSyncTask.update({
        where: { id: task.id },
        data: { status: CalendarTaskStatus.DONE, lastError: null },
      });
      report.done += 1;
    } catch (error) {
      const permanent =
        error instanceof google.GoogleError && error.permanent;
      const attempts = task.attempts + 1;
      const giveUp = permanent || attempts >= MAX_ATTEMPTS;
      await db.calendarSyncTask.update({
        where: { id: task.id },
        data: {
          attempts,
          status: giveUp ? CalendarTaskStatus.FAILED : CalendarTaskStatus.PENDING,
          // Exponential, so a Google outage backs off instead of hammering.
          nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
          lastError: String(error).slice(0, 500),
        },
      });
      if (giveUp) report.failed += 1;
      else report.retried += 1;
    }
  }

  return report;
}

function backoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** (attempts - 1), 6 * 60 * 60_000);
}

/**
 * Takes a batch of tasks and hides them from any other drain.
 *
 * The lease is a pushed-out `nextAttemptAt` rather than a status of its own:
 * one fewer state to reason about, and a drain that dies mid-batch leaves its
 * tasks to be picked up five minutes later rather than stuck in CLAIMED for
 * ever.
 */
async function claim(db: PrismaClient, limit: number) {
  const now = new Date();
  return db.$transaction(async (tx) => {
    const tasks = await tx.calendarSyncTask.findMany({
      where: { status: CalendarTaskStatus.PENDING, nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: "asc" },
      take: limit,
      select: { id: true, connectionId: true, eventId: true, attempts: true },
    });
    if (tasks.length > 0) {
      await tx.calendarSyncTask.updateMany({
        where: { id: { in: tasks.map((t) => t.id) } },
        data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
      });
    }
    return tasks;
  });
}

interface ReconcileCounts {
  inserted: number;
  patched: number;
  deleted: number;
}

/**
 * Makes one person's copy of one event true, whatever state it is in now.
 *
 * The whole design rests on this being a diff rather than a set of commands:
 * what the calendar should hold is derived fresh, compared against what we last
 * wrote, and only the difference is sent. An unchanged event costs one database
 * read and no API call, which is why a nightly resync of an untouched timetable
 * is affordable.
 */
export async function reconcile(
  db: Db,
  connectionId: string,
  eventId: string,
): Promise<ReconcileCounts> {
  const counts: ReconcileCounts = { inserted: 0, patched: 0, deleted: 0 };

  const connection = await db.calendarConnection.findUnique({
    where: { id: connectionId },
  });
  if (connection?.status !== CalendarSyncStatus.ACTIVE) return counts;

  const [desired, mirrors] = await Promise.all([
    desiredOccurrences(db, connection.userId, eventId),
    db.calendarMirror.findMany({ where: { connectionId, eventId } }),
  ]);

  const byOriginalStart = new Map(
    mirrors.map((m) => [m.originalStart.getTime(), m]),
  );

  // Nothing to do at all — the common case for an event this person is not and
  // never was involved in. Bail before asking Google for a token.
  if (desired.length === 0 && mirrors.length === 0) return counts;

  const accessToken = await accessTokenFor(db, connection);
  const calendarId = await ensureCalendar(db, connection, accessToken);

  const timeZone = await orgTimeZone(db, connection.orgId);

  for (const occurrence of desired) {
    const body = toGoogleEvent(occurrence, eventId, timeZone);
    const digest = digestOf(body);
    const mirror = byOriginalStart.get(occurrence.originalStart.getTime());

    if (!mirror) {
      const created = await google.insertEvent(accessToken, calendarId, body);
      await db.calendarMirror.create({
        data: {
          connectionId,
          eventId,
          originalStart: occurrence.originalStart,
          googleEventId: created.id,
          digest,
        },
      });
      counts.inserted += 1;
      continue;
    }

    byOriginalStart.delete(occurrence.originalStart.getTime());
    if (mirror.digest === digest) continue;

    try {
      await google.patchEvent(accessToken, calendarId, mirror.googleEventId, body);
    } catch (error) {
      // Somebody deleted our event by hand. Recreate it rather than failing the
      // task for ever: this calendar is ours to own, and the alternative is a
      // permanently-failed row for a hole nobody can see.
      if (error instanceof google.GoogleError && (error.status === 404 || error.status === 410)) {
        const created = await google.insertEvent(accessToken, calendarId, body);
        await db.calendarMirror.update({
          where: { id: mirror.id },
          data: { googleEventId: created.id, digest },
        });
        counts.inserted += 1;
        continue;
      }
      throw error;
    }

    await db.calendarMirror.update({
      where: { id: mirror.id },
      data: { digest },
    });
    counts.patched += 1;
  }

  // Whatever is left held a mirror and is no longer wanted: the series shrank,
  // the event was deleted, or this person is no longer in the room.
  for (const stale of byOriginalStart.values()) {
    try {
      await google.deleteEvent(accessToken, calendarId, stale.googleEventId);
    } catch (error) {
      // Already gone is the outcome we wanted.
      const gone =
        error instanceof google.GoogleError &&
        (error.status === 404 || error.status === 410);
      if (!gone) throw error;
    }
    await db.calendarMirror.delete({ where: { id: stale.id } });
    counts.deleted += 1;
  }

  await db.calendarConnection.update({
    where: { id: connectionId },
    data: { syncedAt: new Date(), lastError: null },
  });

  return counts;
}

/**
 * The sittings of one event that belong in one person's calendar.
 *
 * Empty when they are not entitled to it, which is what turns "reconcile" into
 * "remove everything I put there".
 */
async function desiredOccurrences(
  db: Db,
  userId: string,
  eventId: string,
): Promise<MirrorableOccurrence[]> {
  const scope = await scopeOf(db, userId);
  if (scope.groupIds.length === 0 && !scope.facultyId) return [];

  const { from, to } = horizon();
  const rows = await db.eventOccurrence.findMany({
    where: {
      eventId,
      start: { lt: to },
      end: { gt: from },
      OR: [
        ...(scope.groupIds.length ? [{ groupId: { in: scope.groupIds } }] : []),
        ...(scope.facultyId ? [{ facultyId: scope.facultyId }] : []),
      ],
    },
    select: {
      start: true,
      end: true,
      status: true,
      room: { select: { code: true } },
      faculty: { select: { shortName: true, user: { select: { name: true } } } },
      group: { select: { name: true, label: true } },
      exception: { select: { originalStart: true, newTitle: true } },
      event: {
        select: {
          title: true,
          notes: true,
          groups: { select: { group: { select: { name: true, label: true } } } },
        },
      },
    },
    orderBy: { start: "asc" },
  });

  return rows.map((row) => {
    const groupNames = [
      ...new Set(
        [
          row.group?.label ?? row.group?.name,
          ...row.event.groups.map((g) => g.group.label ?? g.group.name),
        ].filter((name): name is string => Boolean(name)),
      ),
    ];

    return {
      originalStart: row.exception?.originalStart ?? row.start,
      start: row.start,
      end: row.end,
      title: row.exception?.newTitle ?? row.event.title,
      roomCode: row.room.code,
      facultyName:
        row.faculty?.shortName ?? row.faculty?.user.name ?? null,
      groupNames,
      notes: row.event.notes,
      status: row.status,
      changed: row.exception !== null,
    };
  });
}

const timeZoneCache = new Map<string, string>();

async function orgTimeZone(db: Db, orgId: string): Promise<string> {
  const cached = timeZoneCache.get(orgId);
  if (cached) return cached;
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true },
  });
  const zone = org?.timezone ?? "Asia/Kolkata";
  timeZoneCache.set(orgId, zone);
  return zone;
}

// ─── Tokens and the calendar itself ─────────────────────────────────────────

interface ConnectionRow {
  id: string;
  orgId: string;
  userId: string;
  refreshToken: string;
  accessToken: string | null;
  accessExpiresAt: Date | null;
  calendarId: string | null;
}

/**
 * A usable access token, refreshing it if the stored one is spent.
 *
 * Refreshed a minute early: a token that expires while in flight comes back as
 * a 401, which `isPermanent` quite reasonably treats as fatal, and the cost of
 * being wrong in that direction is somebody's sync switching itself off.
 */
async function accessTokenFor(db: Db, connection: ConnectionRow): Promise<string> {
  const margin = 60_000;
  if (
    connection.accessToken &&
    connection.accessExpiresAt &&
    connection.accessExpiresAt.getTime() - margin > Date.now()
  ) {
    return open(connection.accessToken);
  }

  try {
    const refreshed = await google.refreshAccessToken(open(connection.refreshToken));
    await db.calendarConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: seal(refreshed.access_token),
        accessExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        // Google occasionally issues a replacement; storing it is the
        // difference between a connection that lasts and one that dies in six
        // months for no visible reason.
        ...(refreshed.refresh_token
          ? { refreshToken: seal(refreshed.refresh_token) }
          : {}),
      },
    });
    return refreshed.access_token;
  } catch (error) {
    if (error instanceof google.GoogleError && error.permanent) {
      // Consent is gone. Say so, stop trying, and leave the mirrors: if they
      // reconnect the same account, everything we wrote is still ours to fix
      // rather than duplicate.
      await db.calendarConnection.update({
        where: { id: connection.id },
        data: {
          status: CalendarSyncStatus.REVOKED,
          lastError:
            "Google refused the stored permission. Reconnect to start syncing again.",
        },
      });
    }
    throw error;
  }
}

/**
 * The calendar we own, created on first use.
 *
 * Checked for existence rather than assumed: people delete calendars, and a
 * stored id pointing at nothing would fail every write for ever. Losing it is
 * recoverable — we make a new one and the mirrors, whose Google ids are now
 * meaningless, are rebuilt by the resync that follows.
 */
async function ensureCalendar(
  db: Db,
  connection: ConnectionRow,
  accessToken: string,
): Promise<string> {
  if (connection.calendarId) {
    try {
      await google.getCalendar(accessToken, connection.calendarId);
      return connection.calendarId;
    } catch (error) {
      const missing =
        error instanceof google.GoogleError &&
        (error.status === 404 || error.status === 410);
      if (!missing) throw error;
      await db.calendarMirror.deleteMany({ where: { connectionId: connection.id } });
    }
  }

  const org = await db.organization.findUnique({
    where: { id: connection.orgId },
    select: { name: true, timezone: true },
  });
  const created = await google.createCalendar(
    accessToken,
    calendarSummary(org?.name ?? "Plannr"),
    calendarDescription(env.NEXT_PUBLIC_APP_URL),
    org?.timezone ?? "Asia/Kolkata",
  );
  await db.calendarConnection.update({
    where: { id: connection.id },
    data: { calendarId: created.id },
  });
  return created.id;
}

// ─── Connecting and disconnecting ───────────────────────────────────────────

/**
 * Records a completed consent and queues the first full sync.
 *
 * Reconnecting a *different* Google account is the case worth care: the mirrors
 * we hold name events in a calendar we can no longer reach, so keeping them
 * would mean never re-creating those classes in the new one. They are dropped,
 * and the resync rebuilds from nothing.
 */
export async function recordConnection(
  db: Db,
  params: {
    userId: string;
    orgId: string;
    googleSub: string;
    googleEmail: string;
    refreshToken: string;
    accessToken: string;
    expiresInSeconds: number;
  },
): Promise<string> {
  const existing = await db.calendarConnection.findUnique({
    where: { userId: params.userId },
    select: { id: true, googleSub: true },
  });

  const data = {
    orgId: params.orgId,
    googleSub: params.googleSub,
    googleEmail: params.googleEmail,
    refreshToken: seal(params.refreshToken),
    accessToken: seal(params.accessToken),
    accessExpiresAt: new Date(Date.now() + params.expiresInSeconds * 1000),
    status: CalendarSyncStatus.ACTIVE,
    lastError: null,
  };

  const connection = await db.calendarConnection.upsert({
    where: { userId: params.userId },
    create: { userId: params.userId, ...data },
    update: data,
  });

  if (existing && existing.googleSub !== params.googleSub) {
    await db.calendarMirror.deleteMany({ where: { connectionId: connection.id } });
    await db.calendarConnection.update({
      where: { id: connection.id },
      data: { calendarId: null },
    });
  }

  await enqueueFullResync(db, connection.id);
  return connection.id;
}

/**
 * Switches sync off and takes back what we wrote.
 *
 * Deleting our calendar removes every event in one call, which is both cheaper
 * than deleting them one by one and the only version that is *complete* —
 * nothing depends on our mirror table being an accurate record of what we left
 * behind. The row survives so reconnecting is a click.
 */
export async function disconnect(db: Db, userId: string): Promise<void> {
  const connection = await db.calendarConnection.findUnique({
    where: { userId },
  });
  if (!connection) return;

  if (connection.calendarId && connection.status === CalendarSyncStatus.ACTIVE) {
    try {
      const accessToken = await accessTokenFor(db, connection);
      await google.deleteCalendar(accessToken, connection.calendarId);
    } catch {
      // Already revoked, already deleted, Google down: forgetting the token
      // locally is the part we can guarantee, and it is the part that matters.
    }
  }

  try {
    await google.revokeToken(open(connection.refreshToken));
  } catch {
    // Best effort, as above.
  }

  await db.calendarSyncTask.deleteMany({ where: { connectionId: connection.id } });
  await db.calendarMirror.deleteMany({ where: { connectionId: connection.id } });
  await db.calendarConnection.update({
    where: { id: connection.id },
    data: {
      status: CalendarSyncStatus.PAUSED,
      calendarId: null,
      accessToken: null,
      accessExpiresAt: null,
      lastError: null,
      syncedAt: null,
    },
  });
}

/**
 * Queues a resync for connections nothing has touched lately.
 *
 * This is what keeps the sliding horizon honest. Edit-driven tasks only ever
 * cover events that changed; without this, the class three months out would
 * cross into the window and never be written, and a calendar would quietly
 * stop a few weeks ahead.
 */
export async function sweepStaleConnections(db: Db, limit = 25): Promise<number> {
  if (!syncEnabled()) return 0;

  const stale = await db.calendarConnection.findMany({
    where: {
      status: CalendarSyncStatus.ACTIVE,
      OR: [
        { syncedAt: null },
        { syncedAt: { lt: new Date(Date.now() - RESYNC_AFTER_MS) } },
      ],
    },
    orderBy: { syncedAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: { id: true },
  });

  let queued = 0;
  for (const connection of stale) {
    queued += await enqueueFullResync(db, connection.id);
    // Stamped now so a connection with nothing to do does not come back on
    // every sweep and crowd out the others.
    await db.calendarConnection.update({
      where: { id: connection.id },
      data: { syncedAt: new Date() },
    });
  }
  return queued;
}
