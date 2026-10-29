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
        // A cookie session is always a person; the fixture says so explicitly
        // so that a machine identity can never sneak in through a caller.
        isServiceAccount: false,
        viaApiKey: false,
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
  await db.orgSettings.upsert({
    where: { orgId },
    update: {},
    create: { orgId },
  });

  await db.scheduleFavourite.deleteMany({ where: { orgId } });
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

  coordinator = await makeActor(
    "sched-coordinator@plannr-demo.invalid",
    "The Coordinator",
    ["coordinator"],
  );
  lecturer = await makeActor(
    "sched-lecturer@plannr-demo.invalid",
    "The Lecturer",
    ["faculty"],
  );
  learner = await makeActor(
    "sched-learner@plannr-demo.invalid",
    "The Learner",
    ["student"],
  );

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

/**
 * Which blocks on the campus grid are the viewer's own.
 *
 * The timetable shows every room in the building, and the gold a class is drawn
 * in is the only thing that separates the viewer's day from everybody else's —
 * so the flag behind it is worth pinning down, particularly at the two ends
 * where nobody owns anything: a coordinator with no profile, and a room booking
 * with no cohort and no lecturer. Both of those are all-nulls, and a rule
 * written carelessly makes null match null and paints the whole day gold.
 */
describe("whose class is whose on the grid", () => {
  it("marks a student's own class, and leaves the rest of the campus alone", async () => {
    const other = await db.group.create({
      data: {
        orgId,
        programmeId: (await db.programme.findFirstOrThrow({ where: { orgId } }))
          .id,
        name: "SCH-B",
      },
    });
    const event = await db.event.create({
      data: {
        orgId,
        roomId,
        groupId: other.id,
        title: "Somebody Else's Lecture",
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
        groupId: other.id,
        kind: "CLASS",
        status: "CONFIRMED",
      },
    });

    const grid = await callerFor(learner).timetable.grid({ date: DAY });
    expect(
      Object.fromEntries(grid.occurrences.map((o) => [o.title, o.isMine])),
    ).toEqual({
      "Scheduling, Applied": true,
      "Somebody Else's Lecture": false,
    });
  });

  it("marks the class a lecturer takes as theirs too", async () => {
    const grid = await callerFor(lecturer).timetable.grid({ date: DAY });
    expect(grid.occurrences.map((o) => o.isMine)).toEqual([true]);
  });

  it("leaves a sitting in an archived room out of the grid", async () => {
    // The grid draws a column for every active room and nothing else, so a
    // sitting in a room taken out of service would be counted with nowhere to
    // be drawn.
    await db.room.update({ where: { id: roomId }, data: { isActive: false } });
    const grid = await callerFor(coordinator).timetable.grid({ date: DAY });
    expect(grid.rooms).toEqual([]);
    expect(grid.occurrences).toEqual([]);
  });

  it("gives a coordinator with neither profile nothing of their own", async () => {
    const grid = await callerFor(coordinator).timetable.grid({ date: DAY });
    expect(grid.occurrences).toHaveLength(1);
    expect(grid.occurrences.every((o) => o.isMine)).toBe(false);
  });

  it("does not hand a room booking to whoever has no cohort either", async () => {
    // No group and no lecturer on the booking, and the coordinator has neither
    // — the case where "unset matches unset" would claim it for them.
    const event = await db.event.create({
      data: {
        orgId,
        roomId,
        title: "Staff Meeting",
        kind: "BOOKING",
        status: "CONFIRMED",
        startTime: new Date(DAY.getTime() + 2 * 3_600_000),
        endTime: new Date(DAY.getTime() + 3 * 3_600_000),
        timezone: TZ,
      },
    });
    await db.eventOccurrence.create({
      data: {
        orgId,
        eventId: event.id,
        start: new Date(DAY.getTime() + 2 * 3_600_000),
        end: new Date(DAY.getTime() + 3 * 3_600_000),
        roomId,
        kind: "BOOKING",
        status: "CONFIRMED",
      },
    });

    for (const actor of [coordinator, learner, lecturer]) {
      const grid = await callerFor(actor).timetable.grid({ date: DAY });
      expect(
        grid.occurrences.find((o) => o.title === "Staff Meeting")?.isMine,
      ).toBe(false);
    }
  });
});

