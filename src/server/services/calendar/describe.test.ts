import { describe, expect, it } from "vitest";

import {
  digestOf,
  toGoogleEvent,
  type MirrorableOccurrence,
} from "./describe";

/**
 * What a class becomes once it is in somebody's calendar.
 *
 * This is the layer worth testing hardest, because it is the one nobody can
 * check by looking: everything here ends up in a calendar we do not own, on a
 * phone, minutes after an administrator moved a lecture. The two things that go
 * wrong are silent — a cancelled class that reads as though it is still on, and
 * a digest that misses a field so an edit never gets pushed at all.
 */

const TZ = "Asia/Kolkata";

function occurrence(over: Partial<MirrorableOccurrence> = {}): MirrorableOccurrence {
  return {
    originalStart: new Date("2026-09-01T04:30:00.000Z"),
    start: new Date("2026-09-01T04:30:00.000Z"),
    end: new Date("2026-09-01T05:30:00.000Z"),
    title: "Data Structures",
    roomCode: "A-204",
    facultyName: "Dr. Rao",
    groupNames: ["BCA-A"],
    notes: null,
    status: "CONFIRMED",
    changed: false,
    ...over,
  };
}

describe("a class as a Google event", () => {
  it("carries the title, the room and the hour", () => {
    const body = toGoogleEvent(occurrence(), "evt_1", TZ);

    expect(body.summary).toBe("Data Structures");
    expect(body.location).toBe("A-204");
    expect(body.start).toEqual({
      dateTime: "2026-09-01T04:30:00.000Z",
      timeZone: TZ,
    });
    expect(body.end).toEqual({
      dateTime: "2026-09-01T05:30:00.000Z",
      timeZone: TZ,
    });
    expect(body.transparency).toBe("opaque");
  });

  it("says who is teaching and who is in the room", () => {
    const body = toGoogleEvent(occurrence(), "evt_1", TZ);
    expect(body.description).toContain("Dr. Rao");
    expect(body.description).toContain("BCA-A");
  });

  it("stamps the event with what produced it", () => {
    // The occurrence id is deliberately not used: regeneration reissues those
    // on every edit, so the stamp has to name something that survives one.
    const body = toGoogleEvent(occurrence(), "evt_1", TZ);
    expect(body.extendedProperties.private).toEqual({
      plannrEventId: "evt_1",
      plannrOriginalStart: "2026-09-01T04:30:00.000Z",
    });
  });

  describe("when the class is cancelled", () => {
    const body = toGoogleEvent(
      occurrence({ status: "CANCELLED" }),
      "evt_1",
      TZ,
    );

    it("says so in the title, where it will actually be read", () => {
      expect(body.summary).toBe("Cancelled — Data Structures");
    });

    it("stops holding the hour", () => {
      // Otherwise a cancelled 9am still makes them look busy at 9am, which is
      // the practical thing a calendar is being asked.
      expect(body.transparency).toBe("transparent");
    });

    it("stays visible rather than being hidden by Google", () => {
      // `status: "cancelled"` would remove it from the calendar entirely — the
      // silent disappearance the whole approach exists to avoid.
      expect(body.status).toBe("confirmed");
      expect(body.description).toContain("cancelled");
    });
  });

  it("marks a sitting that was moved out of its usual slot", () => {
    const body = toGoogleEvent(
      occurrence({
        start: new Date("2026-09-01T08:30:00.000Z"),
        end: new Date("2026-09-01T09:30:00.000Z"),
        changed: true,
      }),
      "evt_1",
      TZ,
    );
    expect(body.description).toContain("Rescheduled");
    // The stamp still names the original slot, which is what lets the next
    // sync find this same Google event rather than making a second one.
    expect(body.extendedProperties.private.plannrOriginalStart).toBe(
      "2026-09-01T04:30:00.000Z",
    );
  });

  it("omits a location it does not have", () => {
    const body = toGoogleEvent(occurrence({ roomCode: null }), "evt_1", TZ);
    expect(body.location).toBeUndefined();
  });
});

describe("the digest", () => {
  const base = toGoogleEvent(occurrence(), "evt_1", TZ);

  it("is stable for an unchanged class", () => {
    // The whole point: a resync of an untouched timetable must make no API
    // calls at all.
    expect(digestOf(toGoogleEvent(occurrence(), "evt_1", TZ))).toBe(
      digestOf(base),
    );
  });

  // Every field that reaches the calendar, one at a time. A field missing from
  // the digest is a field that silently stops updating — the failure mode is
  // an edit that saves cleanly and never arrives, which is unfindable from the
  // outside, so each one is pinned here rather than trusted.
  const changes: Array<[string, Partial<MirrorableOccurrence>]> = [
    ["a retitled class", { title: "Algorithms" }],
    ["a moved room", { roomCode: "B-101" }],
    ["a new time", { start: new Date("2026-09-01T06:30:00.000Z") }],
    ["a new end", { end: new Date("2026-09-01T06:00:00.000Z") }],
    ["a different lecturer", { facultyName: "Dr. Iyer" }],
    ["another section joining", { groupNames: ["BCA-A", "BCA-B"] }],
    ["a note added", { notes: "Bring laptops" }],
    ["a cancellation", { status: "CANCELLED" }],
    ["being rescheduled", { changed: true }],
  ];

  it.each(changes)("changes for %s", (_label, over) => {
    expect(digestOf(toGoogleEvent(occurrence(over), "evt_1", TZ))).not.toBe(
      digestOf(base),
    );
  });

  it("is short enough to store cheaply", () => {
    expect(digestOf(base)).toHaveLength(22);
  });
});
