import { TZDate } from "@date-fns/tz";

/** The institution's timezone. Everything user-facing is rendered in this zone. */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * What the time pickers snap to: dragging on a calendar and stepping a time
 * field both move in quarter hours, whatever the org's booking slot length is.
 * Nothing stores this — a typed time is honoured to the minute.
 */
export const SNAP_MINUTES = 15;

/** Calendar fields of an instant, as read in a particular timezone. */
export interface WallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Reads a UTC instant as wall-clock fields in `timeZone`. */
export function toWallTime(instant: Date, timeZone: string): WallTime {
  const zoned = new TZDate(instant, timeZone);
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
    hour: zoned.getHours(),
    minute: zoned.getMinutes(),
    second: zoned.getSeconds(),
  };
}

/** Resolves wall-clock fields in `timeZone` back to a UTC instant. */
export function fromWallTime(wall: WallTime, timeZone: string): Date {
  const zoned = new TZDate(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    0,
    timeZone,
  );
  return new Date(zoned.getTime());
}

/** Minutes elapsed since local midnight — the unit OrgSettings uses for hours. */
export function minutesOfDay(instant: Date, timeZone: string): number {
  const wall = toWallTime(instant, timeZone);
  return wall.hour * 60 + wall.minute;
}

/** Hours since local midnight as a decimal, e.g. 9.5 for 09:30. The timetable grid's unit. */
export function decimalHour(instant: Date, timeZone: string): number {
  return minutesOfDay(instant, timeZone) / 60;
}

/** ISO weekday in `timeZone`: 1 = Monday … 7 = Sunday. */
export function isoWeekday(instant: Date, timeZone: string): number {
  const day = new TZDate(instant, timeZone).getDay();
  return day === 0 ? 7 : day;
}

/** Local midnight of the day containing `instant`, as a UTC instant. */
export function startOfLocalDay(instant: Date, timeZone: string): Date {
  const wall = toWallTime(instant, timeZone);
  return fromWallTime({ ...wall, hour: 0, minute: 0, second: 0 }, timeZone);
}

/** Local midnight after the day containing `instant`, as a UTC instant. */
export function endOfLocalDay(instant: Date, timeZone: string): Date {
  const start = startOfLocalDay(instant, timeZone);
  const wall = toWallTime(start, timeZone);
  return fromWallTime({ ...wall, day: wall.day + 1 }, timeZone);
}

/**
 * The instant at `minutesFromMidnight` on the local day containing `dayAnchor`.
 * Used to turn OrgSettings working hours into concrete bounds.
 */
export function localTimeOnDay(
  dayAnchor: Date,
  minutesFromMidnight: number,
  timeZone: string,
): Date {
  const wall = toWallTime(dayAnchor, timeZone);
  return fromWallTime(
    {
      ...wall,
      hour: 0,
      minute: minutesFromMidnight,
      second: 0,
    },
    timeZone,
  );
}

/** Formats an instant as "9:00am" / "2:30pm", matching the prototype's labels. */
export function formatHourLabel(instant: Date, timeZone: string): string {
  const { hour, minute } = toWallTime(instant, timeZone);
  const suffix = hour < 12 ? "am" : "pm";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0
    ? `${h12}${suffix}`
    : `${h12}:${String(minute).padStart(2, "0")}${suffix}`;
}

/**
 * Reads a typed time as minutes from midnight, or null if it is not one.
 *
 * Deliberately forgiving, because people type times in whatever shape is
 * quickest: "9", "915", "9:15", "9.15", "9:15pm" and "21:15" all land. A bare
 * number is read as a 24-hour clock; am/pm overrides that.
 */
export function parseTimeInput(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return null;

  const match = /^(\d{1,2})(?:[:.]?(\d{2}))?(am|pm|a|p)?$/.exec(text);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const period = match[3]?.[0];
  if (minute > 59) return null;

  if (period) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (period === "p" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

/** Formats minutes from midnight as "9:15am", without needing a day to sit on. */
export function formatMinutesOfDay(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  const suffix = hour < 12 ? "am" : "pm";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0
    ? `${h12}${suffix}`
    : `${h12}:${String(minute).padStart(2, "0")}${suffix}`;
}

/** Formats a length in minutes as "45 min" / "1 hr" / "1 hr 30 min". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** Formats an instant as "Mon 11 Aug" — the day a booking lands on. */
export function formatDayLabel(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(instant);
}

/** Formats an instant as "Mon 11 Aug 2026", for a heading that must be unambiguous. */
export function formatFullDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(instant);
}

/** "August 2026" — the month a calendar grid is showing. */
export function formatMonthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Do these instants fall on the same day, as read in `timeZone`? */
export function isSameLocalDay(a: Date, b: Date, timeZone: string): boolean {
  return (
    startOfLocalDay(a, timeZone).getTime() ===
    startOfLocalDay(b, timeZone).getTime()
  );
}

export function addDays(instant: Date, days: number, timeZone: string): Date {
  const wall = toWallTime(instant, timeZone);
  return fromWallTime({ ...wall, day: wall.day + days }, timeZone);
}

/** Local midnight on the first of the month containing `instant`. */
export function startOfLocalMonth(instant: Date, timeZone: string): Date {
  const wall = toWallTime(instant, timeZone);
  return fromWallTime(
    { ...wall, day: 1, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
}

/**
 * The same day of the month, `months` away, clamped to the month's own length.
 *
 * `addDays` can lean on the fact that a 32nd of January is the 1st of February
 * and mean it. A month cannot: stepping a calendar forward from the 31st of
 * January has to land in February, and rolling over to the 3rd of March would
 * skip the month the reader asked for entirely — then skip another on the way
 * back, so the two arrows would not undo each other.
 */
export function addMonths(
  instant: Date,
  months: number,
  timeZone: string,
): Date {
  const wall = toWallTime(instant, timeZone);
  const target = wall.month - 1 + months;
  const year = wall.year + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  // Day zero of the following month is the last day of this one, which is the
  // shortest way to ask a calendar how long a month is.
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromWallTime(
    {
      ...wall,
      year,
      month: month + 1,
      day: Math.min(wall.day, length),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

/**
 * The span a week covers, written as shortly as it can be said without becoming
 * ambiguous: "10–16 Aug 2026", or "28 Sep – 4 Oct 2026" when it straddles two
 * months, or both years when it straddles new year.
 */
export function formatWeekLabel(monday: Date, timeZone: string): string {
  const sunday = addDays(monday, 6, timeZone);
  const from = toWallTime(monday, timeZone);
  const to = toWallTime(sunday, timeZone);

  const part = (instant: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...opts, timeZone }).format(instant);

  if (from.year !== to.year) {
    return `${part(monday, { day: "numeric", month: "short", year: "numeric" })} - ${part(sunday, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  if (from.month !== to.month) {
    return `${part(monday, { day: "numeric", month: "short" })} - ${part(sunday, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  // Ranges are joined with a plain hyphen, as everywhere else the app writes
  // one: the en dash is the typographer's choice, and on a screen at this size
  // it only reads as a hyphen that came from somewhere else.
  return `${from.day}-${part(sunday, { day: "numeric", month: "short", year: "numeric" })}`;
}
