import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/server/db";
import { regenerateOccurrences } from "~/server/services/occurrences";
import { EventKind, EventStatus, RoomType } from "../../../../generated/prisma";

/**
 * Class changes reaching phones, against a real Postgres.
 *
 * The unit tests cover what a change is called and what is said about it. What
 * only a database can show is the other half: that the notice is written by the
 * edit itself, that the audience is the right people, and that the claim query
 * (`FOR UPDATE SKIP LOCKED`) hands each notice to exactly one dispatcher when
 * two run at once.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`). Web Push
 * itself is replaced: nothing here talks to a push service.
 */

const sent: Array<{ endpoint: string; payload: Record<string, string> }> = [];
let failWith: number | null = null;

vi.mock("./config", () => ({
  pushEnabled: () => true,
  webPush: () => ({
    sendNotification: async (
      subscription: { endpoint: string },
      payload: string,
    ) => {
      if (failWith)
        throw Object.assign(new Error("push"), { statusCode: failWith });
      sent.push({
        endpoint: subscription.endpoint,
        payload: JSON.parse(payload) as Record<string, string>,
      });
    },
  }),
}));

import { dispatchPending } from "./dispatch";

const TZ = "Asia/Kolkata";
const DAY = 86_400_000;
/** Two days out at a fixed hour: inside the notification horizon. */
const soon = (hours = 0) => {
  const d = new Date(Date.now() + 2 * DAY);
  d.setUTCHours(4 + hours, 30, 0, 0);
  return d;
};

let orgId: string;
let groupId: string;
let otherGroupId: string;
let roomA: string;
let roomB: string;

async function person(email: string, groupIds: string[], endpoint: string) {
  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: email, orgId },
  });
  const profile = await db.studentProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, orgId, prn: email },
  });
  for (const gid of groupIds) {
    await db.studentGroupMembership.upsert({
      where: { studentId_groupId: { studentId: profile.id, groupId: gid } },
      update: {},
      create: { studentId: profile.id, groupId: gid },
    });
  }
  await db.pushSubscription.create({
    data: { userId: user.id, endpoint, p256dh: "k", auth: "a" },
  });
  return user;
}

async function aClass(title: string) {
  const event = await db.event.create({
    data: {
      orgId,
      kind: EventKind.CLASS,
      status: EventStatus.CONFIRMED,
      title,
      roomId: roomA,
      groupId,
      startTime: soon(),
      endTime: soon(1),
      timezone: TZ,
    },
  });
  await regenerateOccurrences(db, event.id);
  return event;
}

