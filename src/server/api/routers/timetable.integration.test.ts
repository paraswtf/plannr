import { beforeEach, describe, expect, it } from "vitest";

import { startOfLocalDay } from "~/lib/dates";
import { PermissionBitField, SYSTEM_ROLES } from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";

/**
 * Looking at somebody else's schedule.
 *
 * The screen offers whoever runs the timetable a way to answer "where is this
 * lecturer at two o'clock?" — which means a query that returns a named
 * individual's day. That is personal information, so the rule being protected
 * here is who may ask: seeing every event on the timetable is not enough on its
 * own, because a lecturer has that and has no business browsing individuals.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`).
 */

const TZ = "Asia/Kolkata";
const createCaller = createCallerFactory(appRouter);

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
      },
    },
    actor,
    bits: new PermissionBitField(actor.permissions),
    orgId: actor.orgId,
  } as Parameters<typeof createCaller>[0]);
}

let orgId: string;
let coordinator: Actor;
let lecturer: Actor;
let learner: Actor;
let roomId: string;
let groupId: string;
/** 10am on a fixed Wednesday, in the org's timezone. */
const DAY = new Date("2026-08-12T04:30:00.000Z");

async function makeActor(
  email: string,
  name: string,
  roleKeys: string[],
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
  if (roles.length) {
    await db.userRole.createMany({
      data: roles.map((r) => ({ userId: user.id, roleId: r.id })),
    });
  }
  return {
    id: user.id,
    orgId,
    roles: roles.map(({ id, name: n, key }) => ({ id, name: n, key })),
    permissions: roles.reduce((bits, r) => bits | r.permissions, 0n),
  };
}

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: "sched-itest" },
    update: {},
    create: { slug: "sched-itest", name: "Schedule Org", timezone: TZ },
  });
  orgId = org.id;
  await db.orgSettings.upsert({ where: { orgId }, update: {}, create: { orgId } });

  await db.event.deleteMany({ where: { orgId } });
  await db.group.deleteMany({ where: { orgId } });
  await db.batch.deleteMany({ where: { orgId } });
  await db.programme.deleteMany({ where: { orgId } });
  await db.room.deleteMany({ where: { orgId } });
  await db.building.deleteMany({ where: { orgId } });

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

  coordinator = await makeActor("sched-coordinator@plannr-demo.invalid", "The Coordinator", ["coordinator"]);
  lecturer = await makeActor("sched-lecturer@plannr-demo.invalid", "The Lecturer", ["faculty"]);
  learner = await makeActor("sched-learner@plannr-demo.invalid", "The Learner", ["student"]);

  const faculty = await db.facultyProfile.upsert({
    where: { userId: lecturer.id },
    update: {},
    create: { userId: lecturer.id, orgId, shortName: "The Lecturer" },
  });
  const profile = await db.studentProfile.upsert({
    where: { userId: learner.id },
    update: {},
    create: { userId: learner.id, orgId, prn: "99930199001" },
  });

  const building = await db.building.create({ data: { orgId, name: "Main" } });
  const room = await db.room.create({
    data: {
      orgId,
      buildingId: building.id,
      code: "S-1",
      capacity: 40,
      floor: 0,
      type: "LECTURE",
    },
  });
  roomId = room.id;

  const course = await db.programme.create({
    data: { orgId, code: "SCH", name: "Scheduling Studies" },
  });
  const batch = await db.batch.create({
    data: {
      orgId,
      programmeId: course.id,
      name: "25-29 SCH",
      startYear: 2025,
      endYear: 2029,
    },
  });
  const group = await db.group.create({
    data: { orgId, programmeId: course.id, batchId: batch.id, name: "SCH-A" },
  });
  groupId = group.id;
  await db.studentGroupMembership.create({
    data: { studentId: profile.id, groupId: group.id },
  });

  // One class: the lecturer takes it, the learner attends it.
  const event = await db.event.create({
    data: {
      orgId,
      roomId,
      groupId,
      facultyId: faculty.id,
      title: "Scheduling, Applied",
      kind: "CLASS",
      status: "CONFIRMED",
      startTime: DAY,
      endTime: new Date(DAY.getTime() + 3_600_000),
      timezone: TZ,
    },
  });
  await db.eventOccurrence.create({
    data: {
      orgId,
      eventId: event.id,
      start: DAY,
      end: new Date(DAY.getTime() + 3_600_000),
      roomId,
      groupId,
      facultyId: faculty.id,
      kind: "CLASS",
      status: "CONFIRMED",
    },
  });
});

describe("a schedule of one's own", () => {
  it("gives a student the class they attend, and says who takes it", async () => {
    const day = await callerFor(learner).timetable.mySchedule({ date: DAY });
    expect(day.viewAs).toBe("student");
    expect(day.occurrences.map((o) => o.title)).toEqual(["Scheduling, Applied"]);
    expect(day.detail).toMatchObject({ teaching: true, cohort: false });
    expect(day.viewingAs).toBeNull();
  });

  it("gives a lecturer the same class, described by who is in it", async () => {
    const day = await callerFor(lecturer).timetable.mySchedule({ date: DAY });
    expect(day.viewAs).toBe("faculty");
    expect(day.detail).toMatchObject({ cohort: true, teaching: false });
    expect(day.occurrences[0]?.cohorts[0]).toMatchObject({
      name: "SCH-A",
      batch: "25-29 SCH",
      size: 1,
    });
  });

  it("offers a coordinator with no profile no angle of their own", async () => {
    const day = await callerFor(coordinator).timetable.mySchedule({ date: DAY });
    expect(day.views).toEqual(["coordinator"]);
    expect(day.occurrences).toEqual([]);
  });
});