describe("a schedule of one's own", () => {
  it("gives a student the class they attend, and says who takes it", async () => {
    const day = await callerFor(learner).timetable.mySchedule({ date: DAY });
    expect(day.viewAs).toBe("student");
    expect(day.occurrences.map((o) => o.title)).toEqual([
      "Scheduling, Applied",
    ]);
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
    const day = await callerFor(coordinator).timetable.mySchedule({
      date: DAY,
    });
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
    expect(day.viewingAs).toMatchObject({
      name: "The Lecturer",
      isFaculty: true,
    });
    expect(day.occurrences.map((o) => o.title)).toEqual([
      "Scheduling, Applied",
    ]);
    // Described by what they are — a lecturer is told who is in the room.
    expect(day.detail).toMatchObject({ cohort: true, teaching: false });
  });

  it("keeps the viewer's own angles on offer, so they can get back", async () => {
    const day = await callerFor(coordinator).timetable.mySchedule({
      date: DAY,
      asUserId: learner.id,
    });
    expect(day.views).toEqual(["coordinator"]);
    expect(day.viewingAs).toMatchObject({
      name: "The Learner",
      isStudent: true,
    });
    expect(day.detail).toMatchObject({ teaching: true, cohort: false });
  });

  it("lets a lecturer look up a student's day without the right to know who people are", async () => {
    const day = await callerFor(lecturer).timetable.mySchedule({
      date: DAY,
      asUserId: learner.id,
    });
    expect(day.viewingAs).toMatchObject({
      name: "The Learner",
      isStudent: true,
    });
  });

  it("lets a student look up where a lecturer is, which is the point of it", async () => {
    const day = await callerFor(learner).timetable.mySchedule({
      date: DAY,
      asUserId: lecturer.id,
    });
    expect(day.viewingAs).toMatchObject({
      name: "The Lecturer",
      isFaculty: true,
    });
  });

  /**
   * Whose day may be read is now open; what the reader may *do* with it is not.
   * The day is described by what its owner is — a lecturer's is a teaching day,
   * cohorts and all — while editing stays with the viewer's own permissions, so
   * opening the first door did not quietly open the second.
   */
  it("describes the subject's day but keeps the viewer's own powers", async () => {
    const day = await callerFor(learner).timetable.mySchedule({
      date: DAY,
      asUserId: lecturer.id,
    });
    // The learner is offered no angle but their own to come back to.
    expect(day.views).toEqual(["student"]);
    expect(day.detail).toMatchObject({ scope: "teaching", modify: false });
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
      callerFor(coordinator).timetable.mySchedule({
        date: DAY,
        asUserId: outsider.id,
      }),
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
    const people = await callerFor(coordinator).timetable.peopleWithSchedules(
      {},
    );
    const emails = people.rows.map((p) => p.email);
    expect(emails).toContain("sched-lecturer@plannr-demo.invalid");
    expect(emails).toContain("sched-learner@plannr-demo.invalid");
    // The coordinator has neither profile, so has no schedule to look at.
    expect(emails).not.toContain("sched-coordinator@plannr-demo.invalid");
  });

  it("says which of the two each one is", async () => {
    const people = await callerFor(coordinator).timetable.peopleWithSchedules(
      {},
    );
    expect(people.rows.find((p) => p.name === "The Lecturer")?.kind).toBe(
      "faculty",
    );
    expect(people.rows.find((p) => p.name === "The Learner")).toMatchObject({
      kind: "student",
      detail: "99930199001",
    });
  });

  it("searches by name, address and PRN", async () => {
    const caller = callerFor(coordinator);
    expect(
      (
        await caller.timetable.peopleWithSchedules({ query: "Lectur" })
      ).rows.map((p) => p.name),
    ).toEqual(["The Lecturer"]);
    expect(
      (
        await caller.timetable.peopleWithSchedules({ query: "99930199001" })
      ).rows.map((p) => p.name),
    ).toEqual(["The Learner"]);
    expect(
      (
        await caller.timetable.peopleWithSchedules({ query: "sched-learner@" })
      ).rows.map((p) => p.name),
    ).toEqual(["The Learner"]);
  });

  it("is closed to a lecturer and to a student", async () => {
    await expect(
      callerFor(lecturer).timetable.peopleWithSchedules({}),
    ).rejects.toThrow(/permission/i);
    await expect(
      callerFor(learner).timetable.peopleWithSchedules({}),
    ).rejects.toThrow(/permission/i);
  });

  /**
   * An API key acts as its own hidden `User` row, so a bot can look exactly
   * like a colleague here. The principal is deliberately given a faculty
   * profile so that what excludes it is `isServiceAccount` and not the "has a
   * day of their own" clause that would have hidden it by accident.
   */
  it("never offers an API key's machine identity", async () => {
    const principal = await db.user.upsert({
      where: { email: "sched-key@plannr-service.invalid" },
      update: { name: "Timetable Sync", isServiceAccount: true },
      create: {
        orgId,
        email: "sched-key@plannr-service.invalid",
        name: "Timetable Sync",
        isServiceAccount: true,
      },
    });
    await db.facultyProfile.upsert({
      where: { userId: principal.id },
      update: { shortName: "Sync" },
      create: { userId: principal.id, orgId, shortName: "Sync" },
    });

    const caller = callerFor(coordinator);
    expect(
      (await caller.timetable.peopleWithSchedules({})).rows.map((p) => p.id),
    ).not.toContain(principal.id);
    // `total` as well as `rows`: a count that still said one would mean the
    // principal had merely fallen off the end of a page.
    expect(
      await caller.timetable.peopleWithSchedules({ query: "Timetable Sync" }),
    ).toMatchObject({ rows: [], total: 0 });

    // The picker every signed-in person sees is filtered the same way.
    expect(
      (
        await callerFor(learner).timetable.searchPeople({ query: "Sync" })
      ).rows.map((p) => p.id),
    ).not.toContain(principal.id);

    // And its day cannot be summoned by id, so no screen can name it either.
    await expect(
      caller.timetable.mySchedule({ date: DAY, asUserId: principal.id }),
    ).rejects.toThrow(/No such person/i);
  });

  it("finds a PRN whatever case it is typed in", async () => {
    const lettered = await makeActor(
      "sched-lettered@plannr-demo.invalid",
      "The Lettered",
      ["student"],
    );
    await db.studentProfile.upsert({
      where: { userId: lettered.id },
      update: { prn: "SIC23B001" },
      create: { userId: lettered.id, orgId, prn: "SIC23B001" },
    });

    const found = await callerFor(learner).timetable.searchPeople({
      query: "sic23",
    });
    expect(found.rows.map((p) => p.id)).toEqual([lettered.id]);
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
    expect(day.occurrences.map((o) => o.title)).toEqual([
      "Scheduling, Applied",
    ]);
  });
});

