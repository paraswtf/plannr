import {
  addDays,
  formatDayLabel,
  formatFullDate,
  formatHourLabel,
  isSameLocalDay,
  startOfLocalDay,
} from "~/lib/dates";

/**
 * How the inbox says when something happened.
 *
 * Rows sit under a heading for their day, so a row only has to say the time
 * of day, or how long ago for the last hour, when "a few minutes ago" is what
 * somebody wants to know. Read in the institution's zone like every other time
 * in Plannr, so the inbox and the timetable never disagree about which day a
 * change was made on.
 */

/** "Today", "Yesterday", then "Mon 26 Oct", with the year once it is not this one. */
export function dayHeading(instant: Date, now: Date, timeZone: string): string {
  if (isSameLocalDay(instant, now, timeZone)) return "Today";
  if (isSameLocalDay(instant, addDays(now, -1, timeZone), timeZone)) {
    return "Yesterday";
  }
  const sameYear =
    new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone }).format(
      instant,
    ) ===
    new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone }).format(now);
  return sameYear
    ? formatDayLabel(instant, timeZone)
    : formatFullDate(instant, timeZone);
}

/** "Just now", "5 min ago" within the hour, and the clock time after that. */
export function timeLabel(instant: Date, now: Date, timeZone: string): string {
  const minutes = Math.floor((now.getTime() - instant.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  return formatHourLabel(instant, timeZone);
}

/** A key that is the same for every instant on one local day. */
export function dayKey(instant: Date, timeZone: string): number {
  return startOfLocalDay(instant, timeZone).getTime();
}
