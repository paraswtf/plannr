/**
 * The English, for answers that are read out rather than looked at.
 *
 * Two rules hold across the whole module, and both are load-bearing.
 *
 * It never receives a `Date` and never receives a timezone. Callers hand it
 * numbers — minutes from local midnight, an ISO weekday, a day of the month —
 * which is what lets every function here be asserted over its entire domain in
 * a loop, and what makes it structurally impossible for an ISO timestamp to
 * reach a sentence: there is nothing here to call `toISOString` on.
 *
 * And it emits only commas and full stops. An em dash, a semicolon or the
 * app's own `·` separator all reach a speech engine as something between a
 * silence and a guess, and the app has no way to hear which. Two punctuation
 * marks behave the same everywhere.
 */

/** Indexed by ISO weekday, so index 0 exists only to make the arithmetic plain. */
export const WEEKDAY_NAMES = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Indexed by calendar month, 1–12, for the same reason. */
export const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** The name of an ISO weekday, or an empty string if it is not one. */
export const weekdayName = (isoWeekday: number): string =>
  WEEKDAY_NAMES[isoWeekday] ?? "";

/** The name of a month, 1–12, or an empty string if it is not one. */
export const monthName = (month: number): string => MONTH_NAMES[month] ?? "";

/** Minutes in a day, for the wrapping the clock functions do. */
const DAY_MINUTES = 1440;

/**
 * A clock time as it should be read aloud, from minutes since local midnight.
 *
 * Deliberately the same spelling as `formatHourLabel` in `~/lib/dates` — "9am",
 * "2:30pm" — so that what somebody hears and what they then read on the screen
 * agree with each other. It is not that function, for two reasons. That one
 * takes an instant and a timezone, which would drag `TZDate` into a module
 * whose whole value is being testable without one. And it says "12pm" and
 * "12am", which are the two readings of a clock a listener is most likely to
 * mishear and the two a voice has no prosody to separate; here they become
 * "midday" and "midnight", and nothing else differs.
 *
 * Minutes outside a day wrap rather than being rejected, in both directions: a
 * lecture running past midnight says "12:30am", and a sitting that began on the
 * day before the one being described says the time it began rather than a
 * negative number no clock has.
 */
export function speakTime(minutes: number): string {
  const total =
    ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hour = Math.floor(total / 60);
  const minute = total % 60;

  if (total === 0) return "midnight";
  if (total === 720) return "midday";

  const suffix = hour < 12 ? "am" : "pm";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0
    ? `${h12}${suffix}`
    : `${h12}:${String(minute).padStart(2, "0")}${suffix}`;
}

/** "1st", "2nd", "3rd", "4th" … "21st", "31st". */
export function ordinal(n: number): string {
  // The teens are the exception the last-digit rule gets wrong: 11th, 12th and
  // 13th, not 11st, 12nd and 13rd.
  const teen = n % 100;
  if (teen >= 11 && teen <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
] as const;

/**
 * "one" … "twelve", or null above twelve.
 *
 * A voice reads "3" and "three" identically, so this buys nothing at all when
 * heard. It is here because these strings are also shown on screen — the Siri
 * settings page prints the specimen answers — and words below thirteen is what
 * the rest of the app's prose does.
 */
export function numberWord(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 12) return null;
  return NUMBER_WORDS[n] ?? null;
}

/** "no", "one", "two" … "twelve", then the digits. For counting things aloud. */
export function countWord(n: number): string {
  if (n === 0) return "no";
  return numberWord(n) ?? String(n);
}

/**
 * Both forms named at the call site.
 *
 * This vocabulary is four words — class, break, hour, minute — and a
 * pluralisation engine for four words would be four ways to be wrong about a
 * word nobody thought to check.
 */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * "a" or "an", judged on the sound rather than the spelling.
 *
 * The interesting case is a leading number, because this module says "an 8
 * minute break" and "a 5 minute break" and the difference is audible. The rule
 * reads the leading integer and answers "an" for 8, 11, 18, 80–89 and 800–899,
 * which is every number below a thousand whose spoken form opens on a vowel —
 * and a thousand minutes is longer than any day this app describes. Above that
 * it answers "a" rather than guessing at a number it was never going to see.
 *
 * For words it is vowel-initial except `u`, which is "yoo" in every word this
 * vocabulary contains, plus the one exception where the letter and the sound
 * disagree in the other direction.
 */
export function indefinite(phrase: string): "a" | "an" {
  const text = phrase.trim().toLowerCase();
  if (!text) return "a";

  const leadingNumber = /^(\d+)/.exec(text);
  if (leadingNumber) {
    const n = Number(leadingNumber[1]);
    if (n === 8 || n === 11 || n === 18) return "an";
    const hundreds = Math.floor(n / 100);
    if (hundreds === 8) return "an";
    const tens = Math.floor((n % 100) / 10);
    if (n < 100 && tens === 8) return "an";
    return "a";
  }

  // "hour" is the whole exception list: the h is silent, and every other word
  // this module ever puts an article in front of behaves as it is spelled.
  if (text.startsWith("hour")) return "an";
  return /^[aeio]/.test(text) ? "an" : "a";
}

