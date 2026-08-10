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

let orgId: string;
let roomA: string;
let roomB: string;
let admin: Actor;
let facultyId: string;
let groupId: string;
let courseId: string;
let termId: string;

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
  facultyId = (
    await db.facultyProfile.upsert({
      where: { userId: teacher.id },
      update: {},
      create: { userId: teacher.id, orgId, shortName: "Dr. Test" },
    })
  ).id;

  courseId = (
    await db.course.upsert({
      where: { orgId_code: { orgId, code: "ITEST" } },
      update: {},
      create: { orgId, code: "ITEST", name: "Integration Course" },
    })
  ).id;
  termId = (
    await db.term.upsert({
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
        courseId_termId_name: { courseId, termId, name: "Test Cohort" },
      },
      update: {},
      create: {
        orgId,
        courseId,
        termId,
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
      title: "In room A",
      roomId: roomA,
      facultyId,
      startTime: at(3, 3, 9),
      endTime: at(3, 3, 10),
    });

    await expect(
      caller.events.create({
        kind: EventKind.CLASS,
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
        courseId_termId_name: { courseId, termId, name: "Other Cohort" },
      },
      update: {},
      create: {
        orgId,
        courseId,
        termId,
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
      title: "Department meeting",
      roomId: roomB,
      facultyId,
      startTime: at(3, 24, 9),
      endTime: at(3, 24, 10),
    });

    await expect(
      caller.events.create({
        kind: EventKind.CLASS,
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
        title: "Not allowed",
        roomId: roomA,
        startTime: at(4, 8, 9),
        endTime: at(4, 8, 10),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
