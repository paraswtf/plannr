import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fromWallTime } from "~/lib/dates";
import {
  PermissionBitField,
  PermissionFlags,
  SYSTEM_ROLES,
} from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  EventKind,
  EventStatus,
  type NotificationCategory,
  RoomType,
} from "../../../../generated/prisma";
import { approversOf } from "./audience";

/**
 * Who is told what, when bookings, change requests and schedule plans move.
 *
 * Push is switched on and nothing is ever sent: `notify` queues a push for
 * everyone who wants one, and with no request around there is no `after` to
 * deliver it, so the rows stay pending and can be read back.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`).
 */

vi.mock("../push/config", () => ({
  pushEnabled: () => true,
  webPush: () => {
    throw new Error("These tests never send a push.");
  },
}));

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
        isServiceAccount: false,
        viaApiKey: false,
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
  roleKeys: string[],
  extraPermissions = 0n,
  flags: { isActive?: boolean; isServiceAccount?: boolean } = {},
): Promise<Actor> {
  const state = {
    isActive: flags.isActive ?? true,
    isServiceAccount: flags.isServiceAccount ?? false,
  };
  const user = await db.user.upsert({
    where: { email },
    update: { name, permissions: extraPermissions, ...state },
    create: { email, name, orgId, permissions: extraPermissions, ...state },
  });
  const roles = await db.role.findMany({
    where: { orgId, key: { in: roleKeys } },
  });
  await db.userRole.deleteMany({ where: { userId: user.id } });
  if (roles.length) {
    await db.userRole.createMany({
      data: roles.map((r) => ({ userId: user.id, roleId: r.id })),
    });
  }
  return {
    id: user.id,
    orgId,
    roles: roles.map(({ id, name: n, key }) => ({ id, name: n, key })),
    permissions: roles.reduce(
      (bits, r) => bits | r.permissions,
      extraPermissions,
    ),
  };
}

