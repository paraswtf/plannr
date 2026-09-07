import {
  countWord,
  plural,
  speakDate,
  speakLength,
  speakList,
  speakRoom,
  speakTime,
  speakTitle,
  weekdayName,
  withArticle,
} from "./speech";

/**
 * The four sentences a voice assistant reads out, and the day word it was
 * asked about.
 *
 * Pure, like `speech` beneath it: the router has already reduced every instant
 * to a local clock reading in the college's timezone, so nothing in here knows
 * what a `Date` is. That is what lets the phrasing be tested exhaustively, and
 * it is why an ISO timestamp can never end up being read aloud.
 *
 * The governing rule for all four: **anything that can go wrong in a way a
 * person could fix has to be a sentence.** A Shortcut fetches a URL and speaks
 * a field; an HTTP error reaches it as a failure whose body nobody hears, so
 * Siri says nothing at all and the person has no idea what they got wrong. A
 * day word nobody can parse is therefore answered aloud, with a 200. A failure
 * of the credential stays an HTTP error, because that one is the integrator's
 * problem and they are looking at a response body.
 */

/** One sitting, already reduced to the spoken day's own clock by the router. */
export interface SpokenSitting {
  title: string;
  /** Minutes from local midnight. Past 1440 for a sitting running past it. */
  startMinutes: number;
  endMinutes: number;
  roomCode: string;
}

/** The day being spoken about, as the router read it in the org's timezone. */
export interface SpokenDay {
  /** 0 today, 1 tomorrow, −1 yesterday, and so on. */
  offset: number;
  isoWeekday: number;
  day: number;
  month: number;
  /** False only when OrgSettings says so; a missing settings row means true. */
  isWorkingDay: boolean;
}

/** A span of the day, in minutes from local midnight. */
export interface Span {
  startMinutes: number;
  endMinutes: number;
}

/**
 * What somebody typed into a Shortcut, once it has been understood.
 *
 * A bare weekday means the next one *including today*, because somebody asking
 * on a Monday what their Monday looks like means today. "next monday" is how
 * you say the one after.
 */
export type DaySelector =
  | { kind: "offset"; days: number }
  | { kind: "weekday"; isoWeekday: number; skipToday: boolean }
  | { kind: "date"; year: number; month: number; day: number };

/** What is said when the day word could not be read. */
export const UNKNOWN_DAY =
  "I didn't catch which day you meant. Try today, tomorrow, or a weekday like Monday.";

/**
 * What is said to somebody with neither a student nor a faculty profile.
 *
 * A coordinator runs the timetable without being on it. Answering them with an
 * empty day would be a correct answer to a question nobody asked, and a slow
 * thing to work out from the far side of a phone.
 */
export const NO_TIMETABLE =
  "You haven't got a timetable in Plannr, so there are no classes of your own for me to look at.";

/**
 * How long a gap has to be before it is worth calling a break.
 *
 * Half an hour, and not a number invented here: the note above
 * `GRACE_AFTER_CLASS_MS` in the timetable router already argues that half an
 * hour is "the length of the gap between two back-to-back classes plus room to
 * walk". This is the same judgement asked from the other side. Below it you are
 * changing rooms; at or above it you have time to do something else, which is
 * what a person means by a break.
 *
 * `slotMinutes / 2` was the obvious alternative and is wrong: booking
 * granularity is an administrative unit, and deriving the sentence from it
 * would silently change what "a break" means the day somebody moved the
 * college to half-hour slots.
 */
export const BREAK_MINUTES = 30;

const WEEKDAY_WORDS: Record<string, number> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tues: 2,
  tue: 2,
  wednesday: 3,
  weds: 3,
  wed: 3,
  thursday: 4,
  thurs: 4,
  thur: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 7,
  sun: 7,
};

/**
 * Reads the `?day=` somebody typed on a phone, or null if it is not a day.
 *
 * Forgiving on purpose, and the list of spellings is not hypothetical — these
 * are what a thumb produces in a Shortcut's text field, and a Siri dictation
 * that heard "tomorrow" as "tomorow". Case, spaces and punctuation go first,
 * so "Next Monday" and "next-monday" are one thing.
 */
