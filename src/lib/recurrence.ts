/**
 * RRULE expansion.
 *
 * The `rrule` package does all of its date arithmetic in UTC, which is wrong for
 * a timetable: "Tuesdays at 09:00" means 09:00 *local*, whatever offset that
 * maps to. The standard workaround is to feed the library "fake UTC" dates —
 * local wall-clock fields labelled as UTC — expand, then convert the results
 * back to real instants.
 *
 * Fake-UTC dates must never escape this module. Everything exported here takes
 * and returns genuine UTC instants.
 */

// `rrule` ships a CommonJS `main`, an ESM `module`, and no `exports` map, so
// the two toolchains disagree about its shape: bundlers (Next, Vite) resolve
// the ESM build and see named exports, while Node's ESM loader resolves the
// CommonJS build and exposes everything under `default`. Reading through both
// keeps this module working in the app, the tests and the seed script alike.
import * as rruleModule from "rrule";

import { fromWallTime, toWallTime, type WallTime } from "./dates";

const rruleExports = rruleModule as typeof rruleModule & {
  default?: typeof rruleModule;
};
const RRule = rruleExports.RRule ?? rruleExports.default!.RRule;

/** Refuse to expand a series into more rows than this. */
export const MAX_OCCURRENCES = 500;

export interface RecurringEventInput {
  startTime: Date;
  endTime: Date;
  timezone: string;
  rrule: string | null;
}

export interface Occurrence {
  start: Date;
  end: Date;
}

export interface ExpandWindow {
  from: Date;
  to: Date;
}

/** Wall-clock fields in `timeZone`, mislabelled as UTC for the rrule library. */
function toFakeUtc(instant: Date, timeZone: string): Date {
  const w = toWallTime(instant, timeZone);
  return new Date(
    Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second),
  );
}

/** Reverses `toFakeUtc`: reads the UTC fields as wall time in `timeZone`. */
function fromFakeUtc(fake: Date, timeZone: string): Date {
  const wall: WallTime = {
    year: fake.getUTCFullYear(),
    month: fake.getUTCMonth() + 1,
    day: fake.getUTCDate(),
    hour: fake.getUTCHours(),
    minute: fake.getUTCMinutes(),
    second: fake.getUTCSeconds(),
  };
  return fromWallTime(wall, timeZone);
}

function buildRule(event: RecurringEventInput): InstanceType<typeof RRule> {
  if (!event.rrule)
    throw new Error("buildRule called on a non-recurring event");
  // The stored string carries no DTSTART; it comes from the event's columns.
  return new RRule({
    ...RRule.parseString(event.rrule),
    dtstart: toFakeUtc(event.startTime, event.timezone),
  });
}

/**
 * Expands a series into concrete occurrences, optionally clipped to a window.
 *
 * An occurrence is included when it *overlaps* the window, not merely when it
 * starts inside it — a 2-hour class starting before `from` is still happening
 * during it.
 */
export function expandSeries(
  event: RecurringEventInput,
  window?: ExpandWindow,
): Occurrence[] {
  const durationMs = event.endTime.getTime() - event.startTime.getTime();

  if (!event.rrule) {
    const single = { start: event.startTime, end: event.endTime };
    if (!window) return [single];
    return single.start < window.to && window.from < single.end ? [single] : [];
  }

  const rule = buildRule(event);

  let starts: Date[];
  if (window) {
    // Widen the lower bound by one duration so an occurrence that began before
    // the window but is still running is not missed.
    const from = new Date(window.from.getTime() - durationMs);
    starts = rule.between(
      toFakeUtc(from, event.timezone),
      toFakeUtc(window.to, event.timezone),
      true,
    );
  } else {
    starts = rule.all((_date: Date, i: number) => i < MAX_OCCURRENCES);
  }

  const occurrences: Occurrence[] = [];
  for (const fakeStart of starts) {
    const start = fromFakeUtc(fakeStart, event.timezone);
    const end = new Date(start.getTime() + durationMs);
    if (window && !(start < window.to && window.from < end)) continue;
    occurrences.push({ start, end });
    if (occurrences.length >= MAX_OCCURRENCES) break;
  }
  return occurrences;
}

export type RRuleValidation =
  { ok: true; count: number } | { ok: false; error: string };

