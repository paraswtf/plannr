/**
 * Deciding whether a request can be granted, and stopping two of them from
 * being granted at once.
 *
 * `checkConflicts` answers "is this slot free *now*", which is the right
 * question when somebody is filling in a booking form. Approval asks something
 * harder. A request has sat in a queue for a day; the timetable has moved since
 * it was made; and — the case that motivated all of this — a second request may
 * be sitting in the same queue asking for the same room at the same hour.
 * Nothing about the first request stops the second from being approved, because
 * neither of them owns the slot yet.
 *
 * Two mechanisms, doing different jobs:
 *
 *   Serialising. `lockResources` takes a transaction-scoped advisory lock on
 *   every room, teacher and group a decision touches. Two approvals for the
 *   same room cannot then run at the same time, so the second one re-checks
 *   *after* the first has committed and sees a room that is now taken. Without
 *   it both re-checks read the same free slot and both write.
 *
 *   Telling. `verdictFor` separates a clash with something confirmed — which
 *   blocks — from a clash with another request nobody has decided yet, which
 *   does not block but is exactly what the approver needs to know before
 *   choosing which of the two to grant. The queue shows those side by side.
 *
 * Why an advisory lock rather than a constraint: the org setting
 * `blockConflicts` lets an administrator deliberately double-book a room, and a
 * database-level exclusion would forbid what the product allows. It would also
 * make `db:import` fail outright the day the college publishes a clash of its
 * own, which it is entitled to do.
 */

import {
  checkCapacity,
  checkConflicts,
  intersectOccurrences,
  type Conflict,
  type ConflictCandidate,
} from "./conflicts";
import { approversOf, slotWords, withNote } from "./notifications/audience";
import { notify } from "./notifications/notify";
import type { Db } from "./occurrences";

import { formatHourLabel } from "~/lib/dates";
import { describeRRule, expandSeries } from "~/lib/recurrence";
import { RequestScope, RequestStatus } from "../../../generated/prisma";

/**
 * Another unapproved proposal that wants a slot this one also wants.
 *
 * Not a conflict: neither side owns the slot, and granting either is
 * legitimate. It is a decision the approver has to make knowingly, which is the
 * whole difference between this and a hard clash.
 */
export interface Contest {
  kind: "booking" | "change";
  id: string;
  title: string;
  requestedBy: string | null;
  start: Date;
  end: Date;
  roomCode: string;
}

export interface Verdict {
  /** Something confirmed is already there. Granting this would double-book. */
  hard: Conflict[];
  /** Worth mentioning, but not a reason to refuse. */
  warnings: Conflict[];
  /** Other undecided requests for the same slot. */
  contested: Contest[];
}

/**
 * A stable 64-bit key for a resource, for `pg_advisory_xact_lock`.
 *
 * Postgres wants a bigint, and cuids are strings, so they are hashed — FNV-1a,
 * which is short enough to read and has no dependencies. A collision costs two
 * unrelated approvals a moment of waiting for each other, and nothing else,
 * which is why a 64-bit non-cryptographic hash is enough.
 */
