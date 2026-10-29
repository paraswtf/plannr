import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/server/db";
import { regenerateOccurrences } from "~/server/services/occurrences";
import { EventKind, EventStatus, RoomType } from "../../../../generated/prisma";

/**
 * Class changes reaching people, against a real Postgres.
 *
 * The unit tests cover what a change is called and what is said about it. What
 * only a database can show is the rest of the journey: that the notice is
 * written by the edit itself, that it becomes one notification per person
 * concerned and nobody else, that each of those is pushed once to that person's
 * devices, and that the claim queries (`FOR UPDATE SKIP LOCKED`) hand each
 * piece of work to exactly one dispatcher when two run at once.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`). Web Push
 * itself is replaced: nothing here talks to a push service.
 */

const sent: Array<{ endpoint: string; payload: Record<string, string> }> = [];
let failWith: number | null = null;
let pushOn = true;

vi.mock("./config", () => ({
  pushEnabled: () => pushOn,
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

/** A student in some groups, with a device on each endpoint given. */
async function person(
  email: string,
  groupIds: string[],
  ...endpoints: string[]
) {
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
  for (const endpoint of endpoints) {
    await db.pushSubscription.create({
      data: { userId: user.id, endpoint, p256dh: "k", auth: "a" },
    });
  }
  return user;
}

/** A teacher, who is addressed through their faculty profile and not a group. */
async function teacher(email: string, endpoint: string) {
  const user = await db.user.create({ data: { email, name: email, orgId } });
  const profile = await db.facultyProfile.create({
    data: { userId: user.id, orgId },
  });
  await db.pushSubscription.create({
    data: { userId: user.id, endpoint, p256dh: "k", auth: "a" },
  });
  return { user, facultyId: profile.id };
}

async function aClass(title: string, facultyId?: string) {
  const event = await db.event.create({
    data: {
      orgId,
      kind: EventKind.CLASS,
      status: EventStatus.CONFIRMED,
      title,
      roomId: roomA,
      groupId,
      facultyId,
      startTime: soon(),
      endTime: soon(1),
      timezone: TZ,
    },
  });
  await regenerateOccurrences(db, event.id);
  return event;
}

const notificationsOf = (userId: string) =>
  db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

const sentTo = (endpoint: string) =>
  sent.filter((s) => s.endpoint === endpoint);

beforeEach(async () => {
  sent.length = 0;
  failWith = null;
  pushOn = true;

  const org = await db.organization.upsert({
    where: { slug: "push-itest" },
    update: {},
    create: { slug: "push-itest", name: "Push Org", timezone: TZ },
  });
  orgId = org.id;

  await db.classChangeNotice.deleteMany({});
  await db.notification.deleteMany({ where: { orgId } });
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

describe("addressing a notice", () => {
  it("writes one notification per person concerned and nobody else", async () => {
    const student = await person(
      "in@push.test",
      [groupId],
      "https://p.test/in",
    );
    const outsider = await person(
      "out@push.test",
      [otherGroupId],
      "https://p.test/out",
    );
    const teaching = await teacher("teach@push.test", "https://p.test/teach");
    const event = await aClass("Design Thinking", teaching.facultyId);
    const [notice] = await db.classChangeNotice.findMany({
      where: { eventId: event.id },
    });

    const report = await dispatchPending(db);

    expect(report.notices).toBe(1);
    expect(report.notified).toBe(2);
    expect(await notificationsOf(outsider.id)).toEqual([]);
    for (const who of [student, teaching.user]) {
      const rows = await notificationsOf(who.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        orgId,
        category: "CLASS_CHANGES",
        title: "New class: Design Thinking",
        url: "/schedule",
        sourceKey: `class-change:${notice!.id}`,
        inInbox: true,
        readAt: null,
      });
    }
  });

  it("marks the notice sent, and a second run finds nothing to do", async () => {
    await person("in@push.test", [groupId], "https://p.test/in");
    await aClass("Design Thinking");

    await dispatchPending(db);
    expect(
      await db.classChangeNotice.count({ where: { sentAt: { not: null } } }),
    ).toBe(1);
    const before = await db.notification.count({ where: { orgId } });
    sent.length = 0;

    const again = await dispatchPending(db);

    expect(again).toMatchObject({ notices: 0, notified: 0, pushes: 0 });
    expect(sent).toEqual([]);
    expect(await db.notification.count({ where: { orgId } })).toBe(before);
  });

  it("fills the inbox even when push is not set up", async () => {
    pushOn = false;
    const student = await person(
      "in@push.test",
      [groupId],
      "https://p.test/in",
    );
    await aClass("Design Thinking");

    const report = await dispatchPending(db);

    expect(report).toMatchObject({ notices: 1, notified: 1, pushes: 0 });
    expect(sent).toEqual([]);
    const [row] = await notificationsOf(student.id);
    expect(row).toMatchObject({ inInbox: true, pushPending: false });
  });

  it("does not tell anybody twice when a dispatcher is retried after dying", async () => {
    const student = await person(
      "in@push.test",
      [groupId],
      "https://p.test/in",
    );
    await aClass("Design Thinking");
    await dispatchPending(db);
    sent.length = 0;

    // As if the dispatcher had written the rows and died before marking the
    // notice sent: the lease runs out and the notice is taken again.
    await db.classChangeNotice.updateMany({
      data: { sentAt: null, claimedAt: null },
    });
    const retry = await dispatchPending(db);

    expect(retry.notices).toBe(1);
    expect(retry.notified).toBe(0);
    expect(await notificationsOf(student.id)).toHaveLength(1);
    expect(sent).toEqual([]);
  });

  it("lets a notice go stale rather than announcing it a day late", async () => {
    const student = await person(
      "in@push.test",
      [groupId],
      "https://p.test/in",
    );
    await aClass("Design Thinking");
    await db.$executeRaw`UPDATE "ClassChangeNotice" SET "createdAt" = NOW() - interval '25 hours' WHERE "eventId" IN (SELECT "id" FROM "Event" WHERE "orgId" = ${orgId})`;

    const report = await dispatchPending(db);

    expect(report.notices).toBe(0);
    expect(await notificationsOf(student.id)).toEqual([]);
    expect(sent).toEqual([]);
  });
});

describe("pushing to devices", () => {
  it("sends each person's notification to each of their devices, by way of the inbox", async () => {
    const student = await person(
      "in@push.test",
      [groupId],
      "https://p.test/phone",
      "https://p.test/laptop",
    );
    await person("out@push.test", [otherGroupId], "https://p.test/out");
    await aClass("Design Thinking");

    const report = await dispatchPending(db);

    const [row] = await notificationsOf(student.id);
    expect(report.pushes).toBe(1);
    expect(sent.map((s) => s.endpoint).sort()).toEqual([
      "https://p.test/laptop",
      "https://p.test/phone",
    ]);
    for (const push of sent) {
      expect(push.payload).toMatchObject({
        title: "New class: Design Thinking",
        url: `/api/notifications/${row!.id}/open`,
        tag: row!.id,
      });
    }
    expect(sentTo("https://p.test/out")).toEqual([]);
  });

  it("gives every person's push its own notification id", async () => {
    const one = await person("one@push.test", [groupId], "https://p.test/one");
    const two = await person("two@push.test", [groupId], "https://p.test/two");
    await aClass("Design Thinking");

    await dispatchPending(db);

    const [rowOne] = await notificationsOf(one.id);
    const [rowTwo] = await notificationsOf(two.id);
    expect(rowOne!.id).not.toBe(rowTwo!.id);
    expect(sentTo("https://p.test/one")[0]!.payload.tag).toBe(rowOne!.id);
    expect(sentTo("https://p.test/two")[0]!.payload.tag).toBe(rowTwo!.id);
  });

  it("marks a notification pushed, and does not push it again", async () => {
    const student = await person(
      "in@push.test",
      [groupId],
      "https://p.test/in",
    );
    await aClass("Design Thinking");

    await dispatchPending(db);
    const [row] = await notificationsOf(student.id);
    expect(row).toMatchObject({ pushPending: false });
    expect(row!.pushedAt).toBeInstanceOf(Date);

    sent.length = 0;
    await dispatchPending(db);
    expect(sent).toEqual([]);
  });

  it("gives the inbox row but no push to somebody who switched class-change push off", async () => {
    const quiet = await person(
      "quiet@push.test",
      [groupId],
      "https://p.test/q",
    );
    const loud = await person("loud@push.test", [groupId], "https://p.test/l");
    await db.notificationPreference.create({
      data: {
        userId: quiet.id,
        category: "CLASS_CHANGES",
        inApp: true,
        push: false,
      },
    });
    await aClass("Design Thinking");

    await dispatchPending(db);

    const [row] = await notificationsOf(quiet.id);
    expect(row).toMatchObject({ inInbox: true, pushPending: false });
    expect(sentTo("https://p.test/q")).toEqual([]);
    expect(sentTo("https://p.test/l")).toHaveLength(1);
    expect(await notificationsOf(loud.id)).toHaveLength(1);
  });

  it("pushes without listing it for somebody who switched the inbox off", async () => {
    const phoneOnly = await person(
      "phone@push.test",
      [groupId],
      "https://p.test/phone",
    );
    await db.notificationPreference.create({
      data: {
        userId: phoneOnly.id,
        category: "CLASS_CHANGES",
        inApp: false,
        push: true,
      },
    });
    await aClass("Design Thinking");

    await dispatchPending(db);

    const [row] = await notificationsOf(phoneOnly.id);
    expect(row).toMatchObject({ inInbox: false });
    expect(sentTo("https://p.test/phone")).toHaveLength(1);
  });

  it("writes nothing for somebody who switched both off", async () => {
    const off = await person("off@push.test", [groupId], "https://p.test/off");
    await db.notificationPreference.create({
      data: {
        userId: off.id,
        category: "CLASS_CHANGES",
        inApp: false,
        push: false,
      },
    });
    await aClass("Design Thinking");

    await dispatchPending(db);

    expect(await notificationsOf(off.id)).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("settles a notification for somebody with no device", async () => {
    const bare = await person("bare@push.test", [groupId]);
    await aClass("Design Thinking");

    await dispatchPending(db);

    const [row] = await notificationsOf(bare.id);
    expect(row).toMatchObject({ inInbox: true, pushPending: false });
    expect(sent).toEqual([]);
  });

  it("forgets a device the push service says is gone", async () => {
    const student = await person(
      "gone@push.test",
      [groupId],
      "https://p.test/g",
    );
    await aClass("Design Thinking");

    failWith = 410;
    const report = await dispatchPending(db);

    expect(report.pruned).toBe(1);
    expect(
      await db.pushSubscription.count({ where: { user: { orgId } } }),
    ).toBe(0);
    // Reaching nobody is not a failure to retry for ever, and the person still
    // has the notification to read.
    const [row] = await notificationsOf(student.id);
    expect(row).toMatchObject({ inInbox: true, pushPending: false });
    expect(
      await db.classChangeNotice.count({ where: { sentAt: { not: null } } }),
    ).toBe(1);
  });

  it("keeps a push owed when the push service has a bad moment, and sends it next time", async () => {
    const student = await person(
      "slow@push.test",
      [groupId],
      "https://p.test/s",
    );
    await aClass("Design Thinking");

    failWith = 503;
    const report = await dispatchPending(db);

    expect(report.failed).toBe(1);
    // The notice did its job, which was to reach the inbox; the push is what
    // stays owed, and the device is kept.
    expect(await db.classChangeNotice.count({ where: { sentAt: null } })).toBe(
      0,
    );
    const [owed] = await notificationsOf(student.id);
    expect(owed).toMatchObject({ pushPending: true, pushAttempts: 1 });
    expect(owed!.pushClaimedAt).toBeNull();
    expect(
      await db.pushSubscription.count({ where: { user: { orgId } } }),
    ).toBe(1);

    failWith = null;
    await dispatchPending(db);

    expect(sentTo("https://p.test/s")).toHaveLength(1);
    const [done] = await notificationsOf(student.id);
    expect(done).toMatchObject({ pushPending: false });
  });

  it("drops a push that has waited a day, and keeps the inbox row", async () => {
    pushOn = false;
    const student = await person(
      "late@push.test",
      [groupId],
      "https://p.test/l",
    );
    await aClass("Design Thinking");
    await dispatchPending(db);
    // Push comes on after the news is a day old: the row was never owed one
    // here, so make it owed and old, which is what an outage leaves behind.
    pushOn = true;
    await db.$executeRaw`UPDATE "Notification" SET "pushPending" = true, "createdAt" = NOW() - interval '25 hours' WHERE "orgId" = ${orgId}`;

    await dispatchPending(db);

    expect(sent).toEqual([]);
    const [row] = await notificationsOf(student.id);
    expect(row).toMatchObject({ inInbox: true, pushPending: false });
  });

  it("gives each push to only one of two dispatchers running at once", async () => {
    const student = await person(
      "busy@push.test",
      [groupId],
      "https://p.test/b",
    );
    for (let i = 0; i < 8; i++) await aClass(`Class ${i}`);

    await Promise.all([dispatchPending(db), dispatchPending(db)]);

    const titles = sent.map((s) => s.payload.title);
    expect(titles).toHaveLength(8);
    expect(new Set(titles).size).toBe(8);
    expect(new Set(sent.map((s) => s.payload.tag)).size).toBe(8);
    // And one row each, however the two interleaved.
    expect(await notificationsOf(student.id)).toHaveLength(8);
  });
});
