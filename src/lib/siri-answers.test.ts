import { describe, expect, it } from "vitest";

import {
  anyClassesSpeech,
  breaksIn,
  dayName,
  dayStartSpeech,
  nextClassSpeech,
  NO_TIMETABLE,
  parseDayWord,
  timingsSpeech,
  whenPhrase,
  type SpokenDay,
  type SpokenSitting,
} from "./siri-answers";

/**
 * The sentences themselves.
 *
 * Two things are worth pinning here and neither is the exact wording. First,
 * that every branch produces a sentence rather than a fragment — no stray
 * "undefined", no bare timestamp, a full stop on the end — because the failure
 * mode of this feature is a phone saying something absurd once, to one person,
 * who never reports it. And second, the handful of places where the obvious
 * phrasing would be a lie: claiming a class is the last one when the search
 * merely ran out of room, or telling somebody their day "starts" at nine when
 * it is already eleven.
 */

/** Wednesday, in a working week. */
const TODAY: SpokenDay = {
  offset: 0,
  isoWeekday: 3,
  day: 9,
  month: 9,
  isWorkingDay: true,
};
const TOMORROW: SpokenDay = { ...TODAY, offset: 1, isoWeekday: 4, day: 10 };
const SUNDAY: SpokenDay = {
  offset: 4,
  isoWeekday: 7,
  day: 13,
  month: 9,
  isWorkingDay: false,
};
const FAR: SpokenDay = {
  offset: 20,
  isoWeekday: 1,
  day: 29,
  month: 9,
  isWorkingDay: true,
};

const sitting = (
  title: string,
  startMinutes: number,
  endMinutes: number,
  roomCode = "403",
): SpokenSitting => ({ title, startMinutes, endMinutes, roomCode });

const DESIGN = sitting("Design Thinking", 9 * 60, 10 * 60);
const JAVA = sitting("Java", 14 * 60 + 30, 16 * 60, "512");

/** Every sentence any of the four can produce, for the shared invariants. */
function everySentence(): string[] {
  const days = [TODAY, TOMORROW, SUNDAY, FAR];
  const out: string[] = [];
  for (const day of days) {
    for (const hasTimetable of [true, false]) {
      for (const first of [null, DESIGN]) {
        out.push(
          dayStartSpeech({ hasTimetable, day, first, alreadyBegun: false }),
        );
        out.push(
          dayStartSpeech({ hasTimetable, day, first, alreadyBegun: true }),
        );
        out.push(
          anyClassesSpeech({
            hasTimetable,
            day,
            count: first ? 2 : 0,
            first,
            last: first ? JAVA : null,
            allDone: false,
          }),
        );
        out.push(
          anyClassesSpeech({
            hasTimetable,
            day,
            count: first ? 1 : 0,
            first,
            last: first,
            allDone: true,
          }),
        );
      }
      for (const spans of [
        [],
        [{ startMinutes: 540, endMinutes: 1080 }],
        [
          { startMinutes: 540, endMinutes: 750 },
          { startMinutes: 870, endMinutes: 1080 },
        ],
      ]) {
        out.push(timingsSpeech({ hasTimetable, day, spans }));
      }
      for (const current of [null, DESIGN]) {
        for (const next of [null, { sitting: JAVA, day }]) {
          for (const exhaustive of [true, false]) {
            out.push(
              nextClassSpeech({ hasTimetable, current, next, exhaustive }),
            );
          }
        }
      }
    }
  }
  return out;
}

describe("every answer, whatever the inputs", () => {
  it("is a whole sentence with nothing leaking through it", () => {
    for (const said of everySentence()) {
      expect(said.length, said).toBeGreaterThan(10);
      expect(said, said).not.toContain("undefined");
      expect(said, said).not.toContain("null");
      expect(said, said).not.toContain("NaN");
      expect(said, said).not.toContain("[object");
      // No ISO timestamp has ever been read aloud usefully.
      expect(said, said).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(said, said).not.toMatch(/T\d{2}:\d{2}/);
      // The app's own separator, and the punctuation a voice guesses at.
      expect(said, said).not.toMatch(/[·—;]/);
      expect(said.trim().endsWith("."), said).toBe(true);
      expect(said[0], said).toBe(said[0]?.toUpperCase());
    }
  });
});