export function parseDayWord(
  raw: string | undefined | null,
): DaySelector | null {
  const text = (raw ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (text.length === 0) return { kind: "offset", days: 0 };

  if (["today", "tod", "now", "thisday"].includes(text)) {
    return { kind: "offset", days: 0 };
  }
  if (
    [
      "tomorrow",
      "tomorow",
      "tommorow",
      "tommorrow",
      "tmrw",
      "tmr",
      "tom",
    ].includes(text)
  ) {
    return { kind: "offset", days: 1 };
  }
  if (["yesterday", "yday", "yest"].includes(text)) {
    return { kind: "offset", days: -1 };
  }

  const dated = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (dated) {
    const year = Number(dated[1]);
    const month = Number(dated[2]);
    const day = Number(dated[3]);
    // Checked against the real length of the month, not merely against 31.
    // Left to the date arithmetic, the 30th of February would be read as the
    // 1st or 2nd of March and answered about with total confidence — and a
    // wrong day nobody was warned about is worse than a sentence saying the
    // word could not be read. Day zero of the following month is the shortest
    // way to ask a calendar how long a month is.
    if (month < 1 || month > 12 || day < 1) return null;
    const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > length) return null;
    return { kind: "date", year, month, day };
  }

  const skipToday = text.startsWith("next");
  const bare = text.replace(/^(next|this|on|coming)/, "");
  const isoWeekday = WEEKDAY_WORDS[bare];
  if (isoWeekday !== undefined) {
    return { kind: "weekday", isoWeekday, skipToday };
  }

  return null;
}

/** The gaps between spans that are long enough to be worth naming. */
export function breaksIn(
  spans: readonly Span[],
  minMinutes: number = BREAK_MINUTES,
): Span[] {
  const gaps: Span[] = [];
  for (let i = 1; i < spans.length; i++) {
    const before = spans[i - 1]!;
    const after = spans[i]!;
    if (after.startMinutes - before.endMinutes >= minMinutes) {
      gaps.push({
        startMinutes: before.endMinutes,
        endMinutes: after.startMinutes,
      });
    }
  }
  return gaps;
}

/**
 * How a day is named at the front of a sentence.
 *
 * Beyond the week either side, a weekday alone stops being enough — "Tuesday"
 * could be any of them — so it becomes a date.
 */
export function dayName(day: SpokenDay): string {
  if (day.offset === 0) return "today";
  if (day.offset === 1) return "tomorrow";
  if (day.offset === -1) return "yesterday";
  if (day.offset > 1 && day.offset < 7) return weekdayName(day.isoWeekday);
  return speakDate(day);
}

/** The same, positioned in a sentence: "today", "tomorrow", "on Tuesday". */
export function whenPhrase(day: SpokenDay): string {
  const name = dayName(day);
  return name === "today" || name === "tomorrow" || name === "yesterday"
    ? name
    : `on ${name}`;
}

/** "Design Thinking at 9am, in room 4 0 3" — one sitting, said in full. */
function sittingPhrase(sitting: SpokenSitting): string {
  return `${speakTitle(sitting.title)} at ${speakTime(sitting.startMinutes)}, in room ${speakRoom(sitting.roomCode)}`;
}

/**
 * The empty-day sentence, shared by three of the four answers.
 *
 * A day off and a day whose classes were all cancelled are the same rows in the
 * database — there is no holiday table anywhere in the schema — so this does
 * not pretend to know which it is looking at. The one thing it can say for
 * certain is whether the college works that weekday at all.
 */
function nothingOn(day: SpokenDay, lead: "" | "No, "): string {
  const when = whenPhrase(day);
  const had = day.offset < 0 ? "you had" : "you've got";
  const body = !day.isWorkingDay
    ? `${had} no classes ${when}. ${weekdayName(day.isoWeekday)} isn't a working day.`
    : day.offset === 1
      ? `you've got no classes tomorrow, so there's nothing to come in for.`
      : `${had} no classes ${when}.`;
  // The lead is what makes this a reply to "do I have any classes?" rather than
  // a statement, and it is also what would otherwise leave the sentence
  // starting on a lower-case letter for the two answers that pass none.
  return capitalise(`${lead}${body}`);
}

