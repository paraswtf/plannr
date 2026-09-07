import { z } from "zod";

import {
  addDays,
  fromWallTime,
  isoWeekday,
  startOfLocalDay,
  toWallTime,
} from "~/lib/dates";
import {
  anyClassesSpeech,
  dayStartSpeech,
  nextClassSpeech,
  NO_TIMETABLE,
  parseDayWord,
  timingsSpeech,
  UNKNOWN_DAY,
  type DaySelector,
  type SpokenDay,
  type SpokenSitting,
} from "~/lib/siri-answers";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  orgTimezone,
  ownedOccurrenceClauses,
  profilesOf,
} from "~/server/api/routers/timetable";
import { OCCUPYING_STATUSES } from "~/server/services/conflicts";
import { mergeIntervals } from "~/server/services/free-slots";
import type { Db } from "~/server/services/occurrences";

/**
 * Answers meant to be read out by a voice assistant.
 *
 * Every procedure here returns `{ speech }` and nothing else. That is not a
 * shape anybody would design for an API; it is a shape designed for one client.
 * An Apple Shortcut fetches a URL and reads a value out, and every structured
 * field it does not read is one more step somebody has to add on a phone. So
 * the server does the English and the phone does nothing.
 *
 * The consequence to hold on to is that **anything that can go wrong in a way a
 * person could fix has to be a sentence**, not a status code: a Shortcut hears
 * an HTTP error as silence. A day word nobody can parse is answered aloud, with
 * a 200. A bad credential stays an error, because that one is read by whoever
 * is setting it up, out of a response body.
 *
 * Nothing here decides who may read what. These are `protectedProcedure` and
 * they read the caller's own classes, exactly as `timetable.myDay` does. What
 * makes them reachable from a phone is a personal API key, whose authority is
 * the intersection of its scopes and its owner's own — so a Siri key answers
 * about its owner and can do nothing else whatsoever.
 *
 * The queries are the timetable's own, not copies: `ownedOccurrenceClauses` is
 * the same definition of "mine" the schedule screen and the calendar sync
 * apply. If that rule changes, these sentences change with it, which is the
 * point of importing it rather than rewriting it.
 */

/**
 * The sittings one answer will consider. Far past any real day's worth.
 *
 * This is the only bound on the "what's next" search, and deliberately so.
 * A horizon in days was the obvious second one and had to go: the query is
 * ordered by start and capped by `take`, so the database walks the index and
 * stops either way — but with a horizon, coming back empty would mean "nothing
 * within four months", which is not the same as "nothing left", and the
 * sentence built on it would confidently tell somebody their timetable was over
 * because their next class is in the new term.
 */
const MAX_SITTINGS = 40;

const selectSitting = {
  start: true,
  end: true,
  event: { select: { title: true } },
  room: { select: { code: true } },
} as const;

type SittingRow = {
  start: Date;
  end: Date;
  event: { title: string };
  room: { code: string };
};

const dayInput = z
  .object({
    day: z
      .string()
      .trim()
      .max(24)
      .optional()
      .describe(
        'Which day: "today", "tomorrow", a weekday like "monday" or "tue", or a date as YYYY-MM-DD. Left out, it means today.',
      ),
  })
  .default({});

/** Who is asking, in whose clock, and what the college counts as a working day. */
async function speaker(ctx: { db: Db; orgId: string; actor: { id: string } }) {
  const [timeZone, profiles, settings] = await Promise.all([
    orgTimezone(ctx.db, ctx.orgId),
    profilesOf(ctx.db, ctx.actor.id),
    ctx.db.orgSettings.findUnique({
      where: { orgId: ctx.orgId },
      select: { workingDays: true },
    }),
  ]);

  const belongs = ownedOccurrenceClauses(profiles);
  return {
    timeZone,
    now: new Date(),
    belongs,
    /** Nothing of theirs to look at — a coordinator who neither attends nor teaches. */
    hasTimetable: belongs.length > 0,
    // A missing settings row is no opinion about weekends, not an assertion
    // that there are none. Answering "it isn't a working day" on the strength
    // of an absent row is how somebody gets told Tuesday is a holiday.
    workingDays: settings?.workingDays ?? null,
  };
}

