import { describe, expect, it } from "vitest";

import {
  PermissionBitField,
  PermissionFlags as F,
  SYSTEM_ROLES,
} from "./permissions";
import { canOpen, homeFor, navFor } from "./role-nav";

const permsFor = (...keys: string[]) =>
  PermissionBitField.fromRoles(
    keys.map((k) => SYSTEM_ROLES.find((r) => r.key === k)!),
  ).bits;

const hrefs = (permissions: bigint) => navFor(permissions).map((i) => i.href);

describe("navFor", () => {
  it("shows a student the campus screens read-only, beside their own day", () => {
    // Attendance is on that list because reading your own is not the same
    // permission as reading everybody's: a student holds ViewOwnEvents, and the
    // screen decides which half of itself to draw. The timetable and the rooms
    // are there for the same reason — both are opened by ViewOwnEvents, and
    // what a student may *do* on them is gated inside the screens rather than
    // here. The order matters as much as the membership: `homeFor` lands people
    // on the first thing they can open, so these two must not reach the head.
    expect(hrefs(permsFor("student"))).toEqual([
      "/schedule",
      "/timetable",
      "/attendance",
      "/rooms",
      "/settings",
    ]);
  });

  it("offers room booking to faculty and above, not to students", () => {
    expect(hrefs(permsFor("faculty"))).toContain("/book");
    expect(hrefs(permsFor("coordinator"))).toContain("/book");
    expect(hrefs(permsFor("student"))).not.toContain("/book");
    expect(canOpen(permsFor("student"), "/book")).toBe(false);
  });

  it("shows faculty their schedule and the full timetable", () => {
    const nav = hrefs(permsFor("faculty"));
    expect(nav).toContain("/schedule");
    expect(nav).toContain("/timetable");
    expect(nav).toContain("/rooms");
    expect(nav).not.toContain("/people");
  });

  it("shows a coordinator scheduling and people screens but not settings", () => {
    const nav = hrefs(permsFor("coordinator"));
    expect(nav).toContain("/timetable");
    expect(nav).toContain("/groups");
    expect(nav).toContain("/people");
  });

  it("shows an admin everything", () => {
    const nav = hrefs(permsFor("admin"));
    expect(nav).toContain("/settings");
    expect(nav).toContain("/people");
    expect(nav).toContain("/schedule");
  });

  it("unions the nav when someone teaches and coordinates", () => {
    // The case that made roles-as-rows necessary: neither role alone shows
    // both "my classes" and the people screens.
    const nav = hrefs(permsFor("faculty", "coordinator"));
    expect(nav).toContain("/schedule");
    expect(nav).toContain("/people");
    expect(nav).toContain("/timetable");
  });

  it("shows nothing to someone with no roles", () => {
    // Load-bearing: the proof that widening two screens to ViewOwnEvents did
    // not quietly become "anybody with a session".
    expect(hrefs(0n)).toEqual([]);
  });

  it("leaves a rooms-only role with just the rooms screen", () => {
    // Why the /rooms entry lists both permissions. Nothing implies ViewRooms,
    // so a porter or a facilities account holds it without ViewOwnEvents, and
    // narrowing that entry to the events permission alone would take the room
    // directory away from them with no other test noticing.
    expect(hrefs(F.ViewRooms)).toEqual(["/rooms"]);
  });

  it("includes the schedule for anyone who can see their own events", () => {
    // ManageAllEvents implies ViewOwnEvents, so a coordinator gets it too.
    expect(hrefs(permsFor("coordinator"))).toContain("/schedule");
  });
});

describe("homeFor", () => {
  it("sends each role to the first screen it can open", () => {
    expect(homeFor(permsFor("student"))).toBe("/schedule");
    expect(homeFor(permsFor("faculty"))).toBe("/schedule");
    expect(homeFor(permsFor("admin"))).toBe("/schedule");
    // The case opening the timetable to everybody could have broken: this role
    // cannot open /schedule at all, so /rooms has to stay reachable and first.
    expect(homeFor(F.ViewRooms)).toBe("/rooms");
  });

  it("has a fallback for a user with no access at all", () => {
    expect(homeFor(0n)).toBe("/no-access");
  });
});

describe("canOpen", () => {
  it("keeps students out of the people screen", () => {
    const student = permsFor("student");
    expect(canOpen(student, "/schedule")).toBe(true);
    expect(canOpen(student, "/people")).toBe(false);
  });

  it("lets anybody reach settings, and the index decides what is in it", () => {
    /*
     * `/settings` is one door onto two audiences. Most of what is behind it is
     * the institution's business, but Siri is a person setting up their own
     * phone and a student has to be able to get there — so the route opens for
     * everyone and each section is gated on the bit it actually needs. The
     * screen's own SECTIONS filter is what a student meets; this only says the
     * door is not locked.
     */
    expect(canOpen(permsFor("student"), "/settings")).toBe(true);
    expect(canOpen(permsFor("faculty"), "/settings")).toBe(true);
    // Still shut to somebody with no roles at all.
    expect(canOpen(0n, "/settings")).toBe(false);
  });

  it("lets any signed-in member read the timetable and the rooms", () => {
    // Read-only is enforced inside those screens and by the tRPC procedures
    // behind every write, not here — `requires` only answers whether the door
    // opens.
    const student = permsFor("student");
    expect(canOpen(student, "/timetable")).toBe(true);
    expect(canOpen(student, "/rooms")).toBe(true);
  });

  it("still asks for an events permission, not merely a session", () => {
    // The widening stopped at ViewOwnEvents and did not become "anybody at
    // all": a freshly imported account with no roles yet still reaches nothing.
    expect(canOpen(F.ViewRooms, "/timetable")).toBe(false);
    expect(canOpen(0n, "/timetable")).toBe(false);
  });

  it("covers nested paths under a prefix", () => {
    const admin = permsFor("admin");
    expect(canOpen(admin, "/people/import")).toBe(true);
    expect(canOpen(permsFor("student"), "/people/import")).toBe(false);
  });

  it("does not let a prefix match a longer unrelated segment", () => {
    // "/people" must not grant "/peopleish". Deliberately not the rooms case
    // any more: a student can now open /rooms, so that assertion would pass
    // whether or not the prefix bug existed.
    expect(canOpen(permsFor("student"), "/peopleish")).toBe(true);
  });

  it("leaves unlisted routes open to any signed-in user", () => {
    expect(canOpen(0n, "/profile")).toBe(true);
  });

  it("grants the timetable through an implied permission", () => {
    // A coordinator holds ManageAllEvents, never ViewAllEvents directly.
    expect(canOpen(permsFor("coordinator"), "/timetable")).toBe(true);
  });
});
