import { describe, expect, it } from "vitest";

import {
  anyClassesSpeech,
  dayStartSpeech,
  nextClassSpeech,
  parseDayWord,
  timingsSpeech,
  type SpokenDay,
  type SpokenSitting,
} from "~/lib/siri-answers";
import { ROUTES } from "~/server/rest/registry";
import { SIRI_ENDPOINTS, siriUrl } from "./endpoints";

/**
 * The instructions on the settings screen are the deliverable, and they are the
 * one part of this feature nothing else checks: a URL printed for somebody to
 * paste into a phone is wrong silently, and the person following it has no way
 * to tell a typo from a broken endpoint.
 *
 * So both halves are pinned against the things they describe. Every path must
 * be a route that actually exists, and every specimen answer must be a sentence
 * the phrasing module can genuinely produce — otherwise the page is showing
 * somebody a promise the server does not keep.
 */

const siriRoutes = ROUTES.filter((route) => route.tag === "Siri");

describe("the paths the screen prints", () => {
  it("are all real endpoints", () => {
    const declared = new Set(siriRoutes.map((route) => route.path));
    for (const endpoint of SIRI_ENDPOINTS) {
      expect(declared, endpoint.path).toContain(endpoint.path);
    }
  });

  it("cover every Siri endpoint there is", () => {
    // The other direction, which is the one that rots: adding a fifth answer
    // and forgetting to teach anybody how to ask for it.
    const shown = new Set(SIRI_ENDPOINTS.map((endpoint) => endpoint.path));
    for (const route of siriRoutes) {
      expect(shown, route.path).toContain(route.path);
    }
  });

  it("are all reachable from a personal key", () => {
    // If one of these were `actor: "session"`, the instructions would be
    // teaching somebody to build a shortcut that answers 403 for ever.
    for (const route of siriRoutes) {
      expect(route.actor, route.path).toBe("person");
      expect(route.method, route.path).toBe("GET");
    }
  });
});

describe("siriUrl", () => {
  it("builds something that can be pasted without editing", () => {
    const [next, dayStart] = SIRI_ENDPOINTS;
    expect(siriUrl("https://plannr.example.edu", next!)).toBe(
      "https://plannr.example.edu/api/v1/siri/next-class",
    );
    // The day is spelled out rather than left to be discovered: what somebody
    // asks a phone at bedtime is about tomorrow.
    expect(siriUrl("https://plannr.example.edu", dayStart!)).toBe(
      "https://plannr.example.edu/api/v1/siri/day-start?day=tomorrow",
    );
  });

  it("does not double the slash when the origin carries one", () => {
    expect(siriUrl("http://localhost:3000/", SIRI_ENDPOINTS[0]!)).toBe(
      "http://localhost:3000/api/v1/siri/next-class",
    );
  });

  it("only puts a day on the endpoints that take one", () => {
    for (const endpoint of SIRI_ENDPOINTS) {
      const url = siriUrl("https://x.test", endpoint);
      expect(url.includes("day="), endpoint.path).toBe(endpoint.day !== null);
    }
  });

  it("offers a day word the parser actually understands", () => {
    for (const endpoint of SIRI_ENDPOINTS) {
      if (!endpoint.day) continue;
      const day = new URL(siriUrl("https://x.test", endpoint)).searchParams.get(
        "day",
      );
      expect(parseDayWord(day), endpoint.path).not.toBeNull();
    }
  });

  it("asks about the day its own name says", () => {
    // The shortcut's name is what somebody says out loud. If it is called
    // "college timings today" and the URL hard-codes tomorrow, the answer is
    // wrong every single time and nothing else would ever catch it.
    for (const endpoint of SIRI_ENDPOINTS) {
      if (!endpoint.day) continue;
      expect(endpoint.phrase.toLowerCase(), endpoint.path).toContain(
        endpoint.day,
      );
      expect(endpoint.specimen.toLowerCase(), endpoint.path).toContain(
        endpoint.day,
      );
    }
  });
});

describe("the specimen answers", () => {
  it("are sentences the server can actually produce", () => {
    /*
     * Not a re-implementation of the phrasing: the same inputs the screen's
     * prose describes, run through the real builders. If somebody changes how a
     * break is worded, this fails and the page is updated with it, rather than
     * quietly advertising a sentence Siri stopped saying a year ago.
     */
    const tomorrow: SpokenDay = {
      offset: 1,
      isoWeekday: 4,
      day: 10,
      month: 9,
      isWorkingDay: true,
    };
    // Each specimen is built for the day its own endpoint asks about, so the
    // one that says "today" in its name is checked against a sentence about
    // today rather than against one that happens to read well.
    const today: SpokenDay = { ...tomorrow, offset: 0, isoWeekday: 3, day: 9 };
    const design: SpokenSitting = {
      title: "Design Thinking",
      startMinutes: 9 * 60,
      endMinutes: 10 * 60,
      roomCode: "403",
    };
    const last: SpokenSitting = {
      title: "Java",
      startMinutes: 15 * 60,
      endMinutes: 16 * 60,
      roomCode: "512",
    };

    const produced: Record<string, string> = {
      "/siri/next-class": nextClassSpeech({
        hasTimetable: true,
        current: null,
        next: { sitting: design, day: tomorrow },
        exhaustive: true,
      }),
      "/siri/day-start": dayStartSpeech({
        hasTimetable: true,
        day: tomorrow,
        first: design,
        alreadyBegun: false,
      }),
      "/siri/timings": timingsSpeech({
        hasTimetable: true,
        day: today,
        spans: [
          { startMinutes: 9 * 60, endMinutes: 12 * 60 + 30 },
          { startMinutes: 14 * 60 + 30, endMinutes: 18 * 60 },
        ],
      }),
      "/siri/any-classes": anyClassesSpeech({
        hasTimetable: true,
        day: tomorrow,
        count: 3,
        first: design,
        last,
        allDone: false,
      }),
    };

    for (const endpoint of SIRI_ENDPOINTS) {
      expect(endpoint.specimen, endpoint.path).toBe(produced[endpoint.path]);
    }
  });
});
