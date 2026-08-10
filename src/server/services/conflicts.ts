/**
 * Conflict detection.
 *
 * Everything is checked against `EventOccurrence`, never against recurrence
 * rules: the materialised rows already have exceptions applied, so a rule that
 * clashes on three Tuesdays out of twelve reports exactly those three.
 *
 * The pure interval logic lives in `intersectOccurrences` so it can be tested
 * without a database.
 */

import type { EventKind, EventStatus } from "../../../generated/prisma";

import { expandSeries, type Occurrence } from "~/lib/recurrence";
import type { Db } from "./occurrences";

/** Statuses that occupy a room. Cancelled and rejected events do not. */
export const OCCUPYING_STATUSES = ["CONFIRMED", "PENDING"] as const;

export type ConflictType = "ROOM" | "FACULTY" | "GROUP" | "CAPACITY";
export type ConflictSeverity = "hard" | "warning";

export interface ClashingOccurrence {
  occurrenceId: string;
  eventId: string;
  title: string;
  start: Date;
  end: Date;
  roomId: string;
  roomCode: string;
  groupLabel: string | null;
  facultyName: string | null;
  status: EventStatus;
  kind: EventKind;
}

export interface Conflict {
  type: ConflictType;
  severity: ConflictSeverity;
  /** The candidate slot that clashes. Absent for capacity warnings. */
  candidate?: Occurrence;
  clashesWith?: ClashingOccurrence;
  /** Populated for CAPACITY conflicts. */
  capacity?: number;
  groupSize?: number;
  message: string;
}

export interface ConflictCandidate {
  orgId: string;
  roomId: string;
  groupId?: string | null;
  facultyId?: string | null;
  startTime: Date;
  endTime: Date;
  timezone: string;
  rrule?: string | null;
  /** Ignore this event's own occurrences — set when editing. */
  excludeEventId?: string | null;
  /** Ignore these specific occurrences — set when editing a single occurrence. */
  excludeOccurrenceIds?: string[];
}

/** Half-open interval overlap: touching at an endpoint is not a clash. */
export function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Two-pointer sweep of candidate slots against existing occupancy. Both inputs
 * must be sorted by start; the result lists every overlapping pair.
 */
export function intersectOccurrences<T extends { start: Date; end: Date }>(
  candidates: Occurrence[],
  existing: T[],
): Array<{ candidate: Occurrence; existing: T }> {
  const hits: Array<{ candidate: Occurrence; existing: T }> = [];
  let from = 0;

  for (const candidate of candidates) {
    // Existing rows ending at or before this candidate's start can never match
    // this or any later candidate, so the window only moves forwards.
    while (from < existing.length && existing[from]!.end <= candidate.start) {
      from++;
    }
    for (let i = from; i < existing.length; i++) {
      const row = existing[i]!;
      if (row.start >= candidate.end) break;
      if (overlaps(candidate.start, candidate.end, row.start, row.end)) {
        hits.push({ candidate, existing: row });
      }
    }
  }
  return hits;
}