let orgId: string;
let roomA: string;
let roomB: string;
let groupA: string;
let admin: Actor;
let coordinator: Actor;
let requester: Actor;
let student: Actor;
/** Builds plans, and may also sign them off. */
let planner: Actor;
let reviewer: Actor;

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: "notify-itest" },
    update: {},
    create: { slug: "notify-itest", name: "Notify Org", timezone: TZ },
  });
  orgId = org.id;
  const settings = {
    blockConflicts: true,
    requireApprovalStudentBookings: true,
    requireApprovalChanges: true,
    maxStudentBookingMinutes: 120,
    slotMinutes: 60,
    dayStartMinutes: 9 * 60,
    dayEndMinutes: 17 * 60,
    workingDays: [1, 2, 3, 4, 5],
  };
  await db.orgSettings.upsert({
    where: { orgId },
    update: settings,
    create: { orgId, ...settings },
  });

  // Children before parents: the rows point at people, and requests at events.
  await db.notification.deleteMany({ where: { orgId } });
  await db.notificationPreference.deleteMany({ where: { user: { orgId } } });
  await db.schedulePlan.deleteMany({ where: { orgId } });
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
    where: { orgId_name: { orgId, name: "Notify Block" } },
    update: {},
    create: { orgId, name: "Notify Block" },
  });
  const mkRoom = async (code: string) =>
    (
      await db.room.upsert({
        where: { orgId_code: { orgId, code } },
        update: { isActive: true },
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
  roomA = await mkRoom("NT-1");
  roomB = await mkRoom("NT-2");

  const programme = await db.programme.upsert({
    where: { orgId_code: { orgId, code: "NTF" } },
    update: {},
    create: { orgId, code: "NTF", name: "Notify Programme" },
  });
  // Not an upsert: the natural key includes a nullable semester.
  groupA =
    (
      await db.group.findFirst({
        where: { orgId, programmeId: programme.id, name: "NTF-A" },
        select: { id: true },
      })
    )?.id ??
    (
      await db.group.create({
        data: {
          orgId,
          programmeId: programme.id,
          name: "NTF-A",
          label: "NTF-A",
        },
        select: { id: true },
      })
    ).id;

  // Whoever an earlier test made up is switched off, so they cannot be told
  // anything in this one. The fixtures below switch themselves back on.
  await db.user.updateMany({
    where: { orgId, email: { startsWith: "notify-itest-" } },
    data: { isActive: false },
  });

  admin = await makeActor("notify-itest-admin@plannr-demo.invalid", "Admin", [
    "admin",
  ]);
  coordinator = await makeActor(
    "notify-itest-coord@plannr-demo.invalid",
    "Coordinator",
    ["coordinator"],
  );
  requester = await makeActor(
    "notify-itest-requester@plannr-demo.invalid",
    "Requester",
    ["faculty"],
  );
  student = await makeActor(
    "notify-itest-student@plannr-demo.invalid",
    "Student",
    ["student"],
  );
  planner = await makeActor(
    "notify-itest-planner@plannr-demo.invalid",
    "Planner",
    ["coordinator"],
    PermissionFlags.ApproveSchedulePlans,
  );
  reviewer = await makeActor(
    "notify-itest-reviewer@plannr-demo.invalid",
    "Head of Department",
    ["faculty"],
    PermissionFlags.ApproveSchedulePlans,
  );
});

afterAll(async () => {
  await db.$disconnect();
});

const heard = (userId: string, category?: NotificationCategory) =>
  db.notification.findMany({
    where: { userId, ...(category ? { category } : {}) },
    orderBy: { createdAt: "asc" },
  });

/** A faculty member asking for a room, which lands as a request. */
async function requesterBooks(hour = 10) {
  const { event } = await callerFor(requester).events.create({
    kind: EventKind.BOOKING,
    title: `Study group ${hour}`,
    roomId: roomA,
    startTime: at(3, 2, hour),
    endTime: at(3, 2, hour + 1),
  });
  return event;
}

describe("approversOf", () => {
  it("finds everyone who can approve, however they came by it", async () => {
    const granted = await makeActor(
      "notify-itest-granted@plannr-demo.invalid",
      "Granted",
      ["faculty"],
      PermissionFlags.ApproveBookings,
    );
    const viaRole = await makeActor(
      "notify-itest-viarole@plannr-demo.invalid",
      "Via a role",
      [],
    );
    const role = await db.role.upsert({
      where: { orgId_key: { orgId, key: "notify-approver" } },
      update: { permissions: PermissionFlags.ApproveBookings },
      create: {
        orgId,
        key: "notify-approver",
        name: "Notify approver",
        permissions: PermissionFlags.ApproveBookings,
      },
    });
    await db.userRole.create({
      data: { userId: viaRole.id, roleId: role.id },
    });
    const gone = await makeActor(
      "notify-itest-gone@plannr-demo.invalid",
      "Gone",
      ["coordinator"],
      0n,
      { isActive: false },
    );
    const bot = await makeActor(
      "notify-itest-bot@plannr-demo.invalid",
      "Bot",
      ["admin"],
      0n,
      { isServiceAccount: true },
    );

    const found = new Set(await approversOf(db, orgId));

    for (const person of [admin, coordinator, granted, viaRole]) {
      expect(found.has(person.id)).toBe(true);
    }
    for (const person of [requester, student, reviewer, gone, bot]) {
      expect(found.has(person.id)).toBe(false);
    }
  });
});

describe("a booking waiting for a decision", () => {
  it("tells the approvers, and neither the requester nor a student", async () => {
    const event = await requesterBooks(10);
    expect(event.status).toBe(EventStatus.PENDING);

    for (const approver of [admin, coordinator]) {
      const rows = await heard(approver.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        category: "APPROVALS",
        url: "/approvals",
        sourceKey: `booking-requested:${event.id}`,
      });
      expect(rows[0]!.body).toContain("NT-1");
      expect(rows[0]!.body).toContain("10am to 11am");
    }
    expect(await heard(requester.id)).toHaveLength(0);
    expect(await heard(student.id)).toHaveLength(0);
  });

  it("tells nobody about a booking that needs no decision", async () => {
    await callerFor(coordinator).events.create({
      kind: EventKind.BOOKING,
      title: "Staff meeting",
      roomId: roomB,
      startTime: at(3, 3, 10),
      endTime: at(3, 3, 11),
    });
    expect(await db.notification.count({ where: { orgId } })).toBe(0);
  });
});