/** First letter up. A spoken sentence still gets read, on the settings page. */
function capitalise(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

/** "a two hour break from 12:30pm to 2:30pm" */
function breakPhrase(gap: Span): string {
  return (
    `${withArticle(speakLength(gap.endMinutes - gap.startMinutes))} break from ` +
    `${speakTime(gap.startMinutes)} to ${speakTime(gap.endMinutes)}`
  );
}

/** 1 — what is on next, whether that is later today or a day from now. */
export function nextClassSpeech(input: {
  hasTimetable: boolean;
  /** The sitting running right now, if there is one. */
  current: SpokenSitting | null;
  /** The first sitting still to begin, and the day it falls on. */
  next: { sitting: SpokenSitting; day: SpokenDay } | null;
  /**
   * Whether the search reached the end of the timetable rather than filling up.
   * False means there may be more beyond what was looked at, so nothing may
   * claim this is the last class — a positive claim the data does not support.
   */
  exhaustive: boolean;
}): string {
  if (!input.hasTimetable) return NO_TIMETABLE;

  const { current, next } = input;

  if (current) {
    const running = `You're in ${speakTitle(current.title)} until ${speakTime(current.endMinutes)}`;
    if (!next) {
      return input.exhaustive
        ? `${running}, and that's your last class on the timetable.`
        : `${running}.`;
    }
    // Later the same day, so the day is not worth naming twice.
    return next.day.offset === 0
      ? `${running}. After that, ${sittingPhrase(next.sitting)}.`
      : `${running}. After that, nothing until ${whenPhrase(next.day)}, ${sittingPhrase(next.sitting)}.`;
  }

  if (!next) {
    return input.exhaustive
      ? "You've got no more classes on the timetable."
      : "I couldn't find another class coming up.";
  }

  return next.day.offset === 0
    ? `Your next class is ${sittingPhrase(next.sitting)}.`
    : `Your next class is ${whenPhrase(next.day)}, ${sittingPhrase(next.sitting)}.`;
}

/** 2 — when the day starts. */
export function dayStartSpeech(input: {
  hasTimetable: boolean;
  day: SpokenDay;
  first: SpokenSitting | null;
  /** True only when the day is today and the first class has already begun. */
  alreadyBegun: boolean;
}): string {
  if (!input.hasTimetable) return NO_TIMETABLE;
  if (!input.first) return nothingOn(input.day, "");

  const { day, first } = input;
  const when = whenPhrase(day);

  if (input.alreadyBegun) {
    // Saying "your day starts at 9" at eleven in the morning is a true sentence
    // that answers the wrong question.
    return `Your day started at ${speakTime(first.startMinutes)} ${when}, with ${sittingPhrase(first)}.`;
  }
  return `Your day starts at ${speakTime(first.startMinutes)} ${when}, with ${sittingPhrase(first)}.`;
}

/** 3 — how long you are in for, and the breaks in the middle. */
export function timingsSpeech(input: {
  hasTimetable: boolean;
  day: SpokenDay;
  /** Merged, clamped to the day, ascending and non-overlapping. */
  spans: readonly Span[];
}): string {
  if (!input.hasTimetable) return NO_TIMETABLE;

  const { day, spans } = input;
  if (spans.length === 0) return nothingOn(day, "");

  const first = spans[0]!;
  const last = spans[spans.length - 1]!;
  const when = whenPhrase(day);
  // A day that has been is described in the tense it happened in. "You're in
  // college from nine to six yesterday" is the kind of sentence that makes a
  // listener stop trusting the rest of them.
  const verb = day.offset < 0 ? "You were" : "You're";
  const from = `${verb} in college from ${speakTime(first.startMinutes)} to ${speakTime(last.endMinutes)} ${when}`;

  const gaps = breaksIn(spans);
  if (gaps.length === 0) {
    // Named rather than left silent: "nine to six" with no qualifier sounds
    // like nine solid hours, and the absence of a break is worth hearing.
    return `${from}, with no real break in between.`;
  }
  /*
   * "break", which is the word people use and the word this feature was asked
   * for. Worth being clear about what it does and does not claim: it is the gap
   * between this person's timetabled classes, and it does not know about a room
   * they booked themselves in the middle of it. Saying "gap between classes"
   * would be more precise and reads badly at the end of a list of two — and the
   * imprecision is bounded, because a self-made booking carries neither the
   * group nor the faculty that `ownedOccurrenceClauses` matches on, so it was
   * never in this answer to begin with.
   */
  return `${from}, with ${speakList(gaps.map(breakPhrase))}.`;
}

/** 4 — is there anything on at all. */
export function anyClassesSpeech(input: {
  hasTimetable: boolean;
  day: SpokenDay;
  count: number;
  first: SpokenSitting | null;
  last: SpokenSitting | null;
  /** True only when the day is today and every one of them has finished. */
  allDone: boolean;
}): string {
  if (!input.hasTimetable) return NO_TIMETABLE;

  const { day, count, first, last } = input;
  if (count === 0 || !first || !last) return nothingOn(day, "No, ");

  const when = whenPhrase(day);
  const how = `${countWord(count)} ${plural(count, "class", "classes")}`;

  if (input.allDone) {
    return `You had ${how} ${when}, and they're all done.`;
  }
  if (count === 1) {
    return `Yes, one class ${when}. ${sittingPhrase(first)}, finishing at ${speakTime(first.endMinutes)}.`;
  }
  return `Yes, ${how} ${when}. First is ${sittingPhrase(first)}, and the last finishes at ${speakTime(last.endMinutes)}.`;
}