beforeEach(async () => {
  sent.length = 0;
  failWith = null;

  const org = await db.organization.upsert({
    where: { slug: "push-itest" },
    update: {},
    create: { slug: "push-itest", name: "Push Org", timezone: TZ },
  });
  orgId = org.id;

  await db.classChangeNotice.deleteMany({});
  await db.pushSubscription.deleteMany({ where: { user: { orgId } } });
  await db.event.deleteMany({ where: { orgId } });
  await db.user.deleteMany({ where: { email: { endsWith: "@push.test" } } });

  const building = await db.building.upsert({
    where: { orgId_name: { orgId, name: "Push Block" } },
    update: {},
    create: { orgId, name: "Push Block" },
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
  roomA = await mkRoom("PU-1");
  roomB = await mkRoom("PU-2");

  const programme = await db.programme.upsert({
    where: { orgId_code: { orgId, code: "PUS" } },
    update: {},
    create: { orgId, code: "PUS", name: "Push Programme" },
  });
  const semester = await db.semester.upsert({
    where: { orgId_name: { orgId, name: "Push Term" } },
    update: {},
    create: {
      orgId,
      name: "Push Term",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2036-01-01"),
    },
  });
  const mkGroup = async (name: string) =>
    (
      await db.group.upsert({
        where: {
          programmeId_semesterId_name: {
            programmeId: programme.id,
            semesterId: semester.id,
            name,
          },
        },
        update: {},
        create: {
          orgId,
          programmeId: programme.id,
          semesterId: semester.id,
          name,
        },
      })
    ).id;
  groupId = await mkGroup("PUS-1");
  otherGroupId = await mkGroup("PUS-2");
});

afterAll(async () => {
  await db.$disconnect();
});

describe("a class edit queues its own notice", () => {
  it("writes one when a class is added, naming the groups it concerns", async () => {
    const event = await aClass("Design Thinking");
    const notices = await db.classChangeNotice.findMany({
      where: { eventId: event.id },
    });
    expect(notices).toHaveLength(1);
    expect(notices[0]!.kind).toBe("ADDED");
    expect(notices[0]!.groupIds).toEqual([groupId]);
    expect(notices[0]!.sentAt).toBeNull();
  });

  it("writes a MOVED notice that says where it went", async () => {
    const event = await aClass("Design Thinking");
    await db.classChangeNotice.deleteMany({});

    await db.event.update({ where: { id: event.id }, data: { roomId: roomB } });
    await regenerateOccurrences(db, event.id);

    const [notice] = await db.classChangeNotice.findMany({
      where: { eventId: event.id },
    });
    expect(notice!.kind).toBe("MOVED");
    expect(notice!.title).toBe("Design Thinking has moved");
    expect(notice!.body).toContain("room PU-2");
    expect(notice!.body).toContain("was");
  });

  it("writes nothing for an edit that changes no sitting", async () => {
    const event = await aClass("Design Thinking");
    await db.classChangeNotice.deleteMany({});

    await db.event.update({
      where: { id: event.id },
      data: { notes: "bring a laptop" },
    });
    await regenerateOccurrences(db, event.id);

    expect(await db.classChangeNotice.count()).toBe(0);
  });

  it("does not announce a room booking", async () => {
    const booking = await db.event.create({
      data: {
        orgId,
        kind: EventKind.BOOKING,
        status: EventStatus.CONFIRMED,
        title: "Study group",
        roomId: roomA,
        groupId,
        startTime: soon(),
        endTime: soon(1),
        timezone: TZ,
      },
    });
    await regenerateOccurrences(db, booking.id);
    expect(await db.classChangeNotice.count()).toBe(0);
  });
});

describe("dispatching", () => {
  it("sends to the people in the group and nobody else, then marks it sent", async () => {
    await person("in@push.test", [groupId], "https://push.test/in");
    await person("out@push.test", [otherGroupId], "https://push.test/out");
    await aClass("Design Thinking");

    const report = await dispatchPending(db);

    expect(report.notices).toBe(1);
    expect(sent.map((s) => s.endpoint)).toEqual(["https://push.test/in"]);
    expect(sent[0]!.payload).toMatchObject({
      title: "New class: Design Thinking",
      url: "/schedule",
    });
    expect(
      await db.classChangeNotice.count({ where: { sentAt: { not: null } } }),
    ).toBe(1);

    // Nothing left to send the second time round.
    sent.length = 0;
    expect((await dispatchPending(db)).notices).toBe(0);
    expect(sent).toEqual([]);
  });

  it("forgets a device the push service says is gone", async () => {
    await person("gone@push.test", [groupId], "https://push.test/gone");
    await aClass("Design Thinking");

    failWith = 410;
    const report = await dispatchPending(db);

    expect(report.pruned).toBe(1);
    expect(
      await db.pushSubscription.count({ where: { user: { orgId } } }),
    ).toBe(0);
    // Reaching nobody is not a failure to retry for ever.
    expect(
      await db.classChangeNotice.count({ where: { sentAt: { not: null } } }),
    ).toBe(1);
  });

  it("keeps a notice open when the push service has a bad moment", async () => {
    await person("slow@push.test", [groupId], "https://push.test/slow");
    await aClass("Design Thinking");

    failWith = 503;
    const report = await dispatchPending(db);

    expect(report.failed).toBe(1);
    expect(await db.classChangeNotice.count({ where: { sentAt: null } })).toBe(
      1,
    );
    expect(
      await db.pushSubscription.count({ where: { user: { orgId } } }),
    ).toBe(1);
  });

  it("gives each notice to only one of two dispatchers running at once", async () => {
    await person("busy@push.test", [groupId], "https://push.test/busy");
    for (let i = 0; i < 8; i++) await aClass(`Class ${i}`);

    await Promise.all([dispatchPending(db), dispatchPending(db)]);

    const titles = sent.map((s) => s.payload.title);
    expect(titles).toHaveLength(8);
    expect(new Set(titles).size).toBe(8);
  });
});