export function lockKey(kind: string, id: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (const char of `${kind}:${id}`) {
    hash ^= BigInt(char.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  // Postgres advisory locks take a signed bigint.
  return BigInt.asIntN(64, hash);
}

/**
 * Holds every resource a decision touches, until the transaction ends.
 *
 * Sorted, because two approvals touching the same pair of resources in opposite
 * orders would deadlock. Sorting makes the order total and the deadlock
 * impossible.
 */
export async function lockResources(
  tx: Db,
  resources: {
    roomId?: string | null;
    facultyId?: string | null;
    groupIds?: string[];
  },
): Promise<void> {
  const keys = [
    ...(resources.roomId ? [lockKey("room", resources.roomId)] : []),
    ...(resources.facultyId ? [lockKey("faculty", resources.facultyId)] : []),
    ...(resources.groupIds ?? []).map((id) => lockKey("group", id)),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  for (const key of keys) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key}::bigint)`;
  }
}

/** The slots a proposal would occupy, were it granted. */
export function slotsOf(candidate: {
  startTime: Date;
  endTime: Date;
  timezone: string;
  rrule?: string | null;
}): Array<{ start: Date; end: Date }> {
  return expandSeries({
    startTime: candidate.startTime,
    endTime: candidate.endTime,
    timezone: candidate.timezone,
    rrule: candidate.rrule ?? null,
  });
}

/**
 * Everything wrong — or merely worth knowing — about granting this proposal.
 *
 * `excludeRequestId` keeps a request from contesting itself, and
 * `excludeEventId` keeps an event's own sittings from counting as a clash when
 * the proposal is a change to that very event.
 */
export async function verdictFor(
  db: Db,
  candidate: ConflictCandidate,
  options: {
    excludeRequestId?: string;
    /** Dates the series deliberately leaves out; a skipped slot clashes with nothing. */
    skipDates?: Date[];
    checkCapacity?: boolean;
  } = {},
): Promise<Verdict> {
  const skipped = new Set(
    (options.skipDates ?? []).map((date) => date.getTime()),
  );

  const found = await checkConflicts(db, candidate);
  const relevant = found.filter(
    (conflict) =>
      !conflict.candidate || !skipped.has(conflict.candidate.start.getTime()),
  );

  if (options.checkCapacity !== false) {
    const capacity = await checkCapacity(db, {
      roomId: candidate.roomId,
      groupId: candidate.groupId,
    });
    if (capacity) relevant.push(capacity);
  }

  return {
    hard: relevant.filter((conflict) => conflict.severity === "hard"),
    warnings: relevant.filter((conflict) => conflict.severity !== "hard"),
    contested: await contestedBy(
      db,
      candidate,
      skipped,
      options.excludeRequestId,
    ),
  };
}

/**
 * The other undecided proposals that want the same room at the same time.
 *
 * Two populations compete for a slot and they are stored differently: a new
 * booking waits as a PENDING event, and a change to an existing class waits as
 * a request row that has no occurrences at all. Both have to be found, or an
 * approver clears the queue believing each decision independent.
 *
 * The change requests are expanded in memory rather than in SQL because what a
 * proposal *would* occupy is not a predicate over stored columns — a request
 * that only moves the room inherits its times from the event it targets. At a
 * college's scale that is tens of rows, not thousands.
 */
async function contestedBy(
  db: Db,
  candidate: ConflictCandidate,
  skipped: Set<number>,
  excludeRequestId?: string,
): Promise<Contest[]> {
  const wanted = slotsOf(candidate).filter(
    (slot) => !skipped.has(slot.start.getTime()),
  );
  if (wanted.length === 0) return [];

  const from = wanted[0]!.start;
  const to = wanted[wanted.length - 1]!.end;

  const [pendingBookings, openRequests] = await Promise.all([
    db.eventOccurrence.findMany({
      where: {
        orgId: candidate.orgId,
        roomId: candidate.roomId,
        status: "PENDING",
        start: { lt: to },
        end: { gt: from },
        ...(candidate.excludeEventId
          ? { eventId: { not: candidate.excludeEventId } }
          : {}),
      },
      select: {
        start: true,
        end: true,
        eventId: true,
        room: { select: { code: true } },
        event: {
          select: {
            title: true,
            createdBy: { select: { name: true, email: true } },
          },
        },
      },
    }),
    db.eventChangeRequest.findMany({
      where: {
        orgId: candidate.orgId,
        status: RequestStatus.PENDING,
        ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
      },
      select: {
        id: true,
        scope: true,
        originalStart: true,
        newRoomId: true,
        newStartTime: true,
        newEndTime: true,
        newTitle: true,
        cancelling: true,
        requestedBy: { select: { name: true, email: true } },
        newRoom: { select: { code: true } },
        event: {
          select: {
            title: true,
            roomId: true,
            startTime: true,
            endTime: true,
            timezone: true,
            rrule: true,
            room: { select: { code: true } },
          },
        },
      },
    }),
  ]);

  const contested: Contest[] = [];

  for (const sitting of pendingBookings) {
    if (
      !wanted.some(
        (slot) => slot.start < sitting.end && sitting.start < slot.end,
      )
    )
      continue;
    contested.push({
      kind: "booking",
      id: sitting.eventId,
      title: sitting.event.title,
      requestedBy:
        sitting.event.createdBy?.name ?? sitting.event.createdBy?.email ?? null,
      start: sitting.start,
      end: sitting.end,
      roomCode: sitting.room.code,
    });
  }

  for (const request of openRequests) {
    // A request to call something off frees a room rather than wanting one.
    if (request.cancelling) continue;
    const roomId = request.newRoomId ?? request.event.roomId;
    if (roomId !== candidate.roomId) continue;

    const proposed = proposedSlots(request);
    const clash = proposed.find((slot) =>
      wanted.some((want) => want.start < slot.end && slot.start < want.end),
    );
    if (!clash) continue;

    contested.push({
      kind: "change",
      id: request.id,
      title: request.newTitle ?? request.event.title,
      requestedBy: request.requestedBy.name ?? request.requestedBy.email,
      start: clash.start,
      end: clash.end,
      roomCode: request.newRoom?.code ?? request.event.room.code,
    });
  }

  return contested;
}

/** Where a change request's sittings would land. Exported for the queue's use. */
export function proposedSlots(request: {
  scope: string;
  originalStart: Date | null;
  newStartTime: Date | null;
  newEndTime: Date | null;
  event: {
    startTime: Date;
    endTime: Date;
    timezone: string;
    rrule: string | null;
  };
}): Array<{ start: Date; end: Date }> {
  const { event } = request;

  // One sitting moving: it is the occurrence's own date that shifts, not the
  // series' first, so the rule plays no part.
  if (request.scope === "OCCURRENCE") {
    const start =
      request.newStartTime ?? request.originalStart ?? event.startTime;
    const length =
      request.newEndTime && request.newStartTime
        ? request.newEndTime.getTime() - request.newStartTime.getTime()
        : event.endTime.getTime() - event.startTime.getTime();
    return [{ start, end: new Date(start.getTime() + length) }];
  }

  const slots = expandSeries({
    startTime: request.newStartTime ?? event.startTime,
    endTime: request.newEndTime ?? event.endTime,
    timezone: event.timezone,
    rrule: event.rrule,
  });

  // "This and everything after it" starts where the caller said it does.
  if (request.scope === "FOLLOWING" && request.originalStart) {
    const from = request.originalStart.getTime();
    return slots.filter((slot) => slot.start.getTime() >= from);
  }
  return slots;
}

/** Anything at all to say about a proposal, for the queue's summary pip. */
export const verdictSeverity = (
  verdict: Verdict,
): "blocked" | "contested" | "warning" | "clear" =>
  verdict.hard.length > 0
    ? "blocked"
    : verdict.contested.length > 0
      ? "contested"
      : verdict.warnings.length > 0
        ? "warning"
        : "clear";

export { intersectOccurrences };

// ─── Telling people ─────────────────────────────────────────────────────────
//
// Each of these runs inside the transaction that made the news, with its
// client, so the notification exists if and only if the request or the decision
// does. The source keys name the thing that happened, not the attempt, so an
// action that is retried or doubled tells nobody twice.

/** A booking as the person reading about it will want it described. */
interface BookingFacts {
  id: string;
  orgId: string;
  title: string;
  roomId: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  rrule: string | null;
}

async function bookingWords(db: Db, booking: BookingFacts): Promise<string> {
  const room = await db.room.findUnique({
    where: { id: booking.roomId },
    select: { code: true },
  });
  const when = slotWords(booking.startTime, booking.endTime, booking.timezone);
  const repeat = booking.rrule
    ? `, repeats ${describeRRule(booking.rrule)}`
    : "";
  return `${room?.code ?? "A room"}, ${when}${repeat}`;
}

/** A new booking is waiting: every approver but the person asking hears of it. */
export async function notifyBookingRequested(
  db: Db,
  booking: BookingFacts,
  requesterId: string,
): Promise<void> {
  const [approvers, requester, words] = await Promise.all([
    approversOf(db, booking.orgId),
    db.user.findUnique({
      where: { id: requesterId },
      select: { name: true, email: true },
    }),
    bookingWords(db, booking),
  ]);
  await notify(
    db,
    approvers.filter((id) => id !== requesterId),
    {
      orgId: booking.orgId,
      category: "APPROVALS",
      title: "Room booking waiting for approval",
      body: `${requester?.name ?? requester?.email ?? "Someone"} asks for ${words}. ${booking.title}`,
      url: "/approvals",
      sourceKey: `booking-requested:${booking.id}`,
    },
  );
}

/**
 * A class a teacher scheduled for a test is waiting: every approver but the
 * teacher hears of it. Its own words rather than a booking's, because what is
 * being approved is a lecture for a group, not a room for an afternoon.
 */
export async function notifyClassRequested(
  db: Db,
  lecture: BookingFacts,
  requesterId: string,
): Promise<void> {
  const [approvers, requester, words] = await Promise.all([
    approversOf(db, lecture.orgId),
    db.user.findUnique({
      where: { id: requesterId },
      select: { name: true, email: true },
    }),
    bookingWords(db, lecture),
  ]);
  await notify(
    db,
    approvers.filter((id) => id !== requesterId),
    {
      orgId: lecture.orgId,
      category: "APPROVALS",
      title: "Extra class waiting for approval",
      body: `${requester?.name ?? requester?.email ?? "Someone"} asks for ${words}. ${lecture.title}`,
      url: "/approvals",
      sourceKey: `class-requested:${lecture.id}`,
    },
  );
}

/** A booking was granted or refused: the person who asked is told, unless they decided it. */
export async function notifyBookingDecided(
  db: Db,
  booking: BookingFacts & { createdById: string | null },
  decision: { approved: boolean; deciderId: string; note?: string | null },
): Promise<void> {
  if (!booking.createdById || booking.createdById === decision.deciderId)
    return;
  await notify(db, [booking.createdById], {
    orgId: booking.orgId,
    category: "REQUESTS",
    title: decision.approved
      ? "Room booking approved"
      : "Room booking declined",
    body: withNote(await bookingWords(db, booking), decision.note),
    url: "/book",
    sourceKey: `booking-${decision.approved ? "approved" : "declined"}:${booking.id}`,
  });
}

interface ChangeFacts {
  id: string;
  orgId: string;
  requestedById: string;
  scope: RequestScope;
  cancelling: boolean;
  newTitle: string | null;
  newRoomId: string | null;
  newStartTime: Date | null;
  newEndTime: Date | null;
  event: { title: string; startTime: Date; endTime: Date; timezone: string };
}

/** What a change request asks for, in a phrase: "move to room B-2, 11am to 12pm". */
async function changeWords(db: Db, change: ChangeFacts): Promise<string> {
  if (change.cancelling) return "call it off";
  const { event } = change;
  const asks: string[] = [];

  if (change.newRoomId) {
    const room = await db.room.findUnique({
      where: { id: change.newRoomId },
      select: { code: true },
    });
    asks.push(`move to ${room?.code ?? "another room"}`);
  }
  if (change.newStartTime || change.newEndTime) {
    const start = change.newStartTime ?? event.startTime;
    const end = change.newEndTime ?? event.endTime;
    // A series' stored start is its first sitting, which is not a date anybody
    // is asking about; only a single sitting has a day worth naming.
    asks.push(
      change.scope === RequestScope.OCCURRENCE
        ? `reschedule to ${slotWords(start, end, event.timezone)}`
        : `reschedule to ${formatHourLabel(start, event.timezone)} to ${formatHourLabel(end, event.timezone)}`,
    );
  }
  if (change.newTitle) asks.push(`rename it "${change.newTitle}"`);
  return asks.join(", ") || "change it";
}

/** A change request was filed: every approver but the person asking hears of it. */
export async function notifyChangeRequested(
  db: Db,
  change: ChangeFacts,
): Promise<void> {
  const [approvers, requester, words] = await Promise.all([
    approversOf(db, change.orgId),
    db.user.findUnique({
      where: { id: change.requestedById },
      select: { name: true, email: true },
    }),
    changeWords(db, change),
  ]);
  await notify(
    db,
    approvers.filter((id) => id !== change.requestedById),
    {
      orgId: change.orgId,
      category: "APPROVALS",
      title: "Change request waiting for approval",
      body: `${requester?.name ?? requester?.email ?? "Someone"} asks to ${words}: ${change.event.title}`,
      url: "/approvals",
      sourceKey: `change-requested:${change.id}`,
    },
  );
}

/** A change request was granted or refused: the person who asked is told. */
export async function notifyChangeDecided(
  db: Db,
  change: ChangeFacts,
  decision: { approved: boolean; deciderId: string; note?: string | null },
): Promise<void> {
  if (change.requestedById === decision.deciderId) return;
  await notify(db, [change.requestedById], {
    orgId: change.orgId,
    category: "REQUESTS",
    title: decision.approved
      ? "Change request approved"
      : "Change request declined",
    body: withNote(
      `${change.event.title}: ${await changeWords(db, change)}`,
      decision.note,
    ),
    url: "/book",
    sourceKey: `change-${decision.approved ? "approved" : "declined"}:${change.id}`,
  });
}