describe("nextClassSpeech", () => {
  it("names the day only when it is not today", () => {
    expect(
      nextClassSpeech({
        hasTimetable: true,
        current: null,
        next: { sitting: JAVA, day: TODAY },
        exhaustive: true,
      }),
    ).toBe("Your next class is Java at 2:30pm, in room 5 1 2.");

    expect(
      nextClassSpeech({
        hasTimetable: true,
        current: null,
        next: { sitting: DESIGN, day: TOMORROW },
        exhaustive: true,
      }),
    ).toBe(
      "Your next class is tomorrow, Design Thinking at 9am, in room 4 0 3.",
    );
  });

  it("says what you are in before what is after it", () => {
    expect(
      nextClassSpeech({
        hasTimetable: true,
        current: DESIGN,
        next: { sitting: JAVA, day: TODAY },
        exhaustive: true,
      }),
    ).toBe(
      "You're in Design Thinking until 10am. After that, Java at 2:30pm, in room 5 1 2.",
    );
  });

  it("does not claim a last class when it only ran out of room to look", () => {
    // The positive claim is the fault: somebody in two cohorts and teaching can
    // have more sittings than one page of the query holds, and "that's your
    // last class" would be flatly wrong rather than merely unhelpful.
    const bounded = nextClassSpeech({
      hasTimetable: true,
      current: DESIGN,
      next: null,
      exhaustive: false,
    });
    expect(bounded).not.toContain("last class");

    expect(
      nextClassSpeech({
        hasTimetable: true,
        current: DESIGN,
        next: null,
        exhaustive: true,
      }),
    ).toContain("last class");
  });

  it("says so plainly when there is no timetable at all", () => {
    expect(
      nextClassSpeech({
        hasTimetable: false,
        current: null,
        next: null,
        exhaustive: true,
      }),
    ).toBe(NO_TIMETABLE);
  });
});

describe("timingsSpeech", () => {
  it("says the day and the break the way the request described it", () => {
    // Nine to six with two hours off in the middle — the shape this endpoint
    // was asked for.
    expect(
      timingsSpeech({
        hasTimetable: true,
        day: TOMORROW,
        spans: [
          { startMinutes: 9 * 60, endMinutes: 12 * 60 + 30 },
          { startMinutes: 14 * 60 + 30, endMinutes: 18 * 60 },
        ],
      }),
    ).toBe(
      "You're in college from 9am to 6pm tomorrow, with a two hour break from 12:30pm to 2:30pm.",
    );
  });

  it("lists several breaks without an Oxford comma to trip the voice", () => {
    const said = timingsSpeech({
      hasTimetable: true,
      day: TODAY,
      spans: [
        { startMinutes: 9 * 60, endMinutes: 10 * 60 },
        { startMinutes: 11 * 60, endMinutes: 12 * 60 },
        { startMinutes: 14 * 60, endMinutes: 15 * 60 },
      ],
    });
    expect(said).toContain("an hour break from 10am to 11am");
    // "midday", not "12pm": the two readings of noon are what a voice has no
    // prosody to separate, so `speakTime` names it.
    expect(said).toContain("and a two hour break from midday to 2pm");
  });

  it("says out loud when there is no break, rather than leaving it silent", () => {
    // "Nine to six" on its own sounds like nine solid hours either way, so the
    // absence has to be stated for the presence to mean anything.
    expect(
      timingsSpeech({
        hasTimetable: true,
        day: TODAY,
        spans: [{ startMinutes: 9 * 60, endMinutes: 13 * 60 }],
      }),
    ).toContain("no real break");
  });

  it("speaks about a day that has been in the tense it happened in", () => {
    // "You're in college from nine to six yesterday" is the kind of sentence
    // that makes a listener stop trusting the rest of them.
    const yesterday: SpokenDay = {
      ...TODAY,
      offset: -1,
      isoWeekday: 2,
      day: 8,
    };
    expect(
      timingsSpeech({
        hasTimetable: true,
        day: yesterday,
        spans: [{ startMinutes: 9 * 60, endMinutes: 13 * 60 }],
      }),
    ).toContain("You were in college");
    expect(
      timingsSpeech({ hasTimetable: true, day: yesterday, spans: [] }),
    ).toContain("You had no classes yesterday");
  });

  it("says a Sunday is not a working day rather than guessing at a holiday", () => {
    const said = timingsSpeech({ hasTimetable: true, day: SUNDAY, spans: [] });
    expect(said).toContain("Sunday isn't a working day");
  });
});

describe("breaksIn", () => {
  it("ignores the walk between two back-to-back lectures", () => {
    expect(
      breaksIn([
        { startMinutes: 540, endMinutes: 600 },
        { startMinutes: 610, endMinutes: 670 },
      ]),
    ).toEqual([]);
  });

  it("counts exactly half an hour as a break", () => {
    // The threshold is inclusive: half an hour is the argued boundary, so it
    // has to fall on the side that names it.
    expect(
      breaksIn([
        { startMinutes: 540, endMinutes: 600 },
        { startMinutes: 630, endMinutes: 690 },
      ]),
    ).toEqual([{ startMinutes: 600, endMinutes: 630 }]);
  });
});

