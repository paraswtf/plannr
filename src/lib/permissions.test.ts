import { describe, expect, it } from "vitest";

import {
  ALL_PERMISSIONS,
  canActOn,
  expandPermissions,
  grants,
  impliedPermissions,
  PermissionBitField,
  PermissionFlags as F,
  PERMISSION_CATALOG,
  PERMISSION_NAMES,
  SYSTEM_ROLES,
  wouldLockSelfOut,
} from "./permissions";

const roleByKey = (key: string) => SYSTEM_ROLES.find((r) => r.key === key)!;

describe("permission implications", () => {
  it("managing all events grants viewing all and own events", () => {
    // The rule the whole model hangs on: a scheduler never has to be given
    // "view" separately.
    const bits = new PermissionBitField(F.ManageAllEvents);
    expect(bits.has(F.ViewAllEvents)).toBe(true);
    expect(bits.has(F.ViewOwnEvents)).toBe(true);
    expect(bits.has(F.ManageOwnEvents)).toBe(true);
  });

  it("viewing all events grants viewing own events but not managing", () => {
    const bits = new PermissionBitField(F.ViewAllEvents);
    expect(bits.has(F.ViewOwnEvents)).toBe(true);
    expect(bits.has(F.ManageOwnEvents)).toBe(false);
    expect(bits.has(F.ManageAllEvents)).toBe(false);
  });

  it("managing own events does not leak into seeing everyone's", () => {
    const bits = new PermissionBitField(F.ManageOwnEvents);
    expect(bits.has(F.ViewOwnEvents)).toBe(true);
    expect(bits.has(F.ViewAllEvents)).toBe(false);
  });

  it("resolves a chain transitively", () => {
    // ImportUsers → ManageUsers → ViewUsers, none of it spelled out directly.
    const bits = new PermissionBitField(F.ImportUsers);
    expect(bits.has(F.ManageUsers)).toBe(true);
    expect(bits.has(F.ViewUsers)).toBe(true);
  });

  it("applies implications for rooms, groups and courses", () => {
    expect(new PermissionBitField(F.ManageRooms).has(F.ViewRooms)).toBe(true);
    expect(new PermissionBitField(F.ManageGroups).has(F.ViewGroups)).toBe(true);
    expect(new PermissionBitField(F.ManageCourses).has(F.ViewGroups)).toBe(
      true,
    );
    expect(new PermissionBitField(F.ApproveBookings).has(F.ViewAllEvents)).toBe(
      true,
    );
  });

  it("Administrator grants everything, including unknown future flags", () => {
    const bits = new PermissionBitField(F.Administrator);
    for (const name of PERMISSION_NAMES) {
      expect(bits.has(F[name])).toBe(true);
    }
    expect(bits.has(1n << 50n)).toBe(true);
  });

  it("expandPermissions is idempotent", () => {
    const once = expandPermissions(F.ManageAllEvents);
    expect(expandPermissions(once)).toBe(once);
  });

  it("grants nothing extra for an empty set", () => {
    expect(expandPermissions(0n)).toBe(0n);
    expect(new PermissionBitField(0n).has(F.ViewOwnEvents)).toBe(false);
  });
});

describe("impliedPermissions", () => {
  it("reports exactly the bits held only by implication", () => {
    // What the editor should show ticked-but-locked.
    const implied = impliedPermissions(F.ManageAllEvents);
    expect((implied & F.ViewAllEvents) !== 0n).toBe(true);
    expect((implied & F.ViewOwnEvents) !== 0n).toBe(true);
    expect((implied & F.ManageOwnEvents) !== 0n).toBe(true);
    // The flag actually chosen is not "implied".
    expect((implied & F.ManageAllEvents) === 0n).toBe(true);
  });

  it("is empty when a permission implies nothing", () => {
    expect(impliedPermissions(F.ManageSettings)).toBe(0n);
  });

  it("does not mark a bit implied when it was granted directly too", () => {
    const implied = impliedPermissions(F.ManageAllEvents | F.ViewAllEvents);
    expect((implied & F.ViewAllEvents) === 0n).toBe(true);
  });
});

describe("grants", () => {
  it("answers whether one permission covers another", () => {
    expect(grants(F.ManageAllEvents, F.ViewOwnEvents)).toBe(true);
    expect(grants(F.ViewOwnEvents, F.ManageAllEvents)).toBe(false);
  });
});