/** `${indefinite(phrase)} ${phrase}` — the form nearly every caller wants. */
export function withArticle(phrase: string): string {
  return `${indefinite(phrase)} ${phrase}`;
}

/**
 * "" / "A" / "A and B" / "A, B and C".
 *
 * No Oxford comma: British, and one fewer pause for the voice to put in the
 * wrong place.
 */
export function speakList(items: readonly string[]): string {
  const kept = items.filter((item) => item.trim().length > 0);
  if (kept.length === 0) return "";
  if (kept.length === 1) return kept[0]!;
  return `${kept.slice(0, -1).join(", ")} and ${kept[kept.length - 1]!}`;
}

/**
 * A length in the adjectival form that sits in front of a noun: "two hour",
 * "half hour", "hour and a half", "45 minute".
 *
 * Kept apart from `speakDuration` because the two genuinely differ, and running
 * them together is how you end up saying "a two hours break". Every value here
 * is chosen so that `indefinite` produces something that reads naturally in
 * front of it: "an hour break", "a half hour break", "a two hour break".
 */
export function speakLength(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  // Before the minutes branch, or the commonest gap in a college day comes out
  // as "a 30 minute break" — which is not wrong, but is not what is said.
  if (total === 30) return "half hour";
  if (total < 60) return `${total} minute`;

  const hours = Math.floor(total / 60);
  const rest = total % 60;

  if (rest === 0) {
    return hours === 1 ? "hour" : `${numberWord(hours) ?? hours} hour`;
  }
  if (rest === 30) {
    return hours === 1
      ? "hour and a half"
      : `${numberWord(hours) ?? hours} and a half hour`;
  }
  // Anything else is said in plain minutes rather than in an hours-and-minutes
  // phrase nobody uses about a gap between lectures: "an 80 minute break" is
  // how it is spoken, "an hour and twenty minute break" is not.
  return `${total} minute`;
}

/**
 * The standalone noun form: "half an hour", "an hour", "two hours",
 * "40 minutes".
 *
 * Carries its own article where English demands one, which is why it is not
 * simply `speakLength` with an "s" on the end.
 */
export function speakDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total === 30) return "half an hour";
  if (total < 60) return `${total} ${plural(total, "minute", "minutes")}`;

  const hours = Math.floor(total / 60);
  const rest = total % 60;

  if (rest === 0) {
    return hours === 1 ? "an hour" : `${numberWord(hours) ?? hours} hours`;
  }
  if (rest === 30) {
    return hours === 1
      ? "an hour and a half"
      : `${numberWord(hours) ?? hours} and a half hours`;
  }
  return `${total} minutes`;
}

/**
 * A room code as it should be read out.
 *
 * The codes in the live import are three digits — 203, 307, 404 — with a few
 * named rooms like SDRC and Terrace; the demo seed adds hyphenated ones like
 * A-101 and K-Lab2. Read verbatim, a voice turns the hyphen into "minus" and
 * 101 into "a hundred and one", and nobody has ever said "room A minus a
 * hundred and one" out loud.
 *
 * So: separators become spaces, a letter run and a digit run are parted, and a
 * run of two or more digits is split into single digits. "403" becomes "4 0 3",
 * which a voice reads as "four oh three" — which is what a person says. A lone
 * digit is left whole, so K-Lab2 is "K Lab 2" rather than being spelled out for
 * no gain.
 *
 * What it deliberately does not do is expand abbreviations. "Aud" is probably
 * the auditorium, but a table saying so would be a second naming authority that
 * nobody maintains, and the first time it is wrong it sends somebody to the
 * wrong building. This changes how a code is read; it never changes what the
 * code is.
 */
export function speakRoom(code: string): string {
  const parted = code
    .trim()
    .replace(/[-_/.]+/g, " ")
    // A letter meeting a digit, in either order, is a boundary a voice should
    // hear: "K Lab 2", not "KLab2".
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  return parted
    .split(" ")
    .map((part) => (/^\d{2,}$/.test(part) ? part.split("").join(" ") : part))
    .join(" ");
}

/**
 * An event's title, tidied for speech.
 *
 * The fallback matters more than it looks: a title is free text somebody typed,
 * and an empty one would otherwise produce "your next class is , in room 403".
 */
export function speakTitle(raw: string | null | undefined): string {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : "a class";
}

/** "Monday the 15th of September" — for a day too far off to name by weekday. */
export function speakDate(wall: {
  isoWeekday: number;
  day: number;
  month: number;
}): string {
  return `${weekdayName(wall.isoWeekday)} the ${ordinal(wall.day)} of ${monthName(wall.month)}`;
}
