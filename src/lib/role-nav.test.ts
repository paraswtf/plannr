import { describe, expect, it } from "vitest";

import { PermissionBitField, SYSTEM_ROLES } from "./permissions";
import { canOpen, homeFor, navFor } from "./role-nav";

const permsFor = (...keys: string[]) =>
  PermissionBitField.fromRoles(
    keys.map((k) => SYSTEM_ROLES.find((r) => r.key === k)!),
  ).bits;

const hrefs = (permissions: bigint) => navFor(permissions).map((i) => i.href);

describe("navFor", () => {
  it("shows a student only their own day and booking", () => {
    expect(hrefs(permsFor("student"))).toEqual(["/today", "/book"]);
  });

  it("shows faculty their classes and the full timetable", () => {
    const nav = hrefs(permsFor("faculty"));
    expect(nav).toContain("/classes");
    expect(nav).toContain("/timetable");
    expect(nav).toContain("/rooms");
    expect(nav).not.toContain("/people");
    expect(nav).not.toContain("/settings");
  });

  it("shows a coordinator scheduling and people screens but not settings", () => {
    const nav = hrefs(permsFor("coordinator"));
    expect(nav).toContain("/timetable");
    expect(nav).toContain("/groups");
    expect(nav).toContain("/people");
    expect(nav).not.toContain("/settings");
  });

  it("shows an admin everything", () => {
    const nav = hrefs(permsFor("admin"));
    expect(nav).toContain("/settings");
    expect(nav).toContain("/people");
    expect(nav).toContain("/today");
  });

  it("unions the nav when someone teaches and coordinates", () => {
    // The case that made roles-as-rows necessary: neither role alone shows
    // both "my classes" and the people screens.
    const nav = hrefs(permsFor("faculty", "coordinator"));
    expect(nav).toContain("/classes");
    expect(nav).toContain("/people");
    expect(nav).toContain("/timetable");
  });

  it("shows nothing to someone with no roles", () => {
    expect(hrefs(0n)).toEqual([]);
  });

  it("includes Today for anyone who can see their own events", () => {
    // ManageAllEvents implies ViewOwnEvents, so a coordinator gets it too.
    expect(hrefs(permsFor("coordinator"))).toContain("/today");
  });
});

describe("homeFor", () => {
  it("sends each role to the first screen it can open", () => {
    expect(homeFor(permsFor("student"))).toBe("/today");
    expect(homeFor(permsFor("faculty"))).toBe("/today");
    expect(homeFor(permsFor("admin"))).toBe("/today");
  });

  it("has a fallback for a user with no access at all", () => {
    expect(homeFor(0n)).toBe("/no-access");
  });
});

describe("canOpen", () => {
  it("keeps students out of the people and settings screens", () => {
    const student = permsFor("student");
    expect(canOpen(student, "/today")).toBe(true);
    expect(canOpen(student, "/people")).toBe(false);
    expect(canOpen(student, "/settings")).toBe(false);
    expect(canOpen(student, "/timetable")).toBe(false);
  });

  it("covers nested paths under a prefix", () => {
    const admin = permsFor("admin");
    expect(canOpen(admin, "/people/import")).toBe(true);
    expect(canOpen(permsFor("student"), "/people/import")).toBe(false);
  });

  it("does not let a prefix match a longer unrelated segment", () => {
    // "/rooms" must not grant "/roomsomething".
    expect(canOpen(permsFor("student"), "/roomsomething")).toBe(true);
  });

  it("leaves unlisted routes open to any signed-in user", () => {
    expect(canOpen(0n, "/profile")).toBe(true);
  });

  it("grants the timetable through an implied permission", () => {
    // A coordinator holds ManageAllEvents, never ViewAllEvents directly.
    expect(canOpen(permsFor("coordinator"), "/timetable")).toBe(true);
  });
});
