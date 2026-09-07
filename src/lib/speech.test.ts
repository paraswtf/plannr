import { describe, expect, it } from "vitest";

import {
  countWord,
  indefinite,
  numberWord,
  ordinal,
  plural,
  speakDate,
  speakDuration,
  speakLength,
  speakList,
  speakRoom,
  speakTime,
  speakTitle,
  withArticle,
} from "./speech";

/**
 * The words a voice reads out.
 *
 * Worth testing far more heavily than its size suggests, because every fault in
 * here is one nobody sees: it is heard once, by one person, on a phone, and
 * "your next class is a two hours break" is the kind of thing that gets noticed
 * and never reported. The domains are small enough to walk end to end, so
 * several of these do exactly that rather than sampling.
 */

describe("speakTime", () => {
  it("names the two times a listener is most likely to mishear", () => {
    // "12pm" and "12am" are the same word to a voice with no prosody to spare.
    expect(speakTime(0)).toBe("midnight");
    expect(speakTime(720)).toBe("midday");
  });

  it("spells the hour the way the screen does", () => {
    expect(speakTime(9 * 60)).toBe("9am");
    expect(speakTime(14 * 60 + 30)).toBe("2:30pm");
    expect(speakTime(18 * 60)).toBe("6pm");
    expect(speakTime(12 * 60 + 30)).toBe("12:30pm");
  });

  it("says a clock time for every minute of the day", () => {
    // The whole domain, because the 12-hour conversion has four edges in it and
    // three of them are one minute wide.
    for (let m = 0; m < 1440; m++) {
      const said = speakTime(m);
      expect(said, `minute ${m}`).not.toContain("undefined");
      expect(said, `minute ${m}`).not.toContain("NaN");
      if (m !== 0 && m !== 720) {
        expect(said, `minute ${m}`).toMatch(
          /^(1[0-2]|[1-9])(:[0-5]\d)?(am|pm)$/,
        );
      }
    }
  });

  it("wraps rather than inventing a clock", () => {
    // A lecture running past midnight, and a sitting that began on the day
    // before the one being described — the negative is the case that reaches
    // here from a day-overlap query.
    expect(speakTime(24 * 60 + 30)).toBe("12:30am");
    expect(speakTime(-30)).toBe("11:30pm");
    expect(speakTime(-1440)).toBe("midnight");
  });
});

describe("ordinal", () => {
  it("gets the teens right, which the last-digit rule does not", () => {
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
  });

  it("covers every day a month can have", () => {
    const expected: Record<number, string> = {
      1: "1st",
      2: "2nd",
      3: "3rd",
      21: "21st",
      22: "22nd",
      23: "23rd",
      31: "31st",
    };
    for (let d = 1; d <= 31; d++) {
      expect(ordinal(d), `day ${d}`).toBe(expected[d] ?? `${d}th`);
    }
  });
});

describe("indefinite", () => {
  it("hears the number rather than reading it", () => {
    // The audible cases: "an 8 minute break", "a 5 minute break".
    expect(indefinite("8 minute break")).toBe("an");
    expect(indefinite("11 minute break")).toBe("an");
    expect(indefinite("18 minute break")).toBe("an");
    expect(indefinite("85 minute break")).toBe("an");
    expect(indefinite("5 minute break")).toBe("a");
    expect(indefinite("40 minute break")).toBe("a");
    expect(indefinite("90 minute break")).toBe("a");
  });

  it("knows the one word whose letter and sound disagree", () => {
    expect(indefinite("hour")).toBe("an");
    expect(indefinite("hour and a half")).toBe("an");
    expect(indefinite("half hour")).toBe("a");
  });

  it("treats a leading u as the consonant it is spoken as", () => {
    expect(indefinite("university lecture")).toBe("a");
    expect(indefinite("early class")).toBe("an");
  });

  it("never leaves an empty phrase without an answer", () => {
    expect(indefinite("")).toBe("a");
    expect(indefinite("   ")).toBe("a");
  });
});