describe("PermissionBitField.fromRoles", () => {
  it("unions the permissions of every role held", () => {
    const bits = PermissionBitField.fromRoles([
      roleByKey("student"),
      roleByKey("faculty"),
    ]);
    expect(bits.has(F.BookRoom)).toBe(true);
    expect(bits.has(F.ManageOwnEvents)).toBe(true);
    expect(bits.has(F.ManageAllEvents)).toBe(false);
  });

  it("lets a faculty member who is also a coordinator do both", () => {
    // The combination the institution actually has: someone teaches and also
    // runs the timetable.
    const bits = PermissionBitField.fromRoles([
      roleByKey("faculty"),
      roleByKey("coordinator"),
    ]);
    expect(bits.has(F.ManageOwnEvents)).toBe(true);
    expect(bits.has(F.ManageAllEvents)).toBe(true);
    expect(bits.has(F.ApproveBookings)).toBe(true);
    expect(bits.has(F.ManageSettings)).toBe(false);
  });

  it("adds per-user grants on top of roles", () => {
    const bits = PermissionBitField.fromRoles(
      [roleByKey("faculty")],
      F.ApproveBookings,
    );
    expect(bits.has(F.ApproveBookings)).toBe(true);
    expect(bits.has(F.ManageUsers)).toBe(false);
  });

  it("gives an admin who also holds student everything", () => {
    const bits = PermissionBitField.fromRoles([
      roleByKey("student"),
      roleByKey("admin"),
    ]);
    expect(bits.has(F.ManageSettings)).toBe(true);
    expect(bits.effective).toBe(ALL_PERMISSIONS);
  });

  it("returns nothing for a user with no roles", () => {
    expect(PermissionBitField.fromRoles([]).effective).toBe(0n);
  });
});

describe("system roles", () => {
  it("gives students their own events and nothing more", () => {
    const bits = new PermissionBitField(roleByKey("student").permissions);
    expect(bits.has(F.ViewOwnEvents)).toBe(true);
    expect(bits.has(F.BookRoom)).toBe(true);
    expect(bits.has(F.ViewAllEvents)).toBe(false);
    expect(bits.has(F.ManageUsers)).toBe(false);
  });

  it("lets faculty see the timetable and manage only their own classes", () => {
    const bits = new PermissionBitField(roleByKey("faculty").permissions);
    expect(bits.has(F.ViewAllEvents)).toBe(true);
    expect(bits.has(F.ManageOwnEvents)).toBe(true);
    expect(bits.has(F.ManageAllEvents)).toBe(false);
  });

  it("lets coordinators schedule but not change institution settings", () => {
    const bits = new PermissionBitField(roleByKey("coordinator").permissions);
    expect(bits.has(F.ManageAllEvents)).toBe(true);
    expect(bits.has(F.ApproveBookings)).toBe(true);
    expect(bits.has(F.ManageGroups)).toBe(true);
    expect(bits.has(F.ManageSettings)).toBe(false);
    expect(bits.has(F.ManageRoles)).toBe(false);
  });

  it("covers every flag in the catalog", () => {
    // A permission with no catalog entry would be invisible in the editor.
    const documented = new Set(PERMISSION_CATALOG.map((p) => p.name));
    for (const name of PERMISSION_NAMES) {
      expect(documented.has(name)).toBe(true);
    }
  });
});

describe("canActOn", () => {
  const admin = { id: "admin", permissions: F.Administrator };
  const coordinator = {
    id: "coord",
    permissions: roleByKey("coordinator").permissions,
  };
  const faculty = { id: "fac", permissions: roleByKey("faculty").permissions };
  const student = { id: "stu", permissions: roleByKey("student").permissions };

  it("refuses to act on yourself", () => {
    expect(canActOn(admin, admin)).toBe("SELF");
  });

  it("requires the manage-users permission", () => {
    expect(canActOn(faculty, student)).toBe("MISSING_MANAGE_USERS");
    // A coordinator can only view people, not manage them.
    expect(canActOn(coordinator, student)).toBe("MISSING_MANAGE_USERS");
  });

  it("lets an admin act on anyone below them", () => {
    expect(canActOn(admin, student)).toBeNull();
    expect(canActOn(admin, faculty)).toBeNull();
    expect(canActOn(admin, coordinator)).toBeNull();
  });

  it("blocks acting on someone holding a permission the actor lacks", () => {
    const userManager = { id: "mgr", permissions: F.ManageUsers };
    const scheduler = {
      id: "sch",
      permissions: F.ManageUsers | F.ManageAllEvents,
    };
    expect(canActOn(userManager, scheduler)).toBe("HIGHER_PRIVILEGE");
    expect(canActOn(scheduler, userManager)).toBeNull();
  });

  it("accounts for implied permissions when comparing privilege", () => {
    // The target only holds ManageAllEvents, but that implies ViewAllEvents,
    // which the actor lacks — so the actor still cannot touch them.
    const actor = { id: "a", permissions: F.ManageUsers | F.ViewOwnEvents };
    const target = { id: "b", permissions: F.ManageAllEvents };
    expect(canActOn(actor, target)).toBe("HIGHER_PRIVILEGE");
  });

  it("allows two admins to act on each other", () => {
    expect(
      canActOn(admin, { id: "admin2", permissions: F.Administrator }),
    ).toBeNull();
  });
});

describe("wouldLockSelfOut", () => {
  it("flags dropping your own ability to manage roles", () => {
    expect(wouldLockSelfOut("me", "me", F.ManageUsers)).toBe(true);
  });

  it("allows a self-change that keeps role management", () => {
    expect(wouldLockSelfOut("me", "me", F.ManageRoles)).toBe(false);
    expect(wouldLockSelfOut("me", "me", F.Administrator)).toBe(false);
  });

  it("ignores changes to other people", () => {
    expect(wouldLockSelfOut("me", "someone-else", 0n)).toBe(false);
  });
});