const timeRange = (start: Date, end: Date, timeZone: string) => {
  // Imported lazily to keep this module free of date formatting concerns at the
  // top level; the label is only needed for human-readable messages.
  const fmt = new Intl.DateTimeFormat("en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const endFmt = new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${fmt.format(start)}–${endFmt.format(end)}`;
};

/**
 * Finds every clash a candidate event would cause: the room being taken, the
 * teacher being in two places, or the class being double-booked.
 *
 * Capacity is checked separately by `checkCapacity` because it is advisory —
 * booking a room that is slightly too small is allowed, with a warning.
 */
export async function checkConflicts(
  db: Db,
  candidate: ConflictCandidate,
): Promise<Conflict[]> {
  const slots = expandSeries({
    startTime: candidate.startTime,
    endTime: candidate.endTime,
    timezone: candidate.timezone,
    rrule: candidate.rrule ?? null,
  });
  if (slots.length === 0) return [];

  const windowStart = slots.reduce(
    (min, s) => (s.start < min ? s.start : min),
    slots[0]!.start,
  );
  const windowEnd = slots.reduce(
    (max, s) => (s.end > max ? s.end : max),
    slots[0]!.end,
  );

  const dimensions: Array<Record<string, string>> = [{ roomId: candidate.roomId }];
  if (candidate.facultyId) dimensions.push({ facultyId: candidate.facultyId });
  if (candidate.groupId) dimensions.push({ groupId: candidate.groupId });

  const existing = await db.eventOccurrence.findMany({
    where: {
      orgId: candidate.orgId,
      status: { in: [...OCCUPYING_STATUSES] },
      start: { lt: windowEnd },
      end: { gt: windowStart },
      ...(candidate.excludeEventId ? { eventId: { not: candidate.excludeEventId } } : {}),
      ...(candidate.excludeOccurrenceIds?.length
        ? { id: { notIn: candidate.excludeOccurrenceIds } }
        : {}),
      OR: dimensions,
    },
    orderBy: { start: "asc" },
    include: {
      event: { select: { title: true } },
      room: { select: { code: true } },
      group: { select: { label: true, name: true } },
      faculty: { select: { shortName: true, user: { select: { name: true } } } },
    },
  });

  const sortedSlots = [...slots].sort((a, b) => a.start.getTime() - b.start.getTime());
  const hits = intersectOccurrences(sortedSlots, existing);

  const conflicts: Conflict[] = [];
  const seen = new Set<string>();

  for (const { candidate: slot, existing: row } of hits) {
    // A single row can clash on more than one dimension (same room *and* same
    // teacher); report the most specific reason once per pair.
    const type: ConflictType =
      row.roomId === candidate.roomId
        ? "ROOM"
        : candidate.facultyId && row.facultyId === candidate.facultyId
          ? "FACULTY"
          : "GROUP";

    const key = `${type}:${row.id}:${slot.start.getTime()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const clash: ClashingOccurrence = {
      occurrenceId: row.id,
      eventId: row.eventId,
      title: row.event.title,
      start: row.start,
      end: row.end,
      roomId: row.roomId,
      roomCode: row.room.code,
      groupLabel: row.group?.label ?? row.group?.name ?? null,
      facultyName: row.faculty?.shortName ?? row.faculty?.user.name ?? null,
      status: row.status,
      kind: row.kind,
    };

    const when = timeRange(row.start, row.end, candidate.timezone);
    const message =
      type === "ROOM"
        ? `${clash.roomCode} is already booked for ${clash.title} on ${when}.`
        : type === "FACULTY"
          ? `${clash.facultyName ?? "That faculty member"} is already teaching ${clash.title} on ${when}.`
          : `${clash.groupLabel ?? "That group"} already has ${clash.title} on ${when}.`;

    conflicts.push({
      type,
      // A pending request does not own the slot yet, so it only warns.
      severity: row.status === "PENDING" ? "warning" : "hard",
      candidate: slot,
      clashesWith: clash,
      message,
    });
  }

  return conflicts;
}

/**
 * Warns when a room cannot seat the group. Never blocks a booking — the
 * prototype shows this as an amber note, and departments do sometimes
 * deliberately book a small room.
 */
export async function checkCapacity(
  db: Db,
  input: { roomId: string; groupId?: string | null },
): Promise<Conflict | null> {
  if (!input.groupId) return null;

  const [room, groupSize] = await Promise.all([
    db.room.findUnique({
      where: { id: input.roomId },
      select: { capacity: true, code: true },
    }),
    db.studentGroupMembership.count({ where: { groupId: input.groupId } }),
  ]);

  if (!room || groupSize === 0 || room.capacity >= groupSize) return null;

  return {
    type: "CAPACITY",
    severity: "warning",
    capacity: room.capacity,
    groupSize,
    message: `${room.code} seats ${room.capacity}, but this group has ${groupSize} students.`,
  };
}

export const hasHardConflict = (conflicts: Conflict[]): boolean =>
  conflicts.some((c) => c.severity === "hard");