describe("speakLength and speakDuration", () => {
  it("says the adjective and the noun differently, which is the point", () => {
    // "a two hours break" is the fault the two functions exist to prevent.
    expect(withArticle(speakLength(120))).toBe("a two hour");
    expect(speakDuration(120)).toBe("two hours");
    expect(withArticle(speakLength(60))).toBe("an hour");
    expect(speakDuration(60)).toBe("an hour");
    expect(withArticle(speakLength(30))).toBe("a half hour");
    expect(speakDuration(30)).toBe("half an hour");
    expect(withArticle(speakLength(90))).toBe("an hour and a half");
    expect(speakDuration(90)).toBe("an hour and a half");
  });

  it("falls back to plain minutes rather than an hours-and-minutes phrase", () => {
    // "an hour and twenty minute break" is not how anybody says it.
    expect(speakLength(80)).toBe("80 minute");
    expect(speakDuration(80)).toBe("80 minutes");
    expect(speakDuration(45)).toBe("45 minutes");
    expect(speakDuration(1)).toBe("1 minute");
  });

  it("reads naturally with its article at every length a day can hold", () => {
    // The break threshold is half an hour and a college day is under twelve, so
    // this is the whole range these two are ever asked about.
    for (let m = 30; m <= 12 * 60; m += 5) {
      const adjectival = withArticle(speakLength(m));
      const noun = speakDuration(m);
      for (const said of [adjectival, noun]) {
        expect(said, `${m} minutes`).not.toContain("undefined");
        expect(said, `${m} minutes`).not.toContain("NaN");
      }
      // The adjective never carries a plural, or the noun after it disagrees.
      expect(adjectival, `${m} minutes`).not.toMatch(/hours|minutes/);
    }
  });
});

describe("speakList", () => {
  it("joins the way somebody speaking would", () => {
    expect(speakList([])).toBe("");
    expect(speakList(["Design Thinking"])).toBe("Design Thinking");
    expect(speakList(["Design Thinking", "Statistics"])).toBe(
      "Design Thinking and Statistics",
    );
    expect(speakList(["Design Thinking", "Statistics", "Java"])).toBe(
      "Design Thinking, Statistics and Java",
    );
  });

  it("drops the blanks rather than reading a gap", () => {
    expect(speakList(["Design Thinking", "", "  ", "Java"])).toBe(
      "Design Thinking and Java",
    );
  });
});

describe("speakRoom", () => {
  it("reads a number the way a person says it", () => {
    // The live SICSR estate is three-digit rooms, and "four oh three" is what
    // is said in the corridor — not "four hundred and three".
    expect(speakRoom("403")).toBe("4 0 3");
    expect(speakRoom("203")).toBe("2 0 3");
  });

  it("keeps a named room whole", () => {
    expect(speakRoom("SDRC")).toBe("SDRC");
    expect(speakRoom("Terrace")).toBe("Terrace");
  });

  it("takes the hyphen out before a voice calls it minus", () => {
    expect(speakRoom("A-101")).toBe("A 1 0 1");
    expect(speakRoom("K-Lab2")).toBe("K Lab 2");
    expect(speakRoom("T-Studio")).toBe("T Studio");
    expect(speakRoom("K-Aud")).toBe("K Aud");
  });

  it("leaves a lone digit alone rather than spelling it out pointlessly", () => {
    expect(speakRoom("T-01")).toBe("T 0 1");
    expect(speakRoom("Lab 3")).toBe("Lab 3");
  });
});

describe("speakTitle", () => {
  it("stands in for a title somebody left empty", () => {
    // Otherwise: "your next class is , in room 403".
    expect(speakTitle("")).toBe("a class");
    expect(speakTitle("   ")).toBe("a class");
    expect(speakTitle(null)).toBe("a class");
    expect(speakTitle(undefined)).toBe("a class");
  });

  it("collapses the whitespace a paste leaves behind", () => {
    expect(speakTitle("  Design   Thinking\n")).toBe("Design Thinking");
  });
});

describe("countWord and friends", () => {
  it("counts in words up to twelve and in digits after", () => {
    expect(countWord(0)).toBe("no");
    expect(countWord(1)).toBe("one");
    expect(countWord(12)).toBe("twelve");
    expect(countWord(13)).toBe("13");
    expect(numberWord(13)).toBeNull();
  });

  it("names both plural forms at the call site", () => {
    expect(plural(1, "class", "classes")).toBe("class");
    expect(plural(0, "class", "classes")).toBe("classes");
    expect(plural(3, "class", "classes")).toBe("classes");
  });
});

describe("speakDate", () => {
  it("names a day too far off to call by its weekday alone", () => {
    expect(speakDate({ isoWeekday: 1, day: 15, month: 9 })).toBe(
      "Monday the 15th of September",
    );
    expect(speakDate({ isoWeekday: 3, day: 1, month: 1 })).toBe(
      "Wednesday the 1st of January",
    );
  });
});
