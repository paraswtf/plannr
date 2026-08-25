import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { fromWallTime } from "~/lib/dates";
import { PermissionBitField, SYSTEM_ROLES } from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";
import { lockResources } from "~/server/services/approvals";
import {
  EventKind,
  EventStatus,
  RequestStatus,
  RoomType,
} from "../../../../generated/prisma";

/**
 * Bookings and changes that need somebody's agreement before they take effect.
 *
 * The case worth the most here is two requests for the same room at the same
 * hour, approved at the same moment. Every single-threaded test passes whether
 * or not the approval path is serialised, so the concurrency test below runs
 * the two approvals genuinely at once and asserts that exactly one wins.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`).
 */

const TZ = "Asia/Kolkata";
const createCaller = createCallerFactory(appRouter);

/** Far enough out that seeded classes cannot collide with these. */
const YEAR = 2032;

const at = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: YEAR, month, day, hour, minute, second: 0 }, TZ);

interface Actor {
  id: string;
  orgId: string;
  roles: Array<{ id: string; name: string; key: string | null }>;
  permissions: bigint;
}

function callerFor(actor: Actor) {
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
    bits: new PermissionBitField(actor.permissions),
    orgId: actor.orgId,
  } as Parameters<typeof createCaller>[0]);
}

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
let coordinator: Actor;
let student: Actor;
let teacher: Actor;
let facultyId: string;
let groupId: string;

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: "approvals-itest" },
    update: {},
    create: { slug: "approvals-itest", name: "Approvals Org", timezone: TZ },
  });
  orgId = org.id;
  await db.orgSettings.upsert({
    where: { orgId },
    update: {
      blockConflicts: true,
      requireApprovalStudentBookings: true,
      requireApprovalChanges: true,
      maxStudentBookingMinutes: 120,
    },
    create: {
      orgId,
      blockConflicts: true,
      requireApprovalStudentBookings: true,
      requireApprovalChanges: true,
    },
  });

  await db.eventChangeRequest.deleteMany({ where: { orgId } });
  await db.event.deleteMany({ where: { orgId } });

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
    where: { orgId_name: { orgId, name: "Approvals Block" } },
    update: {},
    create: { orgId, name: "Approvals Block" },
  });
  const mkRoom = async (code: string) =>
    (
      await db.room.upsert({
        where: { orgId_code: { orgId, code } },
        update: {},
        create: {
          orgId,
          code,
          buildingId: building.id,
          floor: 1,
          capacity: 60,
          type: RoomType.LECTURE,
        },
      })
    ).id;
  roomA = await mkRoom("AP-1");
  roomB = await mkRoom("AP-2");

  const programme = await db.programme.upsert({
    where: { orgId_code: { orgId, code: "APR" } },
    update: {},
    create: { orgId, code: "APR", name: "Approvals Programme" },
  });
  const semester = await db.semester.upsert({
    where: { orgId_name: { orgId, name: "Approvals Term" } },
    update: {},
    create: {
      orgId,
      name: "Approvals Term",
      startDate: at(1, 1, 0),
      endDate: at(12, 31, 0),
    },
  });
  groupId = (
    await db.group.upsert({
      where: {
        programmeId_semesterId_name: {
          programmeId: programme.id,
          semesterId: semester.id,
          name: "APR-1",
        },
      },
      update: {},
      create: {
        orgId,
        programmeId: programme.id,
        semesterId: semester.id,
        name: "APR-1",
      },
    })
  ).id;

  admin = await makeActor("approvals-admin@test.local", "Admin", "admin");
  coordinator = await makeActor(
    "approvals-coord@test.local",
    "Coordinator",
    "coordinator",
  );
  student = await makeActor(
    "approvals-student@test.local",
    "Student",
    "student",
  );
  teacher = await makeActor(
    "approvals-teacher@test.local",
    "Teacher",
    "faculty",
  );

  facultyId = (
    await db.facultyProfile.upsert({
      where: { userId: teacher.id },
      update: {},
      create: { userId: teacher.id, orgId },
    })
  ).id;
});

afterAll(async () => {
  await db.$disconnect();
});

/** A student asking for a room, which lands as a request rather than a booking. */
async function studentBooks(hour: number, room = roomA) {
  const result = await callerFor(student).events.create({
    kind: EventKind.BOOKING,
    title: `Study group ${hour}`,
    roomId: room,
    startTime: at(3, 2, hour),
    endTime: at(3, 2, hour + 1),
  });
  return result.event;
}

