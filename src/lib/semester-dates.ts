import { DEFAULT_TIMEZONE, toWallTime } from "./dates";

/**
 * Semester start and end dates are calendar dates (`@db.Date`), which Prisma
 * hands back as midnight UTC. Compared against an instant, a semester ending on
 * the 30th stops being current at 00:00 UTC on the 30th (05:30 in Kolkata), a
 * whole day early. Both sides have to be calendar days instead.
 */

/**
 * Today's calendar date in the institution's timezone, as midnight UTC: the
 * shape a `@db.Date` column comes back in, so it compares and queries directly.
 *
 * The day is read in `timeZone`, not from `getUTC*`, because between 00:00 and
 * 05:30 in Kolkata it is already the next day there.
 */
export function todayAsDate(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const { year, month, day } = toWallTime(now, timeZone);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Whether a semester is running on the day `now` falls on, both ends included. */
export function isRunning(
  semester: { startDate: Date; endDate: Date },
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
): boolean {
  const day = todayAsDate(now, timeZone);
  return semester.startDate <= day && day <= semester.endDate;
}