describe("a booking decided", () => {
  it("tells the requester once when it is approved", async () => {
    const event = await requesterBooks(10);
    const decide = callerFor(coordinator).events;

    await decide.approve({ id: event.id, note: "Bring your own cable" });
    // The second press finds nothing left to decide and says so.
    await expect(decide.approve({ id: event.id })).rejects.toThrow(
      /not waiting for a decision/,
    );

    const rows = await heard(requester.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: "REQUESTS",
      title: "Room booking approved",
      url: "/book",
      readAt: null,
    });
    expect(rows[0]!.body).toContain("NT-1");
    expect(rows[0]!.body).toContain("Bring your own cable");
    // The person who decided is not told of their own decision.
    expect(await heard(coordinator.id, "REQUESTS")).toHaveLength(0);
  });

  it("tells the requester once when it is rejected", async () => {
    const event = await requesterBooks(12);
    const decide = callerFor(admin).events;

    await decide.reject({ id: event.id, reason: "The room is being painted" });
    await expect(decide.reject({ id: event.id })).rejects.toThrow(
      /not waiting for a decision/,
    );

    const rows = await heard(requester.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: "REQUESTS",
      title: "Room booking declined",
    });
    expect(rows[0]!.body).toContain("The room is being painted");
  });

  it("does not tell a person about a booking they decided themselves", async () => {
    // Somebody who can approve skips the queue, so to have one that is both
    // theirs and pending the booking is written directly.
    const mine = await db.event.create({
      data: {
        orgId,
        kind: EventKind.BOOKING,
        status: EventStatus.PENDING,
        title: "Own request",
        roomId: roomB,
        createdById: coordinator.id,
        startTime: at(3, 4, 10),
        endTime: at(3, 4, 11),
        timezone: TZ,
      },
    });

    await callerFor(coordinator).events.reject({ id: mine.id });

    expect(await heard(coordinator.id)).toHaveLength(0);
  });
});

describe("a change to a booking", () => {
  /** A confirmed booking of the requester's, ready to be changed. */
  async function confirmedBooking() {
    const event = await requesterBooks(10);
    await callerFor(coordinator).events.approve({ id: event.id });
    await db.notification.deleteMany({ where: { orgId } });
    return event;
  }

  it("tells the approvers when it is filed", async () => {
    const event = await confirmedBooking();

    const request = await callerFor(requester).events.requestChange({
      eventId: event.id,
      newRoomId: roomB,
    });

    for (const approver of [admin, coordinator]) {
      const rows = await heard(approver.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        category: "APPROVALS",
        url: "/approvals",
        sourceKey: `change-requested:${request.id}`,
      });
      expect(rows[0]!.body).toContain("NT-2");
    }
    expect(await heard(requester.id)).toHaveLength(0);
    expect(await heard(student.id)).toHaveLength(0);
  });

  it("tells them too when an edit turns into a request", async () => {
    const event = await confirmedBooking();

    const result = await callerFor(requester).events.update({
      id: event.id,
      patch: { title: "Renamed study group" },
    });

    expect(result.applied).toBe(false);
    expect(await heard(coordinator.id, "APPROVALS")).toHaveLength(1);
    expect(await heard(admin.id, "APPROVALS")).toHaveLength(1);
  });

  it("tells the requester once when it is granted", async () => {
    const event = await confirmedBooking();
    const request = await callerFor(requester).events.requestChange({
      eventId: event.id,
      newRoomId: roomB,
    });

    const decide = callerFor(coordinator).events;
    await decide.approveChange({ id: request.id, note: "Fine by us" });
    await expect(decide.approveChange({ id: request.id })).rejects.toThrow(
      /already been decided/,
    );

    const rows = await heard(requester.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: "REQUESTS",
      title: "Change request approved",
      url: "/book",
    });
    expect(rows[0]!.body).toContain("Fine by us");
  });

  it("tells the requester once when it is refused", async () => {
    const event = await confirmedBooking();
    const request = await callerFor(requester).events.requestChange({
      eventId: event.id,
      newRoomId: roomB,
    });

    const decide = callerFor(coordinator).events;
    await decide.rejectChange({ id: request.id, reason: "Taken that day" });
    await expect(decide.rejectChange({ id: request.id })).rejects.toThrow(
      /already been decided/,
    );

    const rows = await heard(requester.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: "REQUESTS",
      title: "Change request declined",
    });
    expect(rows[0]!.body).toContain("Taken that day");
  });
});

