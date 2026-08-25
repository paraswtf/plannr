import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { fromWallTime } from "~/lib/dates";
import { PermissionBitField, SYSTEM_ROLES } from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";
import { EventKind, RoomType } from "../../../../generated/prisma";

/**
 * Exercises the write path against a real database: conflict detection,
 * occurrence materialisation, and the three edit scopes.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`).
 */

const TZ = "Asia/Kolkata";
const createCaller = createCallerFactory(appRouter);

/** Far enough out that seeded demo classes cannot collide with these tests. */
const YEAR = 2031;

const at = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: YEAR, month, day, hour, minute, second: 0 }, TZ);

interface Actor {
  id: string;
  orgId: string;
  roles: Array<{ id: string; name: string; key: string | null }>;
  permissions: bigint;
}

function callerFor(actor: Actor) {
  const bits = new PermissionBitField(actor.permissions);
  return createCaller({
    db,
    headers: new Headers(),
    session: {
      expires: new Date(Date.now() + 3_600_000).toISOString(),
      user: {
        id: actor.id,
        orgId: actor.orgId,
        roles: actor.roles,
        permissions: actor.permissions.toString(),
        isActive: true,
        // A cookie session is always a person; the fixture says so explicitly
        // so that a machine identity can never sneak in through a caller.
        isServiceAccount: false,
      },
    },
    actor,
    bits,
    orgId: actor.orgId,
  } as Parameters<typeof createCaller>[0]);
}

const permissionsOf = (...keys: string[]) =>
  keys.reduce(
    (bits, key) => bits | SYSTEM_ROLES.find((r) => r.key === key)!.permissions,
    0n,
  );

/** Creates a user holding the named system roles and returns them as an actor. */
async function makeActor(
  email: string,
  name: string,
  ...roleKeys: string[]
): Promise<Actor> {
  const user = await db.user.upsert({
    where: { email },
    update: { name },
    create: { email, name, orgId },
  });
  const roles = await db.role.findMany({
    where: { orgId, key: { in: roleKeys } },
  });
  await db.userRole.deleteMany({ where: { userId: user.id } });
  await db.userRole.createMany({
    data: roles.map((r) => ({ userId: user.id, roleId: r.id })),
  });
  return {
    id: user.id,
    orgId,
    roles: roles.map(({ id, name: n, key }) => ({ id, name: n, key })),
    permissions: roles.reduce(
      (bits, r) => bits | r.permissions,
      user.permissions,
    ),
  };
}

/** A second group in the test course, reusable across runs. */
async function makeGroup(name: string) {
  return db.group.upsert({
    where: { programmeId_semesterId_name: { programmeId, semesterId, name } },
    update: {},
    create: { orgId, programmeId, semesterId, name },
  });
}

/** A student in the main test cohort, reusable across runs. */
async function makeStudent(email: string, prn: string) {
  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: prn, orgId },
  });
  const profile = await db.studentProfile.upsert({
    where: { userId: user.id },
    update: { prn },
    create: { userId: user.id, orgId, prn },
  });
  await db.studentGroupMembership.upsert({
    where: { studentId_groupId: { studentId: profile.id, groupId } },
    update: {},
    create: { studentId: profile.id, groupId },
  });
  return profile;
}