describe("a student's booking waits for a decision", () => {
  it("is created PENDING and materialises no confirmed sitting", async () => {
    const event = await studentBooks(10);

    expect(event.status).toBe(EventStatus.PENDING);
    const sittings = await db.eventOccurrence.findMany({
      where: { eventId: event.id },
    });
    expect(sittings).toHaveLength(1);
    expect(sittings[0]!.status).toBe(EventStatus.PENDING);
  });

  it("shows up in the approver's queue with a verdict", async () => {
    await studentBooks(10);

    const queue = await callerFor(coordinator).events.approvalQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.kind).toBe("booking");
    expect(queue[0]!.severity).toBe("clear");
    expect(queue[0]!.requestedBy?.email).toBe("approvals-student@test.local");
  });

  it("becomes a real booking when a coordinator approves it", async () => {
    const event = await studentBooks(10);
    await callerFor(coordinator).events.approve({ id: event.id });

    const after = await db.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(after.status).toBe(EventStatus.CONFIRMED);
    expect(after.decidedById).toBe(coordinator.id);
    expect(after.decidedAt).not.toBeNull();
  });

  it("keeps the requester's own note when it is refused", async () => {
    const event = await db.event.create({
      data: {
        orgId,
        kind: EventKind.BOOKING,
        status: EventStatus.PENDING,
        title: "Rehearsal",
        roomId: roomA,
        createdById: student.id,
        startTime: at(3, 3, 10),
        endTime: at(3, 3, 11),
        timezone: TZ,
        notes: "Need the projector for a rehearsal",
      },
    });

    await callerFor(coordinator).events.reject({
      id: event.id,
      reason: "Room is being painted",
    });

    const after = await db.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(after.status).toBe(EventStatus.REJECTED);
    expect(after.notes).toBe("Need the projector for a rehearsal");
    expect(after.decisionNote).toBe("Room is being painted");
  });

  it("refuses to decide something that has already been decided", async () => {
    const event = await studentBooks(10);
    await callerFor(coordinator).events.approve({ id: event.id });

    await expect(
      callerFor(coordinator).events.approve({ id: event.id }),
    ).rejects.toThrow(/not waiting for a decision/i);
  });

  it("will not resurrect a refused booking", async () => {
    const event = await studentBooks(10);
    await callerFor(coordinator).events.reject({ id: event.id });

    await expect(
      callerFor(admin).events.approve({ id: event.id }),
    ).rejects.toThrow(/not waiting for a decision/i);
  });
});

describe("two requests for the same room", () => {
  it("tells the approver the slot is contested before they decide", async () => {
    await studentBooks(14);
    await studentBooks(14); // a second person wants the same hour

    const queue = await callerFor(coordinator).events.approvalQueue();
    expect(queue).toHaveLength(2);
    for (const item of queue) {
      expect(item.severity).toBe("contested");
      expect(item.verdict.contested).toHaveLength(1);
    }
  });

  it("lets the second be approved only once the first has not taken the room", async () => {
    const first = await studentBooks(14);
    const second = await studentBooks(14);

    await callerFor(coordinator).events.approve({ id: first.id });
    await expect(
      callerFor(coordinator).events.approve({ id: second.id }),
    ).rejects.toThrow(/already booked/i);

    expect(
      (await db.event.findUniqueOrThrow({ where: { id: second.id } })).status,
    ).toBe(EventStatus.PENDING);
  });

  // Two approvals racing through the router is a timing test: it passes with or
  // without the lock depending on which transaction happens to commit first, so
  // it proves nothing on its own and is kept only as a smoke test. What the
  // safety actually rests on is the lock itself, tested below.
  it("survives two coordinators approving at the very same moment", async () => {
    const first = await studentBooks(16);
    const second = await studentBooks(16);

    const results = await Promise.allSettled([
      callerFor(coordinator).events.approve({ id: first.id }),
      callerFor(admin).events.approve({ id: second.id }),
    ]);

    const granted = results.filter((r) => r.status === "fulfilled");
    expect(granted).toHaveLength(1);

    const confirmed = await db.event.count({
      where: { orgId, roomId: roomA, status: EventStatus.CONFIRMED },
    });
    expect(confirmed).toBe(1);
  });
});