describe("a schedule plan in review", () => {
  /** A plan with one line of demand, laid out and ready to share. */
  async function generatedPlan() {
    const api = callerFor(planner);
    const plan = await api.plans.create({ name: "Notify plan" });
    await api.plans.addRequirement({
      planId: plan.id,
      requirement: {
        groupId: groupA,
        subject: "Networks",
        sessionsPerWeek: 1,
        durationMinutes: 60,
        facultyIds: [],
        requiredFeatures: [] as never,
        roomType: null,
        minCapacity: null,
        preferredRoomId: null,
        notes: null,
      },
    });
    await api.plans.generate({ id: plan.id });
    return { api, planId: plan.id };
  }

  it("tells a reviewer it was shared with them, and not its author", async () => {
    const { api, planId } = await generatedPlan();

    await api.plans.share({
      id: planId,
      reviewerIds: [reviewer.id, planner.id],
      message: "Mind the Thursday labs",
    });

    const rows = await heard(reviewer.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: "PLAN_REVIEWS",
      url: `/planner/${planId}`,
    });
    expect(rows[0]!.body).toContain("Notify plan");
    expect(rows[0]!.body).toContain("Mind the Thursday labs");
    expect(await heard(planner.id)).toHaveLength(0);
  });

  it("does not tell the same reviewer again when it is shared again", async () => {
    const { api, planId } = await generatedPlan();
    const second = await makeActor(
      "notify-itest-reviewer2@plannr-demo.invalid",
      "Second Reviewer",
      ["faculty"],
      PermissionFlags.ApproveSchedulePlans,
    );

    await api.plans.share({ id: planId, reviewerIds: [reviewer.id] });
    await api.plans.share({
      id: planId,
      reviewerIds: [reviewer.id, second.id],
    });

    expect(await heard(reviewer.id)).toHaveLength(1);
    expect(await heard(second.id)).toHaveLength(1);
  });

  it("tells the author when a reviewer approves or asks for changes", async () => {
    const { api, planId } = await generatedPlan();
    await api.plans.share({ id: planId, reviewerIds: [reviewer.id] });

    const answer = callerFor(reviewer).plans;
    await answer.review({
      id: planId,
      decision: "CHANGES_REQUESTED",
      note: "Thursday afternoon is the placement drive",
    });

    let rows = await heard(planner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: "PLAN_REVIEWS",
      url: `/planner/${planId}`,
    });
    expect(rows[0]!.body).toContain("placement drive");

    // Sharing again resets the answers; the new one is new news.
    await api.plans.share({ id: planId, reviewerIds: [reviewer.id] });
    await answer.review({ id: planId, decision: "APPROVED" });
    rows = await heard(planner.id);
    expect(rows).toHaveLength(2);
    expect(rows[1]!.title).toBe("Schedule plan approved");
  });

  it("is quiet when the author reviews their own plan", async () => {
    const { api, planId } = await generatedPlan();
    await api.plans.share({ id: planId, reviewerIds: [planner.id] });

    await api.plans.review({ id: planId, decision: "APPROVED" });

    expect(await heard(planner.id)).toHaveLength(0);
  });
});

describe("what a person has chosen", () => {
  const prefer = (
    userId: string,
    category: NotificationCategory,
    choice: { inApp: boolean; push: boolean },
  ) =>
    db.notificationPreference.upsert({
      where: { userId_category: { userId, category } },
      update: choice,
      create: { userId, category, ...choice },
    });

  it("leaves no row for somebody with the inbox and push both off", async () => {
    await prefer(requester.id, "REQUESTS", { inApp: false, push: false });
    const event = await requesterBooks(10);

    await callerFor(coordinator).events.approve({ id: event.id });

    expect(await heard(requester.id)).toHaveLength(0);
  });

  it("keeps the row, with no push owed, for somebody with only push off", async () => {
    await prefer(requester.id, "REQUESTS", { inApp: true, push: false });
    const event = await requesterBooks(10);

    await callerFor(coordinator).events.approve({ id: event.id });

    const rows = await heard(requester.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ inInbox: true, pushPending: false });
  });

  it("queues a push by default, and an unlisted row for push alone", async () => {
    await prefer(requester.id, "REQUESTS", { inApp: false, push: true });
    const event = await requesterBooks(10);

    await callerFor(coordinator).events.approve({ id: event.id });

    const rows = await heard(requester.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ inInbox: false, pushPending: true });
  });

  it("honours a choice for one category without touching another", async () => {
    await prefer(coordinator.id, "APPROVALS", { inApp: false, push: false });

    await requesterBooks(10);

    expect(await heard(coordinator.id)).toHaveLength(0);
    expect(await heard(admin.id)).toHaveLength(1);
  });
});