describe("looking at somebody else's schedule", () => {
  it("lets a coordinator see a lecturer's day, as the lecturer's own", async () => {
    const day = await callerFor(coordinator).timetable.mySchedule({
      date: DAY,
      asUserId: lecturer.id,
    });
    expect(day.viewingAs).toMatchObject({ name: "The Lecturer", isFaculty: true });
    expect(day.occurrences.map((o) => o.title)).toEqual(["Scheduling, Applied"]);
    // Described by what they are — a lecturer is told who is in the room.
    expect(day.detail).toMatchObject({ cohort: true, teaching: false });
  });

  it("keeps the viewer's own angles on offer, so they can get back", async () => {
    const day = await callerFor(coordinator).timetable.mySchedule({
      date: DAY,
      asUserId: learner.id,
    });
    expect(day.views).toEqual(["coordinator"]);
    expect(day.viewingAs).toMatchObject({ name: "The Learner", isStudent: true });
    expect(day.detail).toMatchObject({ teaching: true, cohort: false });
  });

  it("refuses a lecturer, who can see every event but not who people are", async () => {
    await expect(
      callerFor(lecturer).timetable.mySchedule({ date: DAY, asUserId: learner.id }),
    ).rejects.toThrow(/permission/i);
  });

  it("refuses a student outright", async () => {
    await expect(
      callerFor(learner).timetable.mySchedule({ date: DAY, asUserId: lecturer.id }),
    ).rejects.toThrow(/permission/i);
  });

  it("refuses somebody from another institution", async () => {
    const other = await db.organization.upsert({
      where: { slug: "sched-itest-other" },
      update: {},
      create: { slug: "sched-itest-other", name: "Elsewhere", timezone: TZ },
    });
    const outsider = await db.user.upsert({
      where: { email: "sched-outsider@plannr-demo.invalid" },
      update: {},
      create: { email: "sched-outsider@plannr-demo.invalid", orgId: other.id },
    });
    await expect(
      callerFor(coordinator).timetable.mySchedule({ date: DAY, asUserId: outsider.id }),
    ).rejects.toThrow(/No such person/i);
  });

  it("treats asking for yourself as your own day, not somebody else's", async () => {
    const day = await callerFor(lecturer).timetable.mySchedule({
      date: DAY,
      asUserId: lecturer.id,
    });
    expect(day.viewingAs).toBeNull();
    expect(day.viewAs).toBe("faculty");
  });
});

describe("the people who can be looked at", () => {
  it("lists only those with a day of their own", async () => {
    const people = await callerFor(coordinator).timetable.peopleWithSchedules({});
    const emails = people.map((p) => p.email);
    expect(emails).toContain("sched-lecturer@plannr-demo.invalid");
    expect(emails).toContain("sched-learner@plannr-demo.invalid");
    // The coordinator has neither profile, so has no schedule to look at.
    expect(emails).not.toContain("sched-coordinator@plannr-demo.invalid");
  });

  it("says which of the two each one is", async () => {
    const people = await callerFor(coordinator).timetable.peopleWithSchedules({});
    expect(people.find((p) => p.name === "The Lecturer")?.kind).toBe("faculty");
    expect(people.find((p) => p.name === "The Learner")).toMatchObject({
      kind: "student",
      detail: "99930199001",
    });
  });

  it("searches by name, address and PRN", async () => {
    const caller = callerFor(coordinator);
    expect((await caller.timetable.peopleWithSchedules({ query: "Lectur" })).map((p) => p.name)).toEqual(["The Lecturer"]);
    expect((await caller.timetable.peopleWithSchedules({ query: "99930199001" })).map((p) => p.name)).toEqual(["The Learner"]);
    expect((await caller.timetable.peopleWithSchedules({ query: "sched-learner@" })).map((p) => p.name)).toEqual(["The Learner"]);
  });

  it("is closed to a lecturer and to a student", async () => {
    await expect(callerFor(lecturer).timetable.peopleWithSchedules({})).rejects.toThrow(/permission/i);
    await expect(callerFor(learner).timetable.peopleWithSchedules({})).rejects.toThrow(/permission/i);
  });
});

/**
 * Which day the screen opens on.
 *
 * Asked for no date, the server answers with the day the next class falls on.
 * The rule is measured from the *end* of a sitting rather than its start, plus
 * half an hour of grace, so these tests are mostly about the boundaries: a
 * lecture in progress, one that has only just finished, one finished long
 * enough ago to let go of, and a term with nothing left in it at all.
 *
 * Everything here is placed relative to the real clock, because that is what
 * the router compares against — a fixture pinned to a date would pass in
 * August and fail in September.
 */
