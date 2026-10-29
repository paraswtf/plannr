import { formatHourLabel, isSameLocalDay, addDays } from "./dates";

/**
 * When somebody was last in Plannr, and how a screen says so.
 *
 * Pure, so the session check that records it and the directory that shows it
 * read the same rules, and both can be tested without a database.
 */

/** A visit is written down at most this often, so using the app is not a write per request. */
export const SEEN_EVERY_MS = 15 * 60_000;

/** Whether the session check should write `now` down as the person's last visit. */
export function shouldRecordVisit(
  lastSeenAt: Date | null | undefined,
  now: Date,
): boolean {
  return !lastSeenAt || now.getTime() - lastSeenAt.getTime() >= SEEN_EVERY_MS;
}

const dayMonth = (instant: Date, timeZone: string, withYear: boolean) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone,
  }).format(instant);

/**
 * "Just now", "12 min ago", "Today, 2:05pm", "Yesterday, 9am", "3 Oct", or
 * "3 Oct 2025" once it is another year, read in the institution's timezone.
 * Recorded to the quarter hour, so anything under fifteen minutes is "Just
 * now" rather than a precision the column does not have.
 */
export function lastSeenLabel(
  lastSeenAt: Date | null | undefined,
  now: Date,
  timeZone: string,
): string {
  if (!lastSeenAt) return "Not recorded";
  const minutes = Math.floor((now.getTime() - lastSeenAt.getTime()) / 60_000);
  if (minutes < 15) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (isSameLocalDay(lastSeenAt, now, timeZone)) {
    return `Today, ${formatHourLabel(lastSeenAt, timeZone)}`;
  }
  if (isSameLocalDay(lastSeenAt, addDays(now, -1, timeZone), timeZone)) {
    return `Yesterday, ${formatHourLabel(lastSeenAt, timeZone)}`;
  }
  const sameYear =
    dayMonth(lastSeenAt, timeZone, true).slice(-4) ===
    dayMonth(now, timeZone, true).slice(-4);
  return dayMonth(lastSeenAt, timeZone, !sameYear);
}