let orgId: string;
let roomA: string;
let roomB: string;
let admin: Actor;
let facultyId: string;
let facultyActor: Awaited<ReturnType<typeof makeActor>>;
let groupId: string;
let programmeId: string;
let semesterId: string;

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: "itest" },
    update: {},
    create: { slug: "itest", name: "Integration Org", timezone: TZ },
  });
  orgId = org.id;
  await db.orgSettings.upsert({
    where: { orgId },
    update: { blockConflicts: true },
    create: { orgId, blockConflicts: true },
  });

  // Clear anything an earlier test left behind.
  await db.event.deleteMany({ where: { orgId } });

  // The test org needs its own copy of the locked roles.
  for (const role of SYSTEM_ROLES) {
    await db.role.upsert({
      where: { orgId_key: { orgId, key: role.key } },
      update: { permissions: role.permissions },
      create: {
        orgId,
        key: role.key,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isSystem: true,
      },
    });
  }

  const building = await db.building.upsert({
    where: { orgId_name: { orgId, name: "Test Block" } },
    update: {},
    create: { orgId, name: "Test Block" },
  });

  const mkRoom = async (code: string, capacity: number) =>
    (
      await db.room.upsert({
        where: { orgId_code: { orgId, code } },
        update: { capacity },
        create: {
          orgId,
          code,
          buildingId: building.id,
          floor: 1,
          capacity,
          type: RoomType.LECTURE,
          features: [],
        },
      })
    ).id;

  roomA = await mkRoom("IT-1", 60);
  roomB = await mkRoom("IT-2", 20);

  admin = await makeActor(
    "itest-admin@plannr-demo.invalid",
    "Integration Admin",
    "admin",
  );

  const teacher = await makeActor(
    "itest-faculty@plannr-demo.invalid",
    "Integration Faculty",
    "faculty",
  );
  facultyActor = teacher;
  facultyId = (
    await db.facultyProfile.upsert({
      where: { userId: teacher.id },
      update: {},
      create: { userId: teacher.id, orgId, shortName: "Dr. Test" },
    })
  ).id;

  programmeId = (
    await db.programme.upsert({
      where: { orgId_code: { orgId, code: "ITEST" } },
      update: {},
      create: { orgId, code: "ITEST", name: "Integration Course" },
    })
  ).id;
  semesterId = (
    await db.semester.upsert({
      where: { orgId_name: { orgId, name: "Integration Term" } },
      update: {},
      create: {
        orgId,
        name: "Integration Term",
        startDate: new Date(`${YEAR}-01-01`),
        endDate: new Date(`${YEAR}-12-31`),
      },
    })
  ).id;
  groupId = (
    await db.group.upsert({
      where: {
        programmeId_semesterId_name: {
          programmeId,
          semesterId,
          name: "Test Cohort",
        },
      },
      update: {},
      create: {
        orgId,
        programmeId,
        semesterId,
        name: "Test Cohort",
        label: "Test Cohort",
      },
    })
  ).id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("events.create", () => {
  it("materialises one occurrence for a one-off booking", async () => {
    const caller = callerFor(admin);
    const { event } = await caller.events.create({
      kind: EventKind.BOOKING,
      title: "One-off",
      roomId: roomA,
      startTime: at(3, 3, 9),
      endTime: at(3, 3, 10),
    });

    const occurrences = await db.eventOccurrence.findMany({
      where: { eventId: event.id },
    });
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]!.start).toEqual(at(3, 3, 9));
  });

  it("materialises every week of a recurring class", async () => {
    const caller = callerFor(admin);
    const { event } = await caller.events.create({
      kind: EventKind.CLASS,
      groupId,
      title: "Weekly lecture",
      roomId: roomA,
      facultyId,
      startTime: at(3, 3, 9),
      endTime: at(3, 3, 10),
      rrule: "FREQ=WEEKLY;COUNT=8",
    });

    const occurrences = await db.eventOccurrence.findMany({
      where: { eventId: event.id },
      orderBy: { start: "asc" },
    });
    expect(occurrences).toHaveLength(8);
    // Every week keeps the same local start time.
    for (const o of occurrences) {
      expect(o.start.getUTCHours()).toBe(3);
      expect(o.start.getUTCMinutes()).toBe(30);
    }
  });

  it("rejects a booking that clashes with an existing one in the same room", async () => {
    const caller = callerFor(admin);
    await caller.events.create({
      kind: EventKind.BOOKING,
      title: "First",
      roomId: roomA,
      startTime: at(3, 3, 9),
      endTime: at(3, 3, 11),
    });

    await expect(
      caller.events.create({
        kind: EventKind.BOOKING,
        title: "Overlapping",
        roomId: roomA,
        startTime: at(3, 3, 10),
        endTime: at(3, 3, 12),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows a back-to-back booking in the same room", async () => {
    const caller = callerFor(admin);
    await caller.events.create({
      kind: EventKind.BOOKING,
      title: "Morning",
      roomId: roomA,
      startTime: at(3, 3, 9),
      endTime: at(3, 3, 10),
    });

    await expect(
      caller.events.create({
        kind: EventKind.BOOKING,
        title: "Straight after",
        roomId: roomA,
        startTime: at(3, 3, 10),
        endTime: at(3, 3, 11),
      }),
    ).resolves.toBeTruthy();
  });

  it("allows the same time in a different room", async () => {
    const caller = callerFor(admin);
    await caller.events.create({
      kind: EventKind.BOOKING,
      title: "Room A",
      roomId: roomA,
      startTime: at(3, 3, 9),
      endTime: at(3, 3, 10),
    });
    await expect(
      caller.events.create({
        kind: EventKind.BOOKING,
        title: "Room B",
        roomId: roomB,
        startTime: at(3, 3, 9),
        endTime: at(3, 3, 10),
      }),
    ).resolves.toBeTruthy();
  });

  it("catches a teacher being booked into two rooms at once", async () => {
    const caller = callerFor(admin);
    await caller.events.create({
      kind: EventKind.CLASS,
      groupId,
      title: "In room A",
      roomId: roomA,
      facultyId,
      startTime: at(3, 3, 9),
      endTime: at(3, 3, 10),
    });

    await expect(
      caller.events.create({
        kind: EventKind.CLASS,
        groupId,
        title: "In room B at the same time",
        roomId: roomB,
        facultyId,
        startTime: at(3, 3, 9),
        endTime: at(3, 3, 10),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("catches a class being scheduled into two rooms at once", async () => {
    const caller = callerFor(admin);
    await caller.events.create({
      kind: EventKind.CLASS,
      title: "Maths",
      roomId: roomA,
      groupId,
      startTime: at(3, 3, 9),
      endTime: at(3, 3, 10),
    });

    // Same cohort of students, same hour, different room — they cannot attend
    // both, so this must be refused even though the room itself is free.
    await expect(
      caller.events.create({
        kind: EventKind.CLASS,
        title: "Physics",
        roomId: roomB,
        groupId,
        startTime: at(3, 3, 9),
        endTime: at(3, 3, 10),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("names the group when reporting a group clash", async () => {
    const caller = callerFor(admin);
    await caller.events.create({
      kind: EventKind.CLASS,
      title: "Maths",
      roomId: roomA,
      groupId,
      startTime: at(3, 5, 9),
      endTime: at(3, 5, 10),
    });

    const conflicts = await caller.events.checkConflicts({
      roomId: roomB,
      groupId,
      startTime: at(3, 5, 9),
      endTime: at(3, 5, 10),
    });
    const groupClash = conflicts.find((c) => c.type === "GROUP");
    expect(groupClash?.severity).toBe("hard");
    expect(groupClash?.message).toContain("Test Cohort");
  });

  it("lets two different groups use different rooms at the same time", async () => {
    const caller = callerFor(admin);
    const other = await db.group.upsert({
      where: {
        programmeId_semesterId_name: {
          programmeId,
          semesterId,
          name: "Other Cohort",
        },
      },
      update: {},
      create: {
        orgId,
        programmeId,
        semesterId,
        name: "Other Cohort",
        label: "Other Cohort",
      },
    });

    await caller.events.create({
      kind: EventKind.CLASS,
      title: "Maths",
      roomId: roomA,
      groupId,
      startTime: at(3, 6, 9),
      endTime: at(3, 6, 10),
    });
    await expect(
      caller.events.create({
        kind: EventKind.CLASS,
        title: "Physics",
        roomId: roomB,
        groupId: other.id,
        startTime: at(3, 6, 9),
        endTime: at(3, 6, 10),
      }),
    ).resolves.toBeTruthy();
  });

  it("catches a recurring class clashing with a teacher's other commitment", async () => {
    const caller = callerFor(admin);
    // A one-off meeting three weeks out for this teacher, in another room.
    await caller.events.create({
      kind: EventKind.CLASS,
      groupId,
      title: "Department meeting",
      roomId: roomB,
      facultyId,
      startTime: at(3, 24, 9),
      endTime: at(3, 24, 10),
    });

    await expect(
      caller.events.create({
        kind: EventKind.CLASS,
        groupId,
        title: "Weekly lecture",
        roomId: roomA,
        facultyId,
        startTime: at(3, 3, 9),
        endTime: at(3, 3, 10),
        rrule: "FREQ=WEEKLY;COUNT=6",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("catches a clash on only the weeks that actually overlap", async () => {
    const caller = callerFor(admin);
    // A single booking three weeks out.
    await caller.events.create({
      kind: EventKind.BOOKING,
      title: "Blocker",
      roomId: roomA,
      startTime: at(3, 24, 9),
      endTime: at(3, 24, 10),
    });

    // A weekly series that meets it on exactly one of its dates.
    await expect(
      caller.events.create({
        kind: EventKind.CLASS,
        groupId,
        title: "Weekly",
        roomId: roomA,
        startTime: at(3, 3, 9),
        endTime: at(3, 3, 10),
        rrule: "FREQ=WEEKLY;COUNT=6",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses an unbounded recurrence", async () => {
    const caller = callerFor(admin);
    await expect(
      caller.events.create({
        kind: EventKind.CLASS,
        groupId,
        title: "Forever",
        roomId: roomA,
        startTime: at(3, 3, 9),
        endTime: at(3, 3, 10),
        rrule: "FREQ=WEEKLY",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses an end time before the start", async () => {
    const caller = callerFor(admin);
    await expect(
      caller.events.create({
        kind: EventKind.BOOKING,
        title: "Backwards",
        roomId: roomA,
        startTime: at(3, 3, 11),
        endTime: at(3, 3, 10),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("events.cancel", () => {
  it("cancelling one occurrence leaves the rest of the series", async () => {
    const caller = callerFor(admin);
    const { event } = await caller.events.create({
      kind: EventKind.CLASS,
      groupId,
      title: "Weekly",
      roomId: roomA,
      startTime: at(3, 3, 9),
      endTime: at(3, 3, 10),
      rrule: "FREQ=WEEKLY;COUNT=5",
    });

    await caller.events.cancel({
      id: event.id,
      scope: "occurrence",
      originalStart: at(3, 17, 9),
      reason: "Public holiday",
    });

    const live = await db.eventOccurrence.findMany({
      where: { eventId: event.id, status: "CONFIRMED" },
      orderBy: { start: "asc" },
    });
    expect(live).toHaveLength(4);
    expect(live.map((o) => o.start.getTime())).not.toContain(
      at(3, 17, 9).getTime(),
    );

    // The cancelled row is kept so the UI can show it and offer a restore.
    const cancelled = await db.eventOccurrence.findMany({
      where: { eventId: event.id, status: "CANCELLED" },
    });
    expect(cancelled).toHaveLength(1);
  });

  it("frees the slot so the room can be rebooked that week", async () => {
    const caller = callerFor(admin);
    const { event } = await caller.events.create({
      kind: EventKind.CLASS,
      groupId,
      title: "Weekly",
      roomId: roomA,
      startTime: at(3, 3, 9),
      endTime: at(3, 3, 10),
      rrule: "FREQ=WEEKLY;COUNT=5",
    });
    await caller.events.cancel({
      id: event.id,
      scope: "occurrence",
      originalStart: at(3, 17, 9),
    });

    await expect(
      caller.events.create({
        kind: EventKind.BOOKING,
        title: "Replacement",
        roomId: roomA,
        startTime: at(3, 17, 9),
        endTime: at(3, 17, 10),
      }),
    ).resolves.toBeTruthy();
  });

  it("restoring an occurrence brings it back", async () => {
    const caller = callerFor(admin);
    const { event } = await caller.events.create({
      kind: EventKind.CLASS,
      groupId,
      title: "Weekly",
      roomId: roomA,
      startTime: at(3, 3, 9),
      endTime: at(3, 3, 10),
      rrule: "FREQ=WEEKLY;COUNT=5",
    });
    await caller.events.cancel({
      id: event.id,
      scope: "occurrence",
      originalStart: at(3, 17, 9),
    });
    await caller.events.restoreOccurrence({
      id: event.id,
      originalStart: at(3, 17, 9),
    });

    const live = await db.eventOccurrence.count({
      where: { eventId: event.id, status: "CONFIRMED" },
    });
    expect(live).toBe(5);
  });
});

describe("events.update", () => {
  it("moving one occurrence leaves the others where they were", async () => {
    const caller = callerFor(admin);
    const { event } = await caller.events.create({
      kind: EventKind.CLASS,
      groupId,
      title: "Weekly",
      roomId: roomA,
      startTime: at(3, 3, 9),
      endTime: at(3, 3, 10),
      rrule: "FREQ=WEEKLY;COUNT=4",
    });

    await caller.events.update({
      id: event.id,
      scope: "occurrence",
      originalStart: at(3, 10, 9),
      patch: {
        startTime: at(3, 10, 14),
        endTime: at(3, 10, 15),
        roomId: roomB,
      },
    });

    const occurrences = await db.eventOccurrence.findMany({
      where: { eventId: event.id },
      orderBy: { start: "asc" },
    });
    expect(occurrences).toHaveLength(4);

    const moved = occurrences.find((o) => o.roomId === roomB);
    expect(moved?.start).toEqual(at(3, 10, 14));
    // The rest are untouched, still at 09:00 in room A.
    expect(occurrences.filter((o) => o.roomId === roomA)).toHaveLength(3);
  });

  it("'this and following' splits the series in two", async () => {
    const caller = callerFor(admin);
    const { event } = await caller.events.create({
      kind: EventKind.CLASS,
      groupId,
      title: "Weekly",
      roomId: roomA,
      startTime: at(3, 3, 9),
      endTime: at(3, 3, 10),
      rrule: "FREQ=WEEKLY;COUNT=6",
    });

    const result = await caller.events.update({
      id: event.id,
      scope: "following",
      originalStart: at(3, 24, 9),
      patch: { roomId: roomB, title: "Weekly (moved)" },
    });
    expect(result.eventId).not.toBe(event.id);

    const original = await db.eventOccurrence.findMany({
      where: { eventId: event.id },
      orderBy: { start: "asc" },
    });
    const split = await db.eventOccurrence.findMany({
      where: { eventId: result.eventId },
      orderBy: { start: "asc" },
    });

    // Three before the pivot, three from the pivot onwards.
    expect(original).toHaveLength(3);
    expect(split).toHaveLength(3);
    expect(split[0]!.start).toEqual(at(3, 24, 9));
    expect(split.every((o) => o.roomId === roomB)).toBe(true);
    expect(original.every((o) => o.roomId === roomA)).toBe(true);
  });

  it("retiming the whole series moves every occurrence", async () => {
    const caller = callerFor(admin);
    const { event } = await caller.events.create({
      kind: EventKind.CLASS,
      groupId,
      title: "Weekly",
      roomId: roomA,
      startTime: at(3, 3, 9),
      endTime: at(3, 3, 10),
      rrule: "FREQ=WEEKLY;COUNT=4",
    });

    await caller.events.update({
      id: event.id,
      scope: "series",
      patch: { startTime: at(3, 3, 15), endTime: at(3, 3, 16) },
    });

    const occurrences = await db.eventOccurrence.findMany({
      where: { eventId: event.id },
    });
    expect(occurrences).toHaveLength(4);
    // 15:00 IST is 09:30 UTC.
    for (const o of occurrences) {
      expect(o.start.getUTCHours()).toBe(9);
      expect(o.start.getUTCMinutes()).toBe(30);
    }
  });

  it("refuses to move an event onto an occupied slot", async () => {
    const caller = callerFor(admin);
    await caller.events.create({
      kind: EventKind.BOOKING,
      title: "Occupier",
      roomId: roomA,
      startTime: at(3, 3, 14),
      endTime: at(3, 3, 15),
    });
    const { event } = await caller.events.create({
      kind: EventKind.BOOKING,
      title: "Mover",
      roomId: roomA,
      startTime: at(3, 3, 9),
      endTime: at(3, 3, 10),
    });

    await expect(
      caller.events.update({
        id: event.id,
        scope: "series",
        patch: { startTime: at(3, 3, 14), endTime: at(3, 3, 15) },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("permissions", () => {
  it("a student cannot add a class to the timetable", async () => {
    const student = await makeActor(
      "itest-student@plannr-demo.invalid",
      "Integration Student",
      "student",
    );
    const caller = callerFor(student);

    await expect(
      caller.events.create({
        kind: EventKind.CLASS,
        groupId,
        title: "Not allowed",
        roomId: roomA,
        startTime: at(3, 3, 9),
        endTime: at(3, 3, 10),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a student's booking waits for approval when the setting requires it", async () => {
    await db.orgSettings.update({
      where: { orgId },
      data: {
        requireApprovalStudentBookings: true,
        allowStudentSelfBooking: true,
      },
    });
    const student = await makeActor(
      "itest-student2@plannr-demo.invalid",
      "Integration Student Two",
      "student",
    );
    const caller = callerFor(student);

    const { event } = await caller.events.create({
      kind: EventKind.BOOKING,
      title: "Study session",
      roomId: roomA,
      startTime: at(3, 4, 9),
      endTime: at(3, 4, 10),
    });
    expect(event.status).toBe("PENDING");
  });

  it("a faculty member who also coordinates can schedule for others", async () => {
    // Neither role alone allows this: faculty manage only their own classes,
    // and the combination is the reason roles became rows.
    const hybrid = await makeActor(
      "itest-hybrid@plannr-demo.invalid",
      "Teaches and coordinates",
      "faculty",
      "coordinator",
    );
    expect(hybrid.permissions).toBe(permissionsOf("faculty", "coordinator"));

    await expect(
      callerFor(hybrid).events.create({
        kind: EventKind.CLASS,
        groupId,
        title: "Scheduled by a coordinator",
        roomId: roomA,
        startTime: at(4, 7, 9),
        endTime: at(4, 7, 10),
      }),
    ).resolves.toBeTruthy();
  });

  it("a faculty member alone cannot schedule someone else's class", async () => {
    const teacher = await makeActor(
      "itest-teacher-only@plannr-demo.invalid",
      "Teaches only",
      "faculty",
    );
    await expect(
      callerFor(teacher).events.create({
        kind: EventKind.CLASS,
        groupId,
        title: "Not allowed",
        roomId: roomA,
        startTime: at(4, 8, 9),
        endTime: at(4, 8, 10),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("settling a repeating clash", () => {
  /**
   * A weekly series that meets an existing booking on one of its dates should
   * not be all-or-nothing: the date can be skipped, or the booking already
   * there can be dropped for that one day.
   */
  const seriesArgs = {
    kind: EventKind.CLASS,
    title: "Weekly lecture",
    roomId: "",
    groupId: "",
    startTime: at(5, 5, 9),
    endTime: at(5, 5, 10),
    rrule: "FREQ=WEEKLY;COUNT=6",
  };

  it("reports the clashing dates, and only those", async () => {
    const caller = callerFor(admin);
    await caller.events.create({
      kind: EventKind.BOOKING,
      title: "Blocker",
      roomId: roomA,
      startTime: at(5, 19, 9),
      endTime: at(5, 19, 10),
    });

    const conflicts = await caller.events.checkConflicts({
      roomId: roomA,
      startTime: seriesArgs.startTime,
      endTime: seriesArgs.endTime,
      rrule: seriesArgs.rrule,
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.candidate!.start).toEqual(at(5, 19, 9));
    // The blocking occurrence identifies itself well enough to be cancelled.
    expect(conflicts[0]!.clashesWith).toMatchObject({
      title: "Blocker",
      originalStart: at(5, 19, 9),
    });
  });

  it("skipping the clashing date books the rest of the series", async () => {
    const caller = callerFor(admin);
    await caller.events.create({
      kind: EventKind.BOOKING,
      title: "Blocker",
      roomId: roomA,
      startTime: at(5, 19, 9),
      endTime: at(5, 19, 10),
    });

    const { event } = await caller.events.create({
      ...seriesArgs,
      roomId: roomA,
      groupId,
      skipDates: [at(5, 19, 9)],
    });

    const occurrences = await db.eventOccurrence.findMany({
      where: { eventId: event.id },
      orderBy: { start: "asc" },
    });
    // Six dates in the rule, one of them skipped rather than booked.
    expect(occurrences).toHaveLength(6);
    expect(
      occurrences.filter((o) => o.status !== "CANCELLED").map((o) => o.start),
    ).not.toContainEqual(at(5, 19, 9));
    const skipped = occurrences.find(
      (o) => o.start.getTime() === at(5, 19, 9).getTime(),
    );
    expect(skipped?.status).toBe("CANCELLED");
  });

  it("skipping a date that does not clash still books every other date", async () => {
    const caller = callerFor(admin);
    const { event } = await caller.events.create({
      ...seriesArgs,
      roomId: roomA,
      groupId,
      skipDates: [at(5, 12, 9)],
    });
    const live = await db.eventOccurrence.count({
      where: { eventId: event.id, status: { not: "CANCELLED" } },
    });
    expect(live).toBe(5);
  });

  it("cancelling the other booking for that one day frees the whole series", async () => {
    const caller = callerFor(admin);
    // Both repeat, but they only meet on the first of the blocker's dates.
    const blocker = await caller.events.create({
      kind: EventKind.BOOKING,
      title: "Blocker",
      roomId: roomA,
      startTime: at(5, 19, 9),
      endTime: at(5, 19, 10),
      rrule: "FREQ=WEEKLY;COUNT=3",
    });
    const series = {
      ...seriesArgs,
      roomId: roomA,
      groupId,
      rrule: "FREQ=WEEKLY;COUNT=3",
    };

    // The series cannot go in while the blocker holds that date.
    await expect(caller.events.create(series)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    await caller.events.cancel({
      id: blocker.event.id,
      scope: "occurrence",
      originalStart: at(5, 19, 9),
      reason: "Freed for the lecture",
    });

    await expect(caller.events.create(series)).resolves.toBeTruthy();

    // Only that date went: the blocker's other two weeks are untouched.
    const left = await db.eventOccurrence.count({
      where: { eventId: blocker.event.id, status: { not: "CANCELLED" } },
    });
    expect(left).toBe(2);
  });
});

describe("combined lectures and their registers", () => {
  it("refuses a class with no group attending it", async () => {
    await expect(
      callerFor(admin).events.create({
        kind: EventKind.CLASS,
        title: "Nobody's lecture",
        roomId: roomA,
        startTime: at(6, 2, 9),
        endTime: at(6, 2, 10),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("a booking needs no group", async () => {
    await expect(
      callerFor(admin).events.create({
        kind: EventKind.BOOKING,
        title: "Study room",
        roomId: roomA,
        startTime: at(6, 2, 9),
        endTime: at(6, 2, 10),
      }),
    ).resolves.toBeTruthy();
  });

  it("puts every attending group on the lecture, primary first", async () => {
    const caller = callerFor(admin);
    const second = await makeGroup("IT-GRP-B");

    const { event } = await caller.events.create({
      kind: EventKind.CLASS,
      title: "Combined lecture",
      roomId: roomA,
      groupIds: [groupId, second.id],
      startTime: at(6, 3, 9),
      endTime: at(6, 3, 10),
    });

    const saved = await db.event.findUniqueOrThrow({
      where: { id: event.id },
      include: { groups: true },
    });
    // The first is denormalised onto the event and its occurrences; both are on
    // the join, so either group's timetable finds it.
    expect(saved.groupId).toBe(groupId);
    expect(saved.groups.map((g) => g.groupId).sort()).toEqual(
      [groupId, second.id].sort(),
    );
  });

  it("catches a clash against a group that only rides along", async () => {
    const caller = callerFor(admin);
    const second = await makeGroup("IT-GRP-C");

    // A combined lecture where the second group is not the primary one.
    await caller.events.create({
      kind: EventKind.CLASS,
      title: "Combined lecture",
      roomId: roomA,
      groupIds: [groupId, second.id],
      startTime: at(6, 4, 9),
      endTime: at(6, 4, 10),
    });

    // That second group is now busy, even though no occurrence carries its id.
    await expect(
      caller.events.create({
        kind: EventKind.CLASS,
        title: "Clashing tutorial",
        roomId: roomB,
        groupIds: [second.id],
        startTime: at(6, 4, 9, 30),
        endTime: at(6, 4, 10, 30),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("offers a register per group and keeps them apart", async () => {
    const caller = callerFor(admin);
    const second = await makeGroup("IT-GRP-D");
    const profile = await makeStudent(
      "itest-att@plannr-demo.invalid",
      "ITEST-ATT-1",
    );

    const { event } = await caller.events.create({
      kind: EventKind.CLASS,
      title: "Combined lecture",
      roomId: roomA,
      groupIds: [groupId, second.id],
      facultyId,
      startTime: at(6, 5, 9),
      endTime: at(6, 5, 10),
    });
    const occurrence = await db.eventOccurrence.findFirstOrThrow({
      where: { eventId: event.id },
    });

    const sitting = await caller.attendance.forOccurrence({
      occurrenceId: occurrence.id,
    });
    // One sitting, two registers.
    expect(sitting!.groups).toHaveLength(2);
    const primary = sitting!.groups.find((g) => g.id === groupId)!;
    const mine = primary.students.find((s) => s.id === profile.id)!;
    // Nothing marked yet reads as present — a register lists the absences.
    expect(mine.status).toBe("PRESENT");
    expect(mine.marked).toBe(false);
    expect(primary.markedAt).toBeNull();

    // Only the teacher the lecture is timetabled to may take its register.
    await callerFor(facultyActor).attendance.mark({
      occurrenceId: occurrence.id,
      groupId,
      records: [{ studentId: profile.id, status: "ABSENT" }],
    });

    const after = await caller.attendance.forOccurrence({
      occurrenceId: occurrence.id,
    });
    const marked = after!.groups
      .find((g) => g.id === groupId)!
      .students.find((s) => s.id === profile.id)!;
    expect(marked.status).toBe("ABSENT");
    expect(marked.marked).toBe(true);
    // The other group's register is untouched by the first being taken.
    expect(after!.groups.find((g) => g.id === second.id)!.markedAt).toBeNull();
  });

  it("lets nobody but the timetabled teacher take the register", async () => {
    const { event } = await callerFor(admin).events.create({
      kind: EventKind.CLASS,
      title: "Somebody else's lecture",
      roomId: roomA,
      groupIds: [groupId],
      facultyId,
      startTime: at(6, 9, 9),
      endTime: at(6, 9, 10),
    });
    const occurrence = await db.eventOccurrence.findFirstOrThrow({
      where: { eventId: event.id },
    });

    // An admin schedules the lecture but did not give it: a register is a
    // statement that a named teacher saw these people, so it is not theirs to
    // make.
    await expect(
      callerFor(admin).attendance.mark({
        occurrenceId: occurrence.id,
        groupId,
        records: [],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      callerFor(facultyActor).attendance.mark({
        occurrenceId: occurrence.id,
        groupId,
        records: [],
      }),
    ).resolves.toBeTruthy();
  });

  it("refuses a register for a lecture with no teacher on it", async () => {
    const { event } = await callerFor(admin).events.create({
      kind: EventKind.CLASS,
      title: "Unstaffed lecture",
      roomId: roomA,
      groupIds: [groupId],
      startTime: at(6, 10, 9),
      endTime: at(6, 10, 10),
    });
    const occurrence = await db.eventOccurrence.findFirstOrThrow({
      where: { eventId: event.id },
    });

    await expect(
      callerFor(facultyActor).attendance.mark({
        occurrenceId: occurrence.id,
        groupId,
        records: [],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("re-marking replaces the register rather than adding to it", async () => {
    const caller = callerFor(admin);
    const profile = await makeStudent(
      "itest-att2@plannr-demo.invalid",
      "ITEST-ATT-2",
    );

    const { event } = await caller.events.create({
      kind: EventKind.CLASS,
      title: "Lecture",
      roomId: roomA,
      groupIds: [groupId],
      facultyId,
      startTime: at(6, 6, 9),
      endTime: at(6, 6, 10),
    });
    const occurrence = await db.eventOccurrence.findFirstOrThrow({
      where: { eventId: event.id },
    });

    await callerFor(facultyActor).attendance.mark({
      occurrenceId: occurrence.id,
      groupId,
      records: [{ studentId: profile.id, status: "ABSENT" }],
    });
    const corrected = await callerFor(facultyActor).attendance.mark({
      occurrenceId: occurrence.id,
      groupId,
      records: [{ studentId: profile.id, status: "PRESENT" }],
    });

    expect(corrected.marked).toBe(1);
    expect(corrected.present).toBe(1);
    const records = await db.attendanceRecord.count({
      where: { session: { occurrenceId: occurrence.id, groupId } },
    });
    expect(records).toBe(1);
  });

  it("a student cannot take a register", async () => {
    const caller = callerFor(admin);
    const { event } = await caller.events.create({
      kind: EventKind.CLASS,
      title: "Lecture",
      roomId: roomA,
      groupIds: [groupId],
      startTime: at(6, 9, 9),
      endTime: at(6, 9, 10),
    });
    const occurrence = await db.eventOccurrence.findFirstOrThrow({
      where: { eventId: event.id },
    });

    const student = await makeActor(
      "itest-student-att@plannr-demo.invalid",
      "Just a student",
      "student",
    );
    await expect(
      callerFor(student).attendance.mark({
        occurrenceId: occurrence.id,
        groupId,
        records: [],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists a group's lectures, including ones it only rides along on", async () => {
    const caller = callerFor(admin);
    const second = await makeGroup("IT-GRP-E");

    await caller.events.create({
      kind: EventKind.CLASS,
      title: "Shared lecture",
      roomId: roomA,
      groupIds: [groupId, second.id],
      startTime: at(6, 10, 9),
      endTime: at(6, 10, 10),
    });

    const lectures = await caller.groups.lectures({ groupId: second.id });
    expect(lectures.total).toBe(1);
    expect(lectures.rows).toHaveLength(1);
    expect(lectures.rows[0]!.title).toBe("Shared lecture");
    // It says who else is in the room.
    expect(lectures.rows[0]!.sharedWith).toContain("Test Cohort");
    expect(lectures.rows[0]!.attendance).toBeNull();
  });
});

/**
 * The other half of the service-principal rule.
 *
 * A machine identity is filtered out of every people-facing query — the staff
 * directory, the pickers, the headcounts. Audit reads are the deliberate
 * exception: "created by" has to resolve to the principal's name or the trail
 * an API key leaves behind is a column of blanks, which is worse than having
 * the bot on screen. This is the test that stops a future filter being applied
 * one join too far.
 */
describe("what an API key leaves behind", () => {
  it("still names the machine that made a booking", async () => {
    const principal = await db.user.upsert({
      where: { email: "itest-key@plannr-service.invalid" },
      update: { name: "Booking Bot", isServiceAccount: true },
      create: {
        orgId,
        email: "itest-key@plannr-service.invalid",
        name: "Booking Bot",
        isServiceAccount: true,
      },
    });

    await db.event.create({
      data: {
        orgId,
        kind: EventKind.BOOKING,
        status: "PENDING",
        title: "Booked by an integration",
        roomId: roomA,
        createdById: principal.id,
        startTime: at(6, 3, 9),
        endTime: at(6, 3, 10),
        timezone: TZ,
      },
    });

    const queue = await callerFor(admin).events.pendingApprovals();
    const waiting = queue.rows.find(
      (e) => e.title === "Booked by an integration",
    );
    expect(waiting?.createdBy?.name).toBe("Booking Bot");
  });
});
