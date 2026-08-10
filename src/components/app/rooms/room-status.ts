import type { BadgeTone } from "~/components/ui/badge";
import { formatHourLabel } from "~/lib/dates";

export interface RoomOccurrence {
  roomId: string;
  start: Date;
  end: Date;
  title: string;
}

export interface RoomStatus {
  label: string;
  tone: BadgeTone;
  line: string;
  /** Fraction of the working day booked, 0-1. */
  load: number;
}

/**
 * Derives a room's live status from occurrences already in the cache. Pure, so
 * the clock ticking re-renders the badge without re-querying the server.
 */
export function roomStatus(
  occurrences: RoomOccurrence[],
  now: Date,
  timeZone: string,
  workingHours = 10,
): RoomStatus {
  const sorted = [...occurrences].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );

  const inUse = sorted.find((o) => o.start <= now && now < o.end);
  const next = sorted.find((o) => o.start > now);
  const soon =
    next && next.start.getTime() - now.getTime() <= 60 * 60 * 1000
      ? next
      : undefined;

  const bookedMs = sorted.reduce(
    (total, o) => total + (o.end.getTime() - o.start.getTime()),
    0,
  );
  const load = Math.min(1, bookedMs / (workingHours * 60 * 60 * 1000));

  if (inUse) {
    return {
      label: "in use",
      tone: "red",
      line: `${inUse.title} · until ${formatHourLabel(inUse.end, timeZone)}`,
      load,
    };
  }
  if (soon) {
    return {
      label: "booked soon",
      tone: "orange",
      line: `${soon.title} · at ${formatHourLabel(soon.start, timeZone)}`,
      load,
    };
  }
  return {
    label: "free now",
    tone: "green",
    line: next
      ? `next: ${next.title} · ${formatHourLabel(next.start, timeZone)}`
      : "no more bookings today",
    load,
  };
}