/** Local midnight on the day a parsed day word names. */
function dayFrom(sel: DaySelector, now: Date, timeZone: string): Date {
  switch (sel.kind) {
    case "offset":
      return addDays(startOfLocalDay(now, timeZone), sel.days, timeZone);
    case "weekday": {
      const today = startOfLocalDay(now, timeZone);
      const from = sel.skipToday ? addDays(today, 1, timeZone) : today;
      for (let step = 0; step < 7; step++) {
        const candidate = addDays(from, step, timeZone);
        if (isoWeekday(candidate, timeZone) === sel.isoWeekday)
          return candidate;
      }
      // Unreachable: seven consecutive days hold every weekday exactly once.
      return from;
    }
    case "date":
      // `fromWallTime`, never `new Date("2026-09-08")`. That parses as UTC
      // midnight, which is half past five in the morning here — the right date
      // by luck in a zone east of UTC and the wrong one everywhere west of it.
      return fromWallTime(
        {
          year: sel.year,
          month: sel.month,
          day: sel.day,
          hour: 0,
          minute: 0,
          second: 0,
        },
        timeZone,
      );
  }
}

/** The day, described the way the phrasing module wants it. */
function describeDay(
  day: Date,
  now: Date,
  timeZone: string,
  workingDays: number[] | null,
): SpokenDay {
  const wall = toWallTime(day, timeZone);
  const weekday = isoWeekday(day, timeZone);
  const today = startOfLocalDay(now, timeZone);
  return {
    // Counted in whole local days rather than by dividing a difference in
    // milliseconds, which a daylight-saving change would make off by one. The
    // college does not observe one, but the arithmetic should not be the reason.
    offset: Math.round(
      (day.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
    ),
    isoWeekday: weekday,
    day: wall.day,
    month: wall.month,
    isWorkingDay: workingDays === null || workingDays.includes(weekday),
  };
}

/**
 * A sitting on the clock of the day being spoken about.
 *
 * Minutes are measured from that day's local midnight rather than from the
 * sitting's own, so a lecture that began the night before comes through as a
 * negative start and one running past midnight as a start beyond 1440 — both
 * of which `speakTime` reads as the clock times they are. Rounding to whole
 * minutes because nothing is ever said to the second.
 */
function onDay(row: SittingRow, day: Date): SpokenSitting {
  const minutes = (at: Date) =>
    Math.round((at.getTime() - day.getTime()) / 60_000);
  return {
    title: row.event.title,
    startMinutes: minutes(row.start),
    endMinutes: minutes(row.end),
    roomCode: row.room.code,
  };
}

/**
 * Everything of theirs that overlaps one local day, in order.
 *
 * Overlapping rather than beginning, because that is what `timings` needs: a
 * lecture running in from the night before is time you are in college for. The
 * other two answers want the ones that *begin* on the day — your day does not
 * start at midnight because a class was already running — and filter for it
 * with `beganOn` below.
 */
async function sittingsOn(
  db: Db,
  orgId: string,
  belongs: object[],
  day: Date,
  timeZone: string,
): Promise<SittingRow[]> {
  const to = addDays(day, 1, timeZone);
  return db.eventOccurrence.findMany({
    where: {
      orgId,
      kind: "CLASS",
      status: { in: [...OCCUPYING_STATUSES] },
      start: { lt: to },
      end: { gt: day },
      OR: belongs,
    },
    select: selectSitting,
    orderBy: [{ start: "asc" }, { id: "asc" }],
    take: MAX_SITTINGS,
  });
}

/** Only the sittings that actually begin on the day being asked about. */
const beganOn = (rows: SittingRow[], day: Date, to: Date): SittingRow[] =>
  rows.filter((row) => row.start >= day && row.start < to);

export const siriRouter = createTRPCRouter({
  /**
   * What is on next: later today, tomorrow, or a named day further out.
   *
   * Deliberately *not* given the half-hour grace `nextClassMoment` applies for
   * the schedule screen. That grace exists so the screen does not take the day
   * away mid-sentence while somebody is still in the corridor asking about the
   * lecture that has just ended. "What's next" is a different question, and
   * answering "your next class is Design Thinking at 10" at twenty past is
   * simply wrong.
   */
  nextClass: protectedProcedure.query(async ({ ctx }) => {
    const who = await speaker(ctx);
    if (!who.hasTimetable) return { speech: NO_TIMETABLE };

    const rows = await ctx.db.eventOccurrence.findMany({
      where: {
        orgId: ctx.orgId,
        kind: "CLASS",
        status: { in: [...OCCUPYING_STATUSES] },
        // Measured on the end rather than the start, so a lecture already
        // running still counts as the one you are at — the same judgement
        // `nextClassMoment` makes for the schedule screen.
        end: { gt: who.now },
        OR: who.belongs,
      },
      select: selectSitting,
      orderBy: [{ start: "asc" }, { id: "asc" }],
      take: MAX_SITTINGS,
    });

    const running = rows.find((row) => row.start <= who.now);
    const upcoming = rows.find((row) => row.start > who.now);

    const today = startOfLocalDay(who.now, who.timeZone);
    return {
      speech: nextClassSpeech({
        hasTimetable: true,
        current: running ? onDay(running, today) : null,
        next: upcoming
          ? {
              sitting: onDay(
                upcoming,
                startOfLocalDay(upcoming.start, who.timeZone),
              ),
              day: describeDay(
                startOfLocalDay(upcoming.start, who.timeZone),
                who.now,
                who.timeZone,
                who.workingDays,
              ),
            }
          : null,
        // Only claim there is nothing more when the search genuinely reached
        // the end of the timetable rather than filling its page.
        exhaustive: rows.length < MAX_SITTINGS,
      }),
    };
  }),

  /** When the day starts, for today or a named day. */
  dayStart: protectedProcedure.input(dayInput).query(async ({ ctx, input }) => {
    const selector = parseDayWord(input.day);
    if (!selector) return { speech: UNKNOWN_DAY };

    const who = await speaker(ctx);
    if (!who.hasTimetable) return { speech: NO_TIMETABLE };

    const day = dayFrom(selector, who.now, who.timeZone);
    const rows = beganOn(
      await sittingsOn(ctx.db, ctx.orgId, who.belongs, day, who.timeZone),
      day,
      addDays(day, 1, who.timeZone),
    );
    const first = rows[0];

    return {
      speech: dayStartSpeech({
        hasTimetable: true,
        day: describeDay(day, who.now, who.timeZone, who.workingDays),
        first: first ? onDay(first, day) : null,
        alreadyBegun: first !== undefined && first.start <= who.now,
      }),
    };
  }),

  /**
   * How long you are in college for, and the breaks in the middle.
   *
   * Derived from this person's own sittings rather than from
   * `OrgSettings.dayStartMinutes`. Those are the hours a room may be booked in
   * — identical for everybody in the institution — and "you have a two hour
   * break from half twelve" is not a fact about the building. It is a fact
   * about the gap between this person's two lectures.
   *
   * `mergeIntervals` is the availability search's, so "back to back" means the
   * same thing here as it does there: it merges touching spans as well as
   * overlapping ones, which is exactly right — nine to ten followed by ten to
   * eleven is one stretch in college, not two with a zero-minute gap between.
   */
  timings: protectedProcedure.input(dayInput).query(async ({ ctx, input }) => {
    const selector = parseDayWord(input.day);
    if (!selector) return { speech: UNKNOWN_DAY };

    const who = await speaker(ctx);
    if (!who.hasTimetable) return { speech: NO_TIMETABLE };

    const day = dayFrom(selector, who.now, who.timeZone);
    const to = addDays(day, 1, who.timeZone);
    const rows = await sittingsOn(
      ctx.db,
      ctx.orgId,
      who.belongs,
      day,
      who.timeZone,
    );

    // Clamped to the day before merging, so a lecture running in from the night
    // before contributes the part of it that is actually today rather than
    // stretching the answer back past midnight.
    const merged = mergeIntervals(
      rows.map((row) => ({
        start: row.start < day ? day : row.start,
        end: row.end > to ? to : row.end,
      })),
    );

    const minutes = (at: Date) =>
      Math.round((at.getTime() - day.getTime()) / 60_000);

    return {
      speech: timingsSpeech({
        hasTimetable: true,
        day: describeDay(day, who.now, who.timeZone, who.workingDays),
        spans: merged.map((span) => ({
          startMinutes: minutes(span.start),
          endMinutes: minutes(span.end),
        })),
      }),
    };
  }),

  /** Whether there is anything on at all, and roughly what. */
  anyClasses: protectedProcedure
    .input(dayInput)
    .query(async ({ ctx, input }) => {
      const selector = parseDayWord(input.day);
      if (!selector) return { speech: UNKNOWN_DAY };

      const who = await speaker(ctx);
      if (!who.hasTimetable) return { speech: NO_TIMETABLE };

      const day = dayFrom(selector, who.now, who.timeZone);
      // The ones that begin on the day: "do I have classes tomorrow" is about
      // what is on tomorrow, not about a lab that started tonight.
      const rows = beganOn(
        await sittingsOn(ctx.db, ctx.orgId, who.belongs, day, who.timeZone),
        day,
        addDays(day, 1, who.timeZone),
      );

      // The last to *finish*, which is not always the last to start: a two-hour
      // lab beginning at two ends after a lecture that began at three.
      const latest = rows.reduce<SittingRow | undefined>(
        (last, row) => (!last || row.end > last.end ? row : last),
        undefined,
      );

      return {
        speech: anyClassesSpeech({
          hasTimetable: true,
          day: describeDay(day, who.now, who.timeZone, who.workingDays),
          count: rows.length,
          first: rows[0] ? onDay(rows[0], day) : null,
          last: latest ? onDay(latest, day) : null,
          allDone: latest !== undefined && latest.end <= who.now,
        }),
      };
    }),
});