/**
 * How much of the calendar one answer carries.
 *
 * The window arithmetic itself is unit-tested in `src/lib/schedule-spans.test.ts`;
 * what is worth proving against a real database is that the span reaches the
 * query — that a week genuinely returns the days either side of the anchor, and
 * that widening it did not quietly change what a day means for every caller
 * that never asks for one.
 */
describe("a schedule over a week and a month", () => {
  const HOUR = 3_600_000;

  /** A class for the learner, `days` from the fixture's Wednesday, at 10am. */
  async function classOn(days: number, title: string) {
    const start = new Date(DAY.getTime() + days * 24 * HOUR);
    const end = new Date(start.getTime() + HOUR);
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
        title,
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
  }

  it("answers a day exactly as it always did", async () => {
    // The default, and the guard on every caller that never passes a span:
    // `from`/`to` keep their names and, for a day, their old values to the
    // millisecond.
    const day = await callerFor(learner).timetable.mySchedule({ date: DAY });
    expect(day.span).toBe("day");
    expect(day.from).toEqual(startOfLocalDay(DAY, TZ));
    expect(day.to.getTime() - day.from.getTime()).toBe(24 * HOUR);
    expect(day.anchor).toEqual(day.from);
    expect(day.truncated).toBe(false);
  });

  it("reaches either side of the anchor for a week", async () => {
    // Monday and Sunday of the fixture's week — the two ends a day view cannot
    // see and a week must.
    await classOn(-2, "Monday");
    await classOn(4, "Sunday");

    const week = await callerFor(learner).timetable.mySchedule({
      date: DAY,
      span: "week",
    });
    expect(week.span).toBe("week");
    // The anchor stays the day asked about; the window is the week around it.
    expect(week.anchor).toEqual(startOfLocalDay(DAY, TZ));
    expect(week.to.getTime() - week.from.getTime()).toBe(7 * 24 * HOUR);
    expect(week.occurrences.map((o) => o.title)).toEqual([
      "Monday",
      "Scheduling, Applied",
      "Sunday",
    ]);
  });

  it("takes in the neighbouring months' lead-in days for a month", async () => {
    // 1 August 2026 is a Saturday, so the grid opens on Monday 27 July — and a
    // class on the 29th belongs to a cell the grid draws. A window that began
    // on the 1st would leave it off and the grid would say so in confidence.
    await classOn(-14, "Late July");

    const month = await callerFor(learner).timetable.mySchedule({
      date: DAY,
      span: "month",
    });
    expect(month.span).toBe("month");
    const days = (month.to.getTime() - month.from.getTime()) / (24 * HOUR);
    expect(days % 7).toBe(0);
    expect(days).toBeLessThanOrEqual(42);
    expect(month.occurrences.map((o) => o.title)).toContain("Late July");
  });

  it("keeps the perspective and the register flag across every span", async () => {
    // The two things a wider window must not quietly drop: whose eyes it is
    // seen through, and whether a register has been taken — the latter being a
    // correlated count on the same query rather than a second round trip.
    for (const span of ["day", "week", "month"] as const) {
      const answer = await callerFor(lecturer).timetable.mySchedule({
        date: DAY,
        span,
      });
      expect(answer.detail?.scope).toBe("teaching");
      expect(answer.views).toContain("faculty");
      expect(answer.occurrences[0]?.attendanceMarked).toBe(false);
    }
  });
});

