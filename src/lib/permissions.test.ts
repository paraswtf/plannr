import { describe, expect, it } from "vitest";

import {
  canActOn,
  effectivePermissions,
  PermissionBitField,
  PermissionFlags,
  ROLE_DEFAULT_PERMISSIONS,
  wouldLockSelfOut,
  type Role,
} from "./permissions";

const user = (role: Role, permissions = 0n, id = "u1") => ({
  id,
  role,
  permissions,
});

describe("effectivePermissions", () => {
  it("gives a student view and self-booking only", () => {
    const bits = new PermissionBitField(effectivePermissions(user("STUDENT")));
    expect(bits.has(PermissionFlags.ViewTimetable)).toBe(true);
    expect(bits.has(PermissionFlags.BookStudyRoom)).toBe(true);
    expect(bits.has(PermissionFlags.ManageAllEvents)).toBe(false);
    expect(bits.has(PermissionFlags.ManageUsers)).toBe(false);
  });

  it("lets faculty manage their own events but not everyone's", () => {
    const bits = new PermissionBitField(effectivePermissions(user("FACULTY")));
    expect(bits.has(PermissionFlags.ManageOwnEvents)).toBe(true);
    expect(bits.has(PermissionFlags.RequestRoom)).toBe(true);
    expect(bits.has(PermissionFlags.ManageAllEvents)).toBe(false);
    expect(bits.has(PermissionFlags.ApproveBookings)).toBe(false);
  });

  it("unions per-user grants over the role defaults", () => {
    const bits = new PermissionBitField(
      effectivePermissions(user("FACULTY", PermissionFlags.ApproveBookings)),
    );
    expect(bits.has(PermissionFlags.ApproveBookings)).toBe(true);
    // Still not a blanket admin.
    expect(bits.has(PermissionFlags.ManageUsers)).toBe(false);
  });

  it("treats Administrator as satisfying every flag", () => {
    const bits = new PermissionBitField(effectivePermissions(user("ADMIN")));
    for (const flag of Object.values(PermissionFlags)) {
      expect(bits.has(flag)).toBe(true);
    }
    // Including a flag that does not exist yet.
    expect(bits.has(1n << 40n)).toBe(true);
  });
});

describe("PermissionBitField", () => {
  it("add and remove return new fields without mutating", () => {
    const base = new PermissionBitField(PermissionFlags.ViewTimetable);
    const added = base.add(PermissionFlags.ManageRooms);

    expect(added.has(PermissionFlags.ManageRooms)).toBe(true);
    expect(base.has(PermissionFlags.ManageRooms)).toBe(false);
    expect(added.remove(PermissionFlags.ManageRooms).has(PermissionFlags.ManageRooms)).toBe(false);
  });

  it("hasAll requires every flag, hasAny requires one", () => {
    const bits = new PermissionBitField(
      PermissionFlags.ViewTimetable | PermissionFlags.ManageRooms,
    );
    expect(bits.hasAll(PermissionFlags.ViewTimetable, PermissionFlags.ManageRooms)).toBe(true);
    expect(bits.hasAll(PermissionFlags.ViewTimetable, PermissionFlags.ManageUsers)).toBe(false);
    expect(bits.hasAny(PermissionFlags.ManageUsers, PermissionFlags.ManageRooms)).toBe(true);
    expect(bits.hasAny(PermissionFlags.ManageUsers)).toBe(false);
  });

  it("lists held flags by name", () => {
    const bits = new PermissionBitField(ROLE_DEFAULT_PERMISSIONS.FACULTY);
    expect(bits.toArray()).toEqual([
      "ViewTimetable",
      "BookStudyRoom",
      "RequestRoom",
      "ManageOwnEvents",
    ]);
  });
});

describe("canActOn", () => {
  const admin = user("ADMIN", 0n, "admin");
  const otherAdmin = user("ADMIN", 0n, "admin2");
  const faculty = user("FACULTY", 0n, "fac");
  const student = user("STUDENT", 0n, "stu");

  it("refuses to act on yourself", () => {
    expect(canActOn(admin, admin)).toBe("SELF");
  });

  it("requires ManageUsers", () => {
    expect(canActOn(faculty, student)).toBe("MISSING_MANAGE_USERS");
  });

  it("lets an admin act on lower-privilege users", () => {
    expect(canActOn(admin, student)).toBeNull();
    expect(canActOn(admin, faculty)).toBeNull();
  });

  it("blocks acting on a user holding permissions the actor lacks", () => {
    const userManager = user("FACULTY", PermissionFlags.ManageUsers, "mgr");
    const approver = user("FACULTY", PermissionFlags.ApproveBookings, "appr");
    expect(canActOn(userManager, approver)).toBe("HIGHER_PRIVILEGE");
  });

  it("allows an admin to act on another admin", () => {
    // Both hold Administrator, so neither has bits the other lacks.
    expect(canActOn(admin, otherAdmin)).toBeNull();
  });
});

describe("wouldLockSelfOut", () => {
  const admin = user("ADMIN", 0n, "admin");

  it("flags an admin demoting themselves below user management", () => {
    expect(wouldLockSelfOut(admin, admin, "FACULTY", 0n)).toBe(true);
  });

  it("allows a self-change that keeps user management", () => {
    expect(
      wouldLockSelfOut(admin, admin, "FACULTY", PermissionFlags.ManageUsers),
    ).toBe(false);
    expect(wouldLockSelfOut(admin, admin, "ADMIN", 0n)).toBe(false);
  });

  it("ignores changes to other people", () => {
    expect(wouldLockSelfOut(admin, { id: "someone-else" }, "STUDENT", 0n)).toBe(false);
  });
});
