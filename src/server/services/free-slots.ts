/**
 * Availability search: "when is this room next free for an hour?"
 *
 * Busy intervals come from the materialised occurrences, so a recurring class
 * blocks its slot without any rule expansion here.
 */

import {
  addDays,
  isoWeekday,
  localTimeOnDay,
  startOfLocalDay,
} from "~/lib/dates";
import { OCCUPYING_STATUSES } from "./conflicts";
import type { Db } from "./occurrences";

export interface FreeSlotQuery {
  orgId: string;
  roomId: string;
  /** Search from this instant onwards. */
  after: Date;
  durationMinutes: number;
  ignoreEventId?: string | null;
  /** How many days ahead to look before giving up. */
  maxDaysAhead?: number;
}

export interface FreeSlot {
  start: Date;
  end: Date;
}

/** Merges overlapping and touching intervals into a minimal busy set. */
export function mergeIntervals(
  intervals: Array<{ start: Date; end: Date }>,
): Array<{ start: Date; end: Date }> {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const merged: Array<{ start: Date; end: Date }> = [
    { start: sorted[0]!.start, end: sorted[0]!.end },
  ];

  for (const current of sorted.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (current.start <= last.end) {
      if (current.end > last.end) last.end = current.end;
    } else {
      merged.push({ start: current.start, end: current.end });
    }
  }
  return merged;
}

/**
 * First slot of `durationMinutes` that fits between the busy intervals, within
 * the working window. Pure, so the stepping logic is testable without a
 * database.
 *
 * Candidate starts sit on a grid anchored at `gridOrigin` — the day's opening
 * time — rather than on absolute epoch multiples. India is UTC+5:30, so an
 * epoch-aligned hourly grid would land on :30 past every local hour.
 */
export function firstFit(
  windowStart: Date,
  windowEnd: Date,
  busy: Array<{ start: Date; end: Date }>,
  durationMinutes: number,
  stepMinutes: number,
  gridOrigin: Date = windowStart,
): FreeSlot | null {
  const durationMs = durationMinutes * 60_000;
  const stepMs = stepMinutes * 60_000;
  const origin = gridOrigin.getTime();
  const merged = mergeIntervals(busy);

  /** Rounds an instant up to the next slot boundary on the grid. */
  const align = (time: number) => {
    if (time <= origin) return origin;
    const steps = Math.ceil((time - origin) / stepMs);
    return origin + steps * stepMs;
  };

  let candidate = align(windowStart.getTime());

  while (candidate + durationMs <= windowEnd.getTime()) {
    const start = new Date(candidate);
    const end = new Date(candidate + durationMs);

    const blocker = merged.find((b) => start < b.end && b.start < end);
    if (!blocker) return { start, end };

    // Jump straight past the blocker rather than crawling step by step.
    const next = align(blocker.end.getTime());
    candidate = next > candidate ? next : candidate + stepMs;
  }
  return null;
}

export async function findNextFreeSlot(
  db: Db,
  query: FreeSlotQuery,
): Promise<FreeSlot | null> {
  const settings = await db.orgSettings.findUnique({
    where: { orgId: query.orgId },
  });
  const org = await db.organization.findUnique({
    where: { id: query.orgId },
    select: { timezone: true },
  });
  if (!settings || !org) return null;

  const timeZone = org.timezone;
  const maxDays = query.maxDaysAhead ?? 14;

  for (let dayOffset = 0; dayOffset <= maxDays; dayOffset++) {
    const anchor =
      dayOffset === 0
        ? query.after
        : addDays(startOfLocalDay(query.after, timeZone), dayOffset, timeZone);

    if (!settings.workingDays.includes(isoWeekday(anchor, timeZone))) continue;

    const dayOpen = localTimeOnDay(anchor, settings.dayStartMinutes, timeZone);
    const dayClose = localTimeOnDay(anchor, settings.dayEndMinutes, timeZone);
    // On the first day, never suggest a slot in the past.
    const windowStart =
      dayOffset === 0 && query.after > dayOpen ? query.after : dayOpen;
    if (windowStart >= dayClose) continue;

    const busy = await db.eventOccurrence.findMany({
      where: {
        orgId: query.orgId,
        roomId: query.roomId,
        status: { in: [...OCCUPYING_STATUSES] },
        start: { lt: dayClose },
        end: { gt: windowStart },
        ...(query.ignoreEventId
          ? { eventId: { not: query.ignoreEventId } }
          : {}),
      },
      select: { start: true, end: true },
      orderBy: { start: "asc" },
    });

    const slot = firstFit(
      windowStart,
      dayClose,
      busy,
      query.durationMinutes,
      settings.slotMinutes,
      dayOpen,
    );
    if (slot) return slot;
  }

  return null;
}