/**
 * The schedules somebody keeps one tap away.
 *
 * The list is a convenience; the checks around it are not. A favourite is a
 * shortcut into somebody else's day, so what is worth holding here is that it
 * can only ever be a handle on something the picker would have offered in the
 * first place — a real person with a timetable, or an angle this viewer is
 * actually entitled to take — and that it stops working the moment either of
 * those stops being true, rather than becoming a stale avatar that logs
 * somebody out of their own view when tapped.
 */
describe("view-as favourites", () => {
  it("keeps perspectives and people in one list, in the order they were starred", async () => {
    const caller = callerFor(coordinator);
    await caller.timetable.toggleFavourite({
      kind: "perspective",
      subject: "coordinator",
      on: true,
    });
    await caller.timetable.toggleFavourite({
      kind: "person",
      subject: lecturer.id,
      on: true,
    });

    const rows = await caller.timetable.favourites();
    expect(rows.map((r) => [r.kind, r.subject])).toEqual([
      ["perspective", "coordinator"],
      ["person", lecturer.id],
    ]);
    // Resolved for drawing, so the strip needs no second query for names.
    expect(rows[1]?.name).toBeTruthy();
  });

  it("is idempotent in both directions", async () => {
    const caller = callerFor(coordinator);
    const star = () =>
      caller.timetable.toggleFavourite({
        kind: "person",
        subject: lecturer.id,
        on: true,
      });

    await star();
    await star();
    expect(await caller.timetable.favourites()).toHaveLength(1);

    await caller.timetable.toggleFavourite({
      kind: "person",
      subject: lecturer.id,
      on: false,
    });
    await caller.timetable.toggleFavourite({
      kind: "person",
      subject: lecturer.id,
      on: false,
    });
    expect(await caller.timetable.favourites()).toEqual([]);
  });

  it("is one person's own list and nobody else's", async () => {
    await callerFor(coordinator).timetable.toggleFavourite({
      kind: "person",
      subject: lecturer.id,
      on: true,
    });
    expect(await callerFor(learner).timetable.favourites()).toEqual([]);
  });

  it("refuses a perspective the viewer may not take", async () => {
    // A student has no coordinator view, so a favourite pointing at one would
    // be an avatar that answers "forbidden" — or worse, quietly shows them
    // something.
    await expect(
      callerFor(learner).timetable.toggleFavourite({
        kind: "perspective",
        subject: "coordinator",
        on: true,
      }),
    ).rejects.toThrow(/not one of your own/i);
  });

  it("refuses somebody the picker would never have offered", async () => {
    await expect(
      callerFor(coordinator).timetable.toggleFavourite({
        kind: "person",
        subject: "not-a-real-id",
        on: true,
      }),
    ).rejects.toThrow(/no such person/i);
  });

  it("keeps somebody who has not signed in yet", async () => {
    /*
     * The regression this whole procedure got wrong once. `isActive` is false
     * on every imported record until that person first arrives through Google
     * and is linked to it — `import-sicsr.ts` says so where it sets the flag —
     * so on the live database a third of the college reads as inactive. It is
     * not a liveness test, and treating it as one meant the picker offered
     * somebody, the star wrote a row, and this read silently threw it away.
     *
     * What the read must honour is the population the *write* accepts, which is
     * the population the picker offers: somebody with a timetable who is not a
     * machine. Nothing else.
     */
    const caller = callerFor(coordinator);
    await caller.timetable.toggleFavourite({
      kind: "person",
      subject: lecturer.id,
      on: true,
    });
    await db.user.update({
      where: { id: lecturer.id },
      data: { isActive: false },
    });

    expect(await caller.timetable.favourites()).toHaveLength(1);

    await db.user.update({
      where: { id: lecturer.id },
      data: { isActive: true },
    });
  });

  it("drops a perspective the viewer may no longer take", async () => {
    // Filtering here rather than on the screen means there is one answer to
    // "may I look through those eyes" — the same `perspectivesFor` the chooser
    // itself runs — instead of two that can disagree.
    const caller = callerFor(coordinator);
    await caller.timetable.toggleFavourite({
      kind: "perspective",
      subject: "coordinator",
      on: true,
    });
    expect(await caller.timetable.favourites()).toHaveLength(1);

    // The coordinator angle comes from ManageAllEvents; without it, it is no
    // longer theirs to take.
    const stripped = callerFor({ ...coordinator, permissions: 0n });
    expect(await stripped.timetable.favourites()).toEqual([]);
  });
});