/**
 * Checks a rule is parseable and *bounded*. Unbounded series are rejected
 * because occurrences are materialised: without an end there is nothing to
 * materialise up to, and no background job to extend the horizon later.
 */
export function validateRRule(
  rrule: string,
  event: Omit<RecurringEventInput, "rrule">,
): RRuleValidation {
  let options: Partial<ReturnType<typeof RRule.parseString>>;
  try {
    options = RRule.parseString(rrule);
  } catch (cause) {
    return {
      ok: false,
      error: `Could not read the repeat rule: ${(cause as Error).message}`,
    };
  }

  if (options.freq === undefined) {
    return { ok: false, error: "The repeat rule needs a frequency (FREQ)." };
  }
  if (!options.until && !options.count) {
    return {
      ok: false,
      error:
        "A repeating event must end: set an end date (UNTIL) or a number of occurrences (COUNT).",
    };
  }

  let occurrences: Occurrence[];
  try {
    occurrences = expandSeries({ ...event, rrule });
  } catch (cause) {
    return {
      ok: false,
      error: `Could not expand the repeat rule: ${(cause as Error).message}`,
    };
  }

  if (occurrences.length === 0) {
    return { ok: false, error: "That repeat rule produces no dates." };
  }
  if (occurrences.length >= MAX_OCCURRENCES) {
    return {
      ok: false,
      error: `That repeat rule produces more than ${MAX_OCCURRENCES} events. Shorten the date range.`,
    };
  }
  return { ok: true, count: occurrences.length };
}

/** Human-readable summary, e.g. "every week on Tuesday until December 15, 2026". */
export function describeRRule(rrule: string): string {
  try {
    return RRule.fromString(`RRULE:${rrule}`).toText();
  } catch {
    return "custom repeat";
  }
}

/**
 * Rewrites a rule to stop before `until`. Used when splitting a series for a
 * "this and following events" edit.
 *
 * UNTIL is written as a floating (zone-less) wall-clock stamp, matching how the
 * rest of this module treats recurrence.
 */
export function setUntil(rrule: string, until: Date, timeZone: string): string {
  const options = RRule.parseString(rrule);
  delete options.count;
  options.until = toFakeUtc(until, timeZone);

  const rule = new RRule({ ...options, dtstart: options.until });
  // `toString` emits "RRULE:FREQ=..."; we store the bare value.
  return rule
    .toString()
    .replace(/^RRULE:/, "")
    .replace(/DTSTART[^;\n]*[;\n]?/, "");
}

/**
 * Rewrites a rule's COUNT. Splitting a counted series needs this: the second
 * half must only carry the occurrences that remain, or the split would create
 * more meetings than the original series ever had.
 *
 * Rules bounded by UNTIL need no equivalent — an absolute end date stays correct
 * on both sides of a split.
 */
export function setCount(rrule: string, count: number): string {
  const parts = rrule
    .split(";")
    .filter((part) => !/^COUNT=/i.test(part) && part.length > 0);
  parts.push(`COUNT=${count}`);
  return parts.join(";");
}

export const hasCount = (rrule: string): boolean => /(^|;)COUNT=/i.test(rrule);

/** Builds a bare RRULE value from the pieces the recurrence editor collects. */
export function buildRRule(input: {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  interval?: number;
  byWeekday?: number[]; // 0 = Monday … 6 = Sunday, matching rrule's convention
  until?: Date;
  count?: number;
  timeZone: string;
}): string {
  const parts: string[] = [`FREQ=${input.freq}`];
  if (input.interval && input.interval > 1)
    parts.push(`INTERVAL=${input.interval}`);
  if (input.byWeekday?.length) {
    const codes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
    parts.push(`BYDAY=${input.byWeekday.map((d) => codes[d]).join(",")}`);
  }
  if (input.count) {
    parts.push(`COUNT=${input.count}`);
  } else if (input.until) {
    const w = toWallTime(input.until, input.timeZone);
    const pad = (n: number) => String(n).padStart(2, "0");
    parts.push(
      `UNTIL=${w.year}${pad(w.month)}${pad(w.day)}T${pad(w.hour)}${pad(w.minute)}${pad(w.second)}`,
    );
  }
  return parts.join(";");
}
