import { describe, expect, it } from "vitest";

import { formatMinutesOfDay, parseTimeInput } from "./dates";

/**
 * The booking form parses whatever is typed into its time fields, so the shapes
 * people actually use have to keep working — this is the contract for that.
 */
describe("parseTimeInput", () => {
  it("reads a bare hour as a 24-hour clock", () => {
    expect(parseTimeInput("9")).toBe(9 * 60);
    expect(parseTimeInput("14")).toBe(14 * 60);
    expect(parseTimeInput("0")).toBe(0);
  });

  it("reads the shapes people type for minutes", () => {
    expect(parseTimeInput("9:15")).toBe(9 * 60 + 15);
    expect(parseTimeInput("915")).toBe(9 * 60 + 15);
    expect(parseTimeInput("0915")).toBe(9 * 60 + 15);
    expect(parseTimeInput("9.15")).toBe(9 * 60 + 15);
    expect(parseTimeInput("21:45")).toBe(21 * 60 + 45);
  });

  it("lets am/pm override the 24-hour reading", () => {
    expect(parseTimeInput("9pm")).toBe(21 * 60);
    expect(parseTimeInput("9:15 PM")).toBe(21 * 60 + 15);
    expect(parseTimeInput("9am")).toBe(9 * 60);
    expect(parseTimeInput("12am")).toBe(0);
    expect(parseTimeInput("12pm")).toBe(12 * 60);
    expect(parseTimeInput("12:30am")).toBe(30);
  });

  it("ignores spacing and case", () => {
    expect(parseTimeInput("  9 : 15 pm ")).toBe(21 * 60 + 15);
    expect(parseTimeInput("9:15P")).toBe(21 * 60 + 15);
  });

  it("rejects what is not a time", () => {
    expect(parseTimeInput("")).toBeNull();
    expect(parseTimeInput("   ")).toBeNull();
    expect(parseTimeInput("9:75")).toBeNull();
    expect(parseTimeInput("25:00")).toBeNull();
    expect(parseTimeInput("13pm")).toBeNull();
    expect(parseTimeInput("0pm")).toBeNull();
    expect(parseTimeInput("tea time")).toBeNull();
    expect(parseTimeInput("9:1")).toBeNull();
  });

  it("round-trips through the label the field shows", () => {
    for (const minutes of [
      0,
      15,
      8 * 60 + 30,
      12 * 60,
      13 * 60 + 45,
      23 * 60,
    ]) {
      expect(parseTimeInput(formatMinutesOfDay(minutes))).toBe(minutes);
    }
  });
});

describe("formatMinutesOfDay", () => {
  it("uses the app's 12-hour labels", () => {
    expect(formatMinutesOfDay(0)).toBe("12am");
    expect(formatMinutesOfDay(9 * 60)).toBe("9am");
    expect(formatMinutesOfDay(9 * 60 + 5)).toBe("9:05am");
    expect(formatMinutesOfDay(12 * 60)).toBe("12pm");
    expect(formatMinutesOfDay(13 * 60 + 30)).toBe("1:30pm");
  });

  it("wraps a time that has run past midnight", () => {
    expect(formatMinutesOfDay(24 * 60)).toBe("12am");
    expect(formatMinutesOfDay(25 * 60)).toBe("1am");
  });
});