describe("the lock the approval path rests on", () => {
  /** Records the order two transactions actually run in. */
  async function raceOn(firstRoom: string, secondRoom: string) {
    const order: string[] = [];
    const held = db.$transaction(
      async (tx) => {
        await lockResources(tx, { roomId: firstRoom });
        order.push("first in");
        await new Promise((resolve) => setTimeout(resolve, 400));
        order.push("first out");
      },
      { timeout: 20_000 },
    );

    // Long enough that the first transaction is certainly holding the lock.
    await new Promise((resolve) => setTimeout(resolve, 120));

    const waiting = db.$transaction(
      async (tx) => {
        await lockResources(tx, { roomId: secondRoom });
        order.push("second in");
      },
      { timeout: 20_000 },
    );

    await Promise.all([held, waiting]);
    return order;
  }

  it("makes a second approval for the same room wait for the first", async () => {
    expect(await raceOn(roomA, roomA)).toEqual([
      "first in",
      "first out",
      "second in",
    ]);
  });

  // Serialising every approval in the college would be a queue nobody wants;
  // only decisions that touch the same room wait for each other.
  it("does not make approvals for different rooms wait at all", async () => {
    expect(await raceOn(roomA, roomB)).toEqual([
      "first in",
      "second in",
      "first out",
    ]);
  });
});