describe("anyClassesSpeech", () => {
  it("answers the yes/no question first, because that is what was asked", () => {
    expect(
      anyClassesSpeech({
        hasTimetable: true,
        day: TOMORROW,
        count: 3,
        first: DESIGN,
        last: JAVA,
        allDone: false,
      }),
    ).toBe(
      "Yes, three classes tomorrow. First is Design Thinking at 9am, in room 4 0 3, and the last finishes at 4pm.",
    );

    expect(
      anyClassesSpeech({
        hasTimetable: true,
        day: TOMORROW,
        count: 0,
        first: null,
        last: null,
        allDone: false,
      }),
    ).toBe(
      "No, you've got no classes tomorrow, so there's nothing to come in for.",
    );
  });

  it("uses the past tense once the day is over", () => {
    const said = anyClassesSpeech({
      hasTimetable: true,
      day: TODAY,
      count: 2,
      first: DESIGN,
      last: JAVA,
      allDone: true,
    });
    expect(said).toContain("You had two classes today");
    expect(said).toContain("all done");
  });
});

describe("dayStartSpeech", () => {
  it("does not say the day starts at nine when it is already eleven", () => {
    expect(
      dayStartSpeech({
        hasTimetable: true,
        day: TODAY,
        first: DESIGN,
        alreadyBegun: true,
      }),
    ).toContain("Your day started at 9am");
    expect(
      dayStartSpeech({
        hasTimetable: true,
        day: TOMORROW,
        first: DESIGN,
        alreadyBegun: false,
      }),
    ).toContain("Your day starts at 9am tomorrow");
  });
});

describe("dayName and whenPhrase", () => {
  it("stops using a weekday once it stops being unambiguous", () => {
    expect(dayName(TODAY)).toBe("today");
    expect(dayName(TOMORROW)).toBe("tomorrow");
    expect(dayName({ ...TODAY, offset: -1 })).toBe("yesterday");
    expect(dayName({ ...TODAY, offset: 3, isoWeekday: 6 })).toBe("Saturday");
    // Three weeks out, "Monday" could be any of them.
    expect(dayName(FAR)).toBe("Monday the 29th of September");
  });

  it("puts the right preposition in front of each", () => {
    expect(whenPhrase(TODAY)).toBe("today");
    expect(whenPhrase({ ...TODAY, offset: 3, isoWeekday: 6 })).toBe(
      "on Saturday",
    );
    expect(whenPhrase(FAR)).toBe("on Monday the 29th of September");
  });
});

describe("parseDayWord", () => {
  it("reads what a thumb actually types", () => {
    expect(parseDayWord(undefined)).toEqual({ kind: "offset", days: 0 });
    expect(parseDayWord("")).toEqual({ kind: "offset", days: 0 });
    expect(parseDayWord("Today")).toEqual({ kind: "offset", days: 0 });
    for (const spelling of ["tomorrow", "Tomorow", "tommorow", "tmrw", "TMR"]) {
      expect(parseDayWord(spelling), spelling).toEqual({
        kind: "offset",
        days: 1,
      });
    }
  });

  it("takes a weekday to mean the next one, today included", () => {
    // Asking on a Monday what Monday looks like means today.
    expect(parseDayWord("monday")).toEqual({
      kind: "weekday",
      isoWeekday: 1,
      skipToday: false,
    });
    expect(parseDayWord("next monday")).toEqual({
      kind: "weekday",
      isoWeekday: 1,
      skipToday: true,
    });
    expect(parseDayWord("Thurs")).toEqual({
      kind: "weekday",
      isoWeekday: 4,
      skipToday: false,
    });
  });

  it("takes a date, and refuses one that is not a date", () => {
    expect(parseDayWord("2026-09-15")).toEqual({
      kind: "date",
      year: 2026,
      month: 9,
      day: 15,
    });
    // Each of these would otherwise roll into a different day and be answered
    // about with total confidence.
    expect(parseDayWord("2026-09-32")).toBeNull();
    expect(parseDayWord("2026-13-01")).toBeNull();
    expect(parseDayWord("2026-09-31")).toBeNull();
    expect(parseDayWord("2026-02-30")).toBeNull();
    // ...but a real leap day is a real day.
    expect(parseDayWord("2028-02-29")).toEqual({
      kind: "date",
      year: 2028,
      month: 2,
      day: 29,
    });
    expect(parseDayWord("2026-02-29")).toBeNull();
  });

  it("gives up rather than guessing", () => {
    expect(parseDayWord("whenever")).toBeNull();
    expect(parseDayWord("the day after tomorrow")).toBeNull();
  });
});