describe("the day the schedule opens on", () => {
  const HOUR = 3_600_000;

  /** Puts one class on the timetable for the lecturer and the learner. */
  async function classAt(start: Date, lengthMs = HOUR) {
    const end = new Date(start.getTime() + lengthMs);
    const faculty = await db.facultyProfile.findUniqueOrThrow({
      where: { userId: lecturer.id },
      select: { id: true },
    });
    const event = await db.event.create({
      data: {
        orgId,
        roomId,
        groupId,
        facultyId: faculty.id,
        title: "The Next One",
        kind: "CLASS",
        status: "CONFIRMED",
        startTime: start,
        endTime: end,
        timezone: TZ,
      },
    });
    await db.eventOccurrence.create({
      data: {
        orgId,
        eventId: event.id,
        start,
        end,
        roomId,
        groupId,
        facultyId: faculty.id,
        kind: "CLASS",
        status: "CONFIRMED",
      },
    });
    return { start, end };
  }

  it("opens on the day of the next class rather than on today", async () => {
    const later = new Date(Date.now() + 3 * 24 * HOUR);
    await classAt(later);

    const day = await callerFor(learner).timetable.mySchedule({});
    expect(day.from).toEqual(startOfLocalDay(later, TZ));
    expect(day.occurrences.map((o) => o.title)).toEqual(["The Next One"]);
  });

  it("stays on today while a class is still to come", async () => {
    // Two hours out, and far enough from midnight that "today" is unambiguous.
    const soon = new Date(Date.now() + 2 * HOUR);
    await classAt(soon);

    const day = await callerFor(learner).timetable.mySchedule({});
    expect(day.from).toEqual(startOfLocalDay(soon, TZ));
  });

  it("counts a class already running as the one you are going to", async () => {
    // Started ten minutes ago. Anchoring on the start instead of the end would
    // send somebody sitting in this lecture to tomorrow.
    const started = new Date(Date.now() - 10 * 60_000);
    await classAt(started, HOUR);

    const day = await callerFor(learner).timetable.mySchedule({});
    expect(day.from).toEqual(startOfLocalDay(started, TZ));
    expect(day.occurrences.map((o) => o.title)).toContain("The Next One");
  });

  it("holds the day for half an hour after a class has ended", async () => {
    // Finished ten minutes ago, with nothing else for three days. Attendance
    // is still being taken in the corridor; moving the screen off this day now
    // would take it away mid-sentence.
    const ended = new Date(Date.now() - 10 * 60_000 - HOUR);
    await classAt(ended, HOUR);
    await classAt(new Date(Date.now() + 3 * 24 * HOUR));

    const day = await callerFor(learner).timetable.mySchedule({});
    expect(day.from).toEqual(startOfLocalDay(ended, TZ));
    expect(day.occurrences.map((o) => o.title)).toEqual(["The Next One"]);
  });

  it("moves on to the next class once the half hour is up", async () => {
    // A minute past the grace, which is the whole difference between this test
    // and the one above it.
    await classAt(new Date(Date.now() - 31 * 60_000 - HOUR), HOUR);
    const later = new Date(Date.now() + 3 * 24 * HOUR);
    await classAt(later);

    const day = await callerFor(learner).timetable.mySchedule({});
    expect(day.from).toEqual(startOfLocalDay(later, TZ));
  });

  it("falls back to today when nothing is left on the timetable", async () => {
    // The only class in the fixture is in the past.
    const day = await callerFor(learner).timetable.mySchedule({});
    expect(day.from).toEqual(startOfLocalDay(new Date(), TZ));
    expect(day.occurrences).toEqual([]);
  });

  it("gives today to somebody with no classes of their own", async () => {
    await classAt(new Date(Date.now() + 3 * 24 * HOUR));

    // The coordinator attends nothing and teaches nothing, so there is no next
    // class to find and no reason to move them off today.
    const day = await callerFor(coordinator).timetable.mySchedule({});
    expect(day.from).toEqual(startOfLocalDay(new Date(), TZ));
  });

  it("ignores a cancelled class when working out the next one", async () => {
    const soon = new Date(Date.now() + 2 * HOUR);
    const { start, end } = await classAt(soon);
    await db.eventOccurrence.updateMany({
      where: { orgId, start, end },
      data: { status: "CANCELLED" },
    });
    const later = new Date(Date.now() + 4 * 24 * HOUR);
    await classAt(later);

    const day = await callerFor(learner).timetable.mySchedule({});
    expect(day.from).toEqual(startOfLocalDay(later, TZ));
  });

  it("still shows exactly the day it is given", async () => {
    await classAt(new Date(Date.now() + 3 * 24 * HOUR));

    // An explicit date is the day-stepper, and it must never be second-guessed.
    const day = await callerFor(learner).timetable.mySchedule({ date: DAY });
    expect(day.from).toEqual(startOfLocalDay(DAY, TZ));
    expect(day.occurrences.map((o) => o.title)).toEqual(["Scheduling, Applied"]);
  });
});