describe("a change to something that already exists", () => {
  /** A confirmed lecture belonging to the teacher. */
  async function aLecture() {
    return db.event.create({
      data: {
        orgId,
        kind: EventKind.CLASS,
        status: EventStatus.CONFIRMED,
        title: "Data Structures",
        roomId: roomA,
        groupId,
        facultyId,
        startTime: at(4, 6, 9),
        endTime: at(4, 6, 10),
        timezone: TZ,
      },
    });
  }

  it("does not move the class — an edit by its teacher becomes a request", async () => {
    const lecture = await aLecture();

    const result = await callerFor(teacher).events.update({
      id: lecture.id,
      scope: "series",
      patch: { roomId: roomB },
    });

    expect(result.applied).toBe(false);
    const after = await db.event.findUniqueOrThrow({
      where: { id: lecture.id },
    });
    expect(after.roomId).toBe(roomA);

    const requests = await db.eventChangeRequest.findMany({
      where: { eventId: lecture.id },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.newRoomId).toBe(roomB);
    expect(requests[0]!.status).toBe(RequestStatus.PENDING);
  });

  it("moves the class when the change is granted", async () => {
    const lecture = await aLecture();
    const request = await callerFor(teacher).events.requestChange({
      eventId: lecture.id,
      scope: "series",
      newRoomId: roomB,
      reason: "Need the lab machines",
    });

    await callerFor(coordinator).events.approveChange({ id: request.id });

    const after = await db.event.findUniqueOrThrow({
      where: { id: lecture.id },
    });
    expect(after.roomId).toBe(roomB);
    const sittings = await db.eventOccurrence.findMany({
      where: { eventId: lecture.id },
    });
    expect(sittings.every((s) => s.roomId === roomB)).toBe(true);
  });

  it("leaves the class alone when the change is refused", async () => {
    const lecture = await aLecture();
    const request = await callerFor(teacher).events.requestChange({
      eventId: lecture.id,
      newStartTime: at(4, 6, 15),
      newEndTime: at(4, 6, 16),
    });

    await callerFor(coordinator).events.rejectChange({
      id: request.id,
      reason: "Clashes with an exam",
    });

    const after = await db.event.findUniqueOrThrow({
      where: { id: lecture.id },
    });
    expect(after.startTime.getTime()).toBe(at(4, 6, 9).getTime());
    const decided = await db.eventChangeRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(decided.status).toBe(RequestStatus.REJECTED);
    expect(decided.decisionNote).toBe("Clashes with an exam");
  });

  it("refuses a change into a room that is already taken", async () => {
    const lecture = await aLecture();
    await db.event.create({
      data: {
        orgId,
        kind: EventKind.CLASS,
        status: EventStatus.CONFIRMED,
        title: "Occupied",
        roomId: roomB,
        startTime: at(4, 6, 9),
        endTime: at(4, 6, 10),
        timezone: TZ,
      },
    });
    await db.eventOccurrence.create({
      data: {
        orgId,
        eventId: (
          await db.event.findFirstOrThrow({
            where: { orgId, title: "Occupied" },
          })
        ).id,
        start: at(4, 6, 9),
        end: at(4, 6, 10),
        roomId: roomB,
        kind: EventKind.CLASS,
        status: EventStatus.CONFIRMED,
      },
    });

    const request = await callerFor(teacher).events.requestChange({
      eventId: lecture.id,
      newRoomId: roomB,
    });

    await expect(
      callerFor(coordinator).events.approveChange({ id: request.id }),
    ).rejects.toThrow(/already booked/i);
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: lecture.id } })).roomId,
    ).toBe(roomA);
  });

  it("lets a teacher ask for one sitting to be called off", async () => {
    const lecture = await aLecture();
    const request = await callerFor(teacher).events.requestChange({
      eventId: lecture.id,
      scope: "occurrence",
      originalStart: at(4, 6, 9),
      cancelling: true,
      reason: "I am away at a conference",
    });

    await callerFor(coordinator).events.approveChange({ id: request.id });

    const sitting = await db.eventOccurrence.findFirstOrThrow({
      where: { eventId: lecture.id, start: at(4, 6, 9) },
    });
    expect(sitting.status).toBe(EventStatus.CANCELLED);
  });

  it("only the person who asked may withdraw a request", async () => {
    const lecture = await aLecture();
    const request = await callerFor(teacher).events.requestChange({
      eventId: lecture.id,
      newRoomId: roomB,
    });

    await expect(
      callerFor(student).events.withdrawChange({ id: request.id }),
    ).rejects.toThrow(/only the person who asked/i);
    await callerFor(teacher).events.withdrawChange({ id: request.id });
    expect(
      (
        await db.eventChangeRequest.findUniqueOrThrow({
          where: { id: request.id },
        })
      ).status,
    ).toBe(RequestStatus.WITHDRAWN);
  });

  it("an admin still edits directly", async () => {
    const lecture = await aLecture();
    const result = await callerFor(admin).events.update({
      id: lecture.id,
      scope: "series",
      patch: { roomId: roomB },
    });

    expect(result.applied).toBe(true);
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: lecture.id } })).roomId,
    ).toBe(roomB);
  });

  it("a student may still amend their own undecided booking", async () => {
    const booking = await studentBooks(11);
    const result = await callerFor(student).events.update({
      id: booking.id,
      scope: "series",
      patch: { roomId: roomB },
    });

    expect(result.applied).toBe(true);
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: booking.id } })).roomId,
    ).toBe(roomB);
  });

  // A two-hour cap is worth nothing if it can be escaped by booking for one
  // hour and then editing the booking to eight.
  it("holds a student to the booking limit when they amend", async () => {
    const booking = await studentBooks(11);

    await expect(
      callerFor(student).events.update({
        id: booking.id,
        scope: "series",
        patch: { endTime: at(3, 2, 19) },
      }),
    ).rejects.toThrow(/limited to 120 minutes/i);
  });
});

describe("the queue", () => {
  it("shows bookings and changes together, oldest first", async () => {
    const lecture = await db.event.create({
      data: {
        orgId,
        kind: EventKind.CLASS,
        status: EventStatus.CONFIRMED,
        title: "Algorithms",
        roomId: roomB,
        groupId,
        facultyId,
        startTime: at(5, 4, 9),
        endTime: at(5, 4, 10),
        timezone: TZ,
      },
    });
    await studentBooks(10);
    await callerFor(teacher).events.requestChange({
      eventId: lecture.id,
      newStartTime: at(5, 4, 11),
      newEndTime: at(5, 4, 12),
      reason: "Clashes with a department meeting",
    });

    const queue = await callerFor(coordinator).events.approvalQueue();
    expect(queue.map((item) => item.kind).sort()).toEqual([
      "booking",
      "change",
    ]);

    const change = queue.find((item) => item.kind === "change")!;
    expect(change.was?.roomCode).toBe("AP-2");
    expect(change.reason).toBe("Clashes with a department meeting");
  });

  it("is closed to people who cannot approve", async () => {
    await expect(callerFor(student).events.approvalQueue()).rejects.toThrow();
    await expect(callerFor(teacher).events.approvalQueue()).rejects.toThrow();
  });
});
