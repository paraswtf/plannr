import { beforeEach, describe, expect, it } from "vitest";

import { SYSTEM_ROLES } from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";
import { regenerateOccurrences } from "~/server/services/occurrences";
import {
  EventKind,
  EventStatus,
  ExceptionType,
  RoomType,
} from "../../../../generated/prisma";

/**
 * Tests and presentations, against a real Postgres: who may set them, the
 * class sittings they are pinned to and how those pins follow the class, the
 * extra class a teacher schedules for a test and its approval, presentation
 * teams and slots, and what students see.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`).
 */

const TZ = "Asia/Kolkata";
const ORG = "assign-itest";
const MAIL = "@assign-itest.plannr-demo.invalid";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const createCaller = createCallerFactory(appRouter);

type Caller = ReturnType<typeof createCaller>;

let orgId: string;
let groupId: string;
let otherGroupId: string;
let courseId: string;
let roomA: string;
let roomB: string;
let eventId: string;
let otherEventId: string;
let sittings: Date[];
let teacher: Caller;
let otherTeacher: Caller;
let coordinator: Caller;
let student: Caller;
let outsider: Caller;
let studentUserId: string;
let studentIds: string[];
let outsiderStudentId: string;

async function person(
  local: string,
  role: "faculty" | "coordinator" | "student",
) {
  const roleRow = await db.role.findUniqueOrThrow({
    where: { orgId_key: { orgId, key: role } },
  });
  const user = await db.user.create({
    data: { orgId, email: `${local}${MAIL}`, name: local },
  });
  await db.userRole.create({ data: { userId: user.id, roleId: roleRow.id } });
  const caller = createCaller({
    db,
    headers: new Headers(),
    session: {
      expires: new Date(Date.now() + HOUR).toISOString(),
      user: {
        id: user.id,
        orgId,
        roles: [{ id: roleRow.id, name: roleRow.name, key: roleRow.key }],
        permissions: roleRow.permissions.toString(),
        isActive: true,
        isServiceAccount: false,
        viaApiKey: false,
      },
    },
  });
  return { user, caller };
}

/** Next week's slot at 10:00 in Kolkata, plus whole days and hours. */
function slot(days = 0, hours = 0) {
  const d = new Date(Date.now() + 7 * DAY + days * DAY);
  d.setUTCHours(4, 30, 0, 0);
  return new Date(d.getTime() + hours * HOUR);
}

const isoDay = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

async function weekly(group: string, facultyId: string | null, room: string) {
  const event = await db.event.create({
    data: {
      orgId,
      kind: EventKind.CLASS,
      status: EventStatus.CONFIRMED,
      title: "Data Structures",
      roomId: room,
      groupId: group,
      courseId,
      facultyId,
      startTime: slot(),
      endTime: slot(0, 1),
      timezone: TZ,
      rrule: "FREQ=WEEKLY;COUNT=4",
    },
  });
  await db.eventGroup.create({ data: { eventId: event.id, groupId: group } });
  await regenerateOccurrences(db, event.id);
  return event;
}

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: ORG },
    update: {},
    create: { slug: ORG, name: "Assignments Org", timezone: TZ },
  });
  orgId = org.id;

  await db.notification.deleteMany({ where: { orgId } });
  await db.assignment.deleteMany({ where: { orgId } });
  await db.attendanceSession.deleteMany({ where: { orgId } });
  await db.event.deleteMany({ where: { orgId } });
  await db.studentProfile.deleteMany({ where: { orgId } });
  await db.facultyProfile.deleteMany({ where: { orgId } });
  await db.user.deleteMany({ where: { email: { endsWith: MAIL } } });
  await db.groupCourse.deleteMany({ where: { group: { orgId } } });
  await db.course.deleteMany({ where: { orgId } });
  await db.group.deleteMany({ where: { orgId } });
  await db.semester.deleteMany({ where: { orgId } });
  await db.orgSettings.deleteMany({ where: { orgId } });

  for (const role of SYSTEM_ROLES) {
    await db.role.upsert({
      where: { orgId_key: { orgId, key: role.key } },
      update: { permissions: role.permissions },
      create: {
        orgId,
        key: role.key,
        name: role.name,
        permissions: role.permissions,
        isSystem: true,
      },
    });
  }
  // Changes need approval, as they do by default.
  await db.orgSettings.create({
    data: { orgId, requireApprovalChanges: true },
  });

  const building = await db.building.upsert({
    where: { orgId_name: { orgId, name: "Assign Block" } },
    update: {},
    create: { orgId, name: "Assign Block" },
  });
  const room = async (code: string) =>
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
  roomA = await room("AS-1");
  roomB = await room("AS-2");

  const programme = await db.programme.upsert({
    where: { orgId_code: { orgId, code: "AS" } },
    update: {},
    create: { orgId, code: "AS", name: "Assignments" },
  });
  const semester = await db.semester.create({
    data: {
      orgId,
      name: "Assign Term",
      startDate: new Date(Date.now() - 30 * DAY),
      endDate: new Date(Date.now() + 90 * DAY),
    },
  });
  groupId = (
    await db.group.create({
      data: {
        orgId,
        programmeId: programme.id,
        semesterId: semester.id,
        name: "AS-A",
      },
    })
  ).id;
  otherGroupId = (
    await db.group.create({
      data: {
        orgId,
        programmeId: programme.id,
        semesterId: semester.id,
        name: "AS-B",
      },
    })
  ).id;
  courseId = (
    await db.course.create({
      data: {
        orgId,
        semesterId: semester.id,
        programmeId: programme.id,
        title: "Data Structures",
      },
    })
  ).id;
  await db.groupCourse.createMany({
    data: [
      { groupId, courseId },
      { groupId: otherGroupId, courseId },
    ],
  });

  const t = await person("teacher", "faculty");
  const t2 = await person("other-teacher", "faculty");
  const k = await person("coordinator", "coordinator");
  teacher = t.caller;
  otherTeacher = t2.caller;
  coordinator = k.caller;
  const facultyId = (
    await db.facultyProfile.create({ data: { userId: t.user.id, orgId } })
  ).id;
  const otherFacultyId = (
    await db.facultyProfile.create({ data: { userId: t2.user.id, orgId } })
  ).id;

  studentIds = [];
  const enrol = async (local: string, group: string) => {
    const p = await person(local, "student");
    const profile = await db.studentProfile.create({
      data: { userId: p.user.id, orgId, prn: `${local}-prn` },
    });
    await db.studentGroupMembership.create({
      data: { studentId: profile.id, groupId: group },
    });
    return { ...p, profileId: profile.id };
  };
  const s1 = await enrol("student-1", groupId);
  const s2 = await enrol("student-2", groupId);
  const s3 = await enrol("student-3", otherGroupId);
  student = s1.caller;
  studentUserId = s1.user.id;
  outsider = s3.caller;
  studentIds = [s1.profileId, s2.profileId];
  outsiderStudentId = s3.profileId;

  const event = await weekly(groupId, facultyId, roomA);
  eventId = event.id;
  sittings = (
    await db.eventOccurrence.findMany({
      where: { eventId },
      orderBy: { start: "asc" },
    })
  ).map((o) => o.start);
  otherEventId = (await weekly(otherGroupId, otherFacultyId, roomB)).id;
});

const setTest = (caller: Caller, at = sittings[1]!) =>
  caller.assignments.create({
    type: "CLASS_TEST_OFFLINE",
    title: "Unit 2",
    groupId,
    courseId,
    sitting: { eventId, originalStart: at },
  });

describe("setting a test", () => {
  it("pins it to a class the teacher teaches and lists it soonest first", async () => {
    const later = await setTest(teacher, sittings[2]);
    const sooner = await setTest(teacher, sittings[1]);

    const page = await teacher.assignments.list({ when: "upcoming" });
    expect(page.rows.map((r) => r.id)).toEqual([sooner.id, later.id]);
    expect(page.rows[0]).toMatchObject({ role: "manager", state: "ok" });

    const detail = await teacher.assignments.byId({ id: sooner.id });
    expect(detail.sittings[0]).toMatchObject({
      state: "ok",
      roomCode: "AS-1",
      startsAt: sittings[1],
    });
  });

  it("puts it on the timetable of the class it is in", async () => {
    const { id } = await setTest(teacher);
    const rows = await teacher.timetable.week({
      from: sittings[0]!,
      to: new Date(sittings[3]!.getTime() + DAY),
      groupId,
    });
    const held = rows.find((r) => r.start.getTime() === sittings[1]!.getTime());
    expect(held?.assignments).toEqual([
      {
        id,
        type: "CLASS_TEST_OFFLINE",
        title: "Unit 2",
        teams: [],
        canOpen: true,
      },
    ]);
    expect(
      rows.filter((r) => r.assignments.length > 0).map((r) => r.start),
    ).toEqual([sittings[1]]);
  });

  it("refuses a teacher a group they do not teach, and lets a coordinator", async () => {
    await expect(
      teacher.assignments.create({
        type: "CLASS_TEST_OFFLINE",
        title: "Not mine",
        groupId: otherGroupId,
        courseId,
        sitting: { eventId: otherEventId, originalStart: sittings[1]! },
      }),
    ).rejects.toThrow(/group you teach/);

    const other = await db.eventOccurrence.findFirstOrThrow({
      where: { eventId: otherEventId },
      orderBy: { start: "asc" },
    });
    await expect(
      coordinator.assignments.create({
        type: "CLASS_TEST_OFFLINE",
        title: "Anybody's",
        groupId: otherGroupId,
        courseId,
        sitting: { eventId: otherEventId, originalStart: other.start },
      }),
    ).resolves.toMatchObject({ pending: false });
  });

  it("refuses another teacher's class for the same group", async () => {
    // The other teacher teaches neither this group nor this class.
    await expect(setTest(otherTeacher)).rejects.toThrow();
  });

  it("is seen by the group's students and not by anybody else's", async () => {
    const { id } = await setTest(teacher);
    const mine = await student.assignments.list({ when: "upcoming" });
    expect(mine.rows).toHaveLength(1);
    expect(mine.rows[0]).toMatchObject({
      id,
      role: "student",
      mine: "not started",
    });
    await expect(outsider.assignments.byId({ id })).rejects.toThrow();
    expect((await outsider.assignments.list({})).rows).toHaveLength(0);
  });

  it("tells the group's students", async () => {
    await setTest(teacher);
    const told = await db.notification.findMany({
      where: { userId: studentUserId, category: "ASSIGNMENTS" },
    });
    expect(told).toHaveLength(1);
    expect(told[0]!.title).toContain("Unit 2");
  });
});

describe("a pinned test follows its class", () => {
  it("moves when its sitting is moved", async () => {
    const { id } = await setTest(teacher);
    const pin = await db.assignmentSitting.findFirstOrThrow({
      where: { assignmentId: id },
    });
    await db.eventException.update({
      where: { id: pin.exceptionId! },
      data: {
        newStartTime: new Date(sittings[1]!.getTime() + HOUR),
        newEndTime: new Date(sittings[1]!.getTime() + 2 * HOUR),
      },
    });
    await regenerateOccurrences(db, eventId);

    const detail = await teacher.assignments.byId({ id });
    expect(detail.sittings[0]!.startsAt).toEqual(
      new Date(sittings[1]!.getTime() + HOUR),
    );
    expect(detail.startsAt).toEqual(new Date(sittings[1]!.getTime() + HOUR));
  });

  it("says when its sitting is called off, and comes back with it", async () => {
    const { id } = await setTest(teacher);
    await teacher.events.cancel({
      id: eventId,
      scope: "occurrence",
      originalStart: sittings[1]!,
    });
    expect((await teacher.assignments.byId({ id })).sittings[0]!.state).toBe(
      "cancelled",
    );

    await teacher.events.restoreOccurrence({
      id: eventId,
      originalStart: sittings[1]!,
    });
    const back = await teacher.assignments.byId({ id });
    expect(back.sittings[0]!.state).toBe("ok");
    expect(back.sittings[0]!.startsAt).toEqual(sittings[1]);
  });

  it("says it lost its class when the series is retimed away from it", async () => {
    const { id } = await setTest(teacher);
    const event = await db.event.findUniqueOrThrow({ where: { id: eventId } });
    await db.event.update({
      where: { id: eventId },
      data: {
        startTime: new Date(event.startTime.getTime() + HOUR),
        endTime: new Date(event.endTime.getTime() + HOUR),
      },
    });
    await regenerateOccurrences(db, eventId);
    expect((await teacher.assignments.byId({ id })).sittings[0]!.state).toBe(
      "lost",
    );

    // Nothing moves the test for anybody, so both sides are told.
    const told = await db.notification.findMany({
      where: { orgId, sourceKey: { startsWith: "assignment-lost:" } },
      include: { user: { select: { email: true } } },
    });
    expect(told.map((n) => n.user.email).sort()).toEqual(
      [`student-1${MAIL}`, `student-2${MAIL}`, `teacher${MAIL}`].sort(),
    );
    expect(
      told.find((n) => n.user.email === `teacher${MAIL}`)!.title,
    ).toContain("lost its class");
  });

  it("tells the students each time it moves, back to an earlier time too", async () => {
    const { id } = await setTest(teacher, sittings[1]);
    for (const at of [sittings[2]!, sittings[3]!, sittings[2]!]) {
      await teacher.assignments.setSitting({
        id,
        sitting: { eventId, originalStart: at },
      });
    }
    const moves = await db.notification.findMany({
      where: {
        userId: studentUserId,
        sourceKey: { startsWith: `assignment-moved:${id}:` },
      },
    });
    expect(moves).toHaveLength(3);
  });
});

describe("tests on the timetable, per viewer", () => {
  /** A weekly lecture group B is primary in, that group A attends as well. */
  async function combined() {
    const teacherFaculty = await db.facultyProfile.findFirstOrThrow({
      where: { user: { email: `teacher${MAIL}` } },
    });
    const event = await db.event.create({
      data: {
        orgId,
        kind: EventKind.CLASS,
        status: EventStatus.CONFIRMED,
        title: "Combined lecture",
        roomId: roomA,
        groupId: otherGroupId,
        courseId,
        facultyId: teacherFaculty.id,
        startTime: slot(3, 4),
        endTime: slot(3, 5),
        timezone: TZ,
        rrule: "FREQ=WEEKLY;COUNT=2",
      },
    });
    await db.eventGroup.createMany({
      data: [
        { eventId: event.id, groupId: otherGroupId },
        { eventId: event.id, groupId },
      ],
    });
    await regenerateOccurrences(db, event.id);
    return event;
  }

  it("names a test only to its own group and to whoever manages or teaches it", async () => {
    const lecture = await combined();
    const { id } = await teacher.assignments.create({
      type: "CLASS_TEST_OFFLINE",
      title: "Group A only",
      groupId,
      courseId,
      sitting: { eventId: lecture.id, originalStart: lecture.startTime },
    });
    const range = {
      from: new Date(lecture.startTime.getTime() - HOUR),
      to: new Date(lecture.startTime.getTime() + DAY),
      roomId: roomA,
    };
    const heldFor = async (caller: Caller) => {
      const rows = await caller.timetable.week(range);
      return rows.find((r) => r.eventId === lecture.id)!.assignments;
    };

    expect((await heldFor(teacher)).map((a) => a.id)).toEqual([id]);
    expect((await heldFor(coordinator)).map((a) => a.id)).toEqual([id]);
    expect((await heldFor(student)).map((a) => a.id)).toEqual([id]);
    // Group B attends the lecture, and is the group whose schedule shows it,
    // but the test is not theirs.
    expect(await heldFor(outsider)).toEqual([]);
    expect(await heldFor(otherTeacher)).toEqual([]);

    const theirs = await outsider.timetable.mySchedule({
      date: lecture.startTime,
    });
    const block = theirs.occurrences.find((o) => o.eventId === lecture.id);
    expect(block).toBeDefined();
    expect(block!.assignments).toEqual([]);

    // Looking at a student of the group's day does not open their tests to
    // somebody who could not open them.
    const asOther = await otherTeacher.timetable.mySchedule({
      date: sittings[1]!,
      asUserId: studentUserId,
    });
    expect(asOther.occurrences.flatMap((o) => o.assignments)).toEqual([]);
  });
});

describe("a class scheduled for a test", () => {
  const newClass = () => ({
    roomId: roomB,
    startTime: slot(2, 5),
    endTime: slot(2, 6),
  });

  it("waits for approval when changes need it, and is approvable", async () => {
    const made = await teacher.assignments.create({
      type: "CLASS_TEST_ONLINE",
      title: "Extra",
      groupId,
      courseId,
      sitting: { newClass: newClass() },
    });
    expect(made.pending).toBe(true);
    expect(
      (await teacher.assignments.byId({ id: made.id })).sittings[0]!.state,
    ).toBe("pending");

    const queue = await coordinator.events.approvalQueue();
    const item = queue.rows.find((i) => i.kind === "booking" && i.isClass);
    expect(item).toBeDefined();
    await coordinator.events.approve({ id: item!.id });
    expect(
      (await teacher.assignments.byId({ id: made.id })).sittings[0]!.state,
    ).toBe("ok");
  });

  it("goes straight on for a coordinator, and can be cancelled with the test", async () => {
    const made = await coordinator.assignments.create({
      type: "CLASS_TEST_OFFLINE",
      title: "Extra",
      groupId,
      courseId,
      sitting: { newClass: newClass() },
    });
    expect(made.pending).toBe(false);
    const pin = await db.assignmentSitting.findFirstOrThrow({
      where: { assignmentId: made.id },
      include: { exception: true },
    });
    await coordinator.assignments.remove({
      id: made.id,
      cancelScheduledClasses: true,
    });
    const event = await db.event.findUniqueOrThrow({
      where: { id: pin.exception!.eventId },
    });
    expect(event.status).toBe(EventStatus.CANCELLED);
  });

  it("is not on the students' day or announced until it is approved", async () => {
    const made = await teacher.assignments.create({
      type: "CLASS_TEST_OFFLINE",
      title: "Extra",
      groupId,
      courseId,
      sitting: { newClass: newClass() },
    });
    const pin = await db.assignmentSitting.findFirstOrThrow({
      where: { assignmentId: made.id },
      include: { exception: true },
    });
    const extraId = pin.exception!.eventId;
    const onStudentsDay = async () =>
      (
        await student.timetable.mySchedule({ date: newClass().startTime })
      ).occurrences.some((o) => o.eventId === extraId);
    const notices = () =>
      db.classChangeNotice.findMany({ where: { eventId: extraId } });

    expect(await onStudentsDay()).toBe(false);
    expect(await notices()).toEqual([]);
    // The teacher who asked for it sees it, marked as waiting.
    const theirs = await teacher.timetable.mySchedule({
      date: newClass().startTime,
    });
    expect(theirs.occurrences.find((o) => o.eventId === extraId)?.status).toBe(
      EventStatus.PENDING,
    );

    await coordinator.events.approve({ id: extraId });
    expect(await onStudentsDay()).toBe(true);
    expect((await notices()).map((n) => n.kind)).toEqual(["ADDED"]);
  });

  it("tells the students when it is refused, and announces nothing else", async () => {
    const made = await teacher.assignments.create({
      type: "CLASS_TEST_OFFLINE",
      title: "Extra",
      groupId,
      courseId,
      sitting: { newClass: newClass() },
    });
    const pin = await db.assignmentSitting.findFirstOrThrow({
      where: { assignmentId: made.id },
      include: { exception: true },
    });
    await coordinator.events.reject({ id: pin.exception!.eventId });

    const told = await db.notification.findMany({
      where: {
        userId: studentUserId,
        sourceKey: `assignment-refused:${pin.id}`,
      },
    });
    expect(told).toHaveLength(1);
    expect(told[0]!.title).toContain("no class yet");
    expect(
      await db.classChangeNotice.count({
        where: { eventId: pin.exception!.eventId },
      }),
    ).toBe(0);
  });

  it("is withdrawn with the test when it is still waiting, and the students are told", async () => {
    const made = await teacher.assignments.create({
      type: "CLASS_TEST_OFFLINE",
      title: "Extra",
      groupId,
      courseId,
      sitting: { newClass: newClass() },
    });
    const pin = await db.assignmentSitting.findFirstOrThrow({
      where: { assignmentId: made.id },
      include: { exception: true },
    });
    // The box to cancel classes is left unticked.
    const result = await teacher.assignments.remove({ id: made.id });
    expect(result.cancelledClasses).toBe(1);
    const event = await db.event.findUniqueOrThrow({
      where: { id: pin.exception!.eventId },
    });
    expect(event.status).toBe(EventStatus.CANCELLED);
    const queue = await coordinator.events.approvalQueue();
    expect(queue.rows.some((i) => i.id === event.id)).toBe(false);

    const told = await db.notification.findMany({
      where: {
        userId: studentUserId,
        sourceKey: `assignment-removed:${made.id}`,
      },
    });
    expect(told).toHaveLength(1);
    expect(told[0]!.url).toBe("/assignments");
  });

  it("is withdrawn when the test moves to another class before it is approved", async () => {
    const made = await teacher.assignments.create({
      type: "CLASS_TEST_OFFLINE",
      title: "Extra",
      groupId,
      courseId,
      sitting: { newClass: newClass() },
    });
    const pin = await db.assignmentSitting.findFirstOrThrow({
      where: { assignmentId: made.id },
      include: { exception: true },
    });
    await teacher.assignments.setSitting({
      id: made.id,
      sitting: { eventId, originalStart: sittings[1]! },
    });
    const event = await db.event.findUniqueOrThrow({
      where: { id: pin.exception!.eventId },
    });
    expect(event.status).toBe(EventStatus.CANCELLED);
  });

  it("takes its test with it when the class is moved", async () => {
    const made = await coordinator.assignments.create({
      type: "CLASS_TEST_OFFLINE",
      title: "Extra",
      groupId,
      courseId,
      sitting: { newClass: newClass() },
    });
    const pin = await db.assignmentSitting.findFirstOrThrow({
      where: { assignmentId: made.id },
      include: { exception: true },
    });
    const extraId = pin.exception!.eventId;
    const before = await db.eventOccurrence.findFirstOrThrow({
      where: { eventId: extraId },
    });

    // Dragged an hour later on the timetable: a one-off moves as a series.
    const later = { start: slot(2, 6), end: slot(2, 7) };
    await coordinator.events.update({
      id: extraId,
      scope: "series",
      patch: { startTime: later.start, endTime: later.end },
    });

    const detail = await coordinator.assignments.byId({ id: made.id });
    expect(detail.sittings[0]).toMatchObject({
      state: "ok",
      startsAt: later.start,
      endsAt: later.end,
      originalStart: later.start,
    });
    expect(detail.startsAt).toEqual(later.start);
    // The same sitting row, so a register taken on it would have stayed.
    const after = await db.eventOccurrence.findFirstOrThrow({
      where: { eventId: extraId },
    });
    expect(after.id).toBe(before.id);
    expect(after.exceptionId).toBe(pin.exceptionId);
    expect(
      await db.notification.count({
        where: { orgId, sourceKey: { startsWith: "assignment-lost:" } },
      }),
    ).toBe(0);
  });

  it("follows its class when the teacher moves it before it is approved", async () => {
    const made = await teacher.assignments.create({
      type: "CLASS_TEST_OFFLINE",
      title: "Extra",
      groupId,
      courseId,
      sitting: { newClass: newClass() },
    });
    const pin = await db.assignmentSitting.findFirstOrThrow({
      where: { assignmentId: made.id },
      include: { exception: true },
    });
    const later = { start: slot(2, 7), end: slot(2, 8) };
    const result = await teacher.events.update({
      id: pin.exception!.eventId,
      scope: "series",
      patch: { startTime: later.start, endTime: later.end },
    });
    expect(result.applied).toBe(true);
    expect(
      (await teacher.assignments.byId({ id: made.id })).sittings[0],
    ).toMatchObject({ state: "pending", startsAt: later.start });
  });
});

describe("deleting a group", () => {
  it("is refused while tests are set for it, saying what to do", async () => {
    await setTest(teacher);
    await expect(
      coordinator.groups.delete({ id: groupId, confirmCascade: true }),
    ).rejects.toThrow(/Delete it on the Assignments tab first/);
    expect(await db.group.count({ where: { id: groupId } })).toBe(1);
    const impact = await coordinator.groups.deleteImpact({ id: groupId });
    expect(impact.assignmentCount).toBe(1);
  });

  it("asks first when the group only joins combined lectures", async () => {
    const lonely = await db.group.create({
      data: {
        orgId,
        programmeId: (
          await db.group.findUniqueOrThrow({ where: { id: groupId } })
        ).programmeId,
        name: "AS-C",
      },
    });
    await db.eventGroup.create({ data: { eventId, groupId: lonely.id } });
    await expect(coordinator.groups.delete({ id: lonely.id })).rejects.toThrow(
      /1 combined lecture with other groups, which stays on/,
    );
    await coordinator.groups.delete({ id: lonely.id, confirmCascade: true });
    expect(await db.event.count({ where: { id: eventId } })).toBe(1);
  });
});

describe("the past", () => {
  it("lists what has ended, the most recent first", async () => {
    const past = await db.event.create({
      data: {
        orgId,
        kind: EventKind.CLASS,
        status: EventStatus.CONFIRMED,
        title: "Data Structures",
        roomId: roomA,
        groupId,
        courseId,
        facultyId: (
          await db.facultyProfile.findFirstOrThrow({
            where: { user: { email: `teacher${MAIL}` } },
          })
        ).id,
        startTime: new Date(Date.now() - 2 * DAY),
        endTime: new Date(Date.now() - 2 * DAY + HOUR),
        timezone: TZ,
      },
    });
    await regenerateOccurrences(db, past.id);
    const old = await teacher.assignments.create({
      type: "CLASS_TEST_OFFLINE",
      title: "Old",
      groupId,
      courseId,
      sitting: { eventId: past.id, originalStart: past.startTime },
    });
    await setTest(teacher);

    const page = await teacher.assignments.list({ when: "past" });
    expect(page.rows.map((r) => r.id)).toEqual([old.id]);
  });
});

describe("a presentation", () => {
  const window = () => ({ start: isoDay(slot(-1)), end: isoDay(slot(14)) });

  it("needs its days, and forms teams only from its group, one team each", async () => {
    await expect(
      teacher.assignments.create({
        type: "PRESENTATION",
        title: "Projects",
        groupId,
        courseId,
      }),
    ).rejects.toThrow(/days/);

    const { id } = await teacher.assignments.create({
      type: "PRESENTATION",
      title: "Projects",
      groupId,
      courseId,
      window: window(),
    });
    await expect(
      teacher.assignments.saveTeams({
        id,
        teams: [{ name: "A", studentIds: [outsiderStudentId] }],
      }),
    ).rejects.toThrow(/not in this group/);
    await expect(
      teacher.assignments.saveTeams({
        id,
        teams: [
          { name: "A", studentIds: [studentIds[0]!] },
          { name: "B", studentIds: [studentIds[0]!] },
        ],
      }),
    ).rejects.toThrow(/two teams/);

    const saved = await teacher.assignments.saveTeams({
      id,
      teams: [
        { name: "A", studentIds: [studentIds[0]!] },
        { name: "B", studentIds: [studentIds[1]!] },
      ],
    });
    expect(saved.teams.map((t) => t.name)).toEqual(["A", "B"]);
  });

  it("books slots inside its days, in order within a shared class", async () => {
    const { id } = await teacher.assignments.create({
      type: "PRESENTATION",
      title: "Projects",
      groupId,
      courseId,
      window: { start: isoDay(slot(-1)), end: isoDay(slot(1)) },
    });
    const { teams } = await teacher.assignments.saveTeams({
      id,
      teams: [
        { name: "A", studentIds: [studentIds[0]!] },
        { name: "B", studentIds: [studentIds[1]!] },
      ],
    });
    const [a, b] = teams;
    await teacher.assignments.setSlot({
      id,
      teamId: a!.id,
      sitting: { eventId, originalStart: sittings[0]! },
    });
    await teacher.assignments.setSlot({
      id,
      teamId: b!.id,
      sitting: { eventId, originalStart: sittings[0]! },
    });
    // A week later is outside the window.
    await expect(
      teacher.assignments.setSlot({
        id,
        teamId: b!.id,
        sitting: { eventId, originalStart: sittings[1]! },
      }),
    ).rejects.toThrow(/outside/);

    const detail = await teacher.assignments.byId({ id });
    const order = () =>
      detail.sittings
        .slice()
        .sort((x, y) => x.position - y.position)
        .map((s) => s.teamId);
    expect(order()).toEqual([a!.id, b!.id]);

    const pin = await db.assignmentSitting.findFirstOrThrow({
      where: { assignmentId: id, teamId: a!.id },
    });
    await teacher.assignments.reorderSlots({
      id,
      exceptionId: pin.exceptionId!,
      teamIds: [b!.id, a!.id],
    });
    const after = await teacher.assignments.byId({ id });
    expect(
      after.sittings
        .slice()
        .sort((x, y) => x.position - y.position)
        .map((s) => s.teamId),
    ).toEqual([b!.id, a!.id]);

    // The class carries both teams on the timetable, in their order.
    const rows = await teacher.timetable.week({
      from: sittings[0]!,
      to: new Date(sittings[0]!.getTime() + DAY),
      groupId,
    });
    expect(rows[0]!.assignments[0]!.teams).toEqual(["B", "A"]);
  });

  it("stays upcoming for its whole window once the first slot is over", async () => {
    const { id } = await teacher.assignments.create({
      type: "PRESENTATION",
      title: "Projects",
      groupId,
      courseId,
      window: window(),
    });
    const { teams } = await teacher.assignments.saveTeams({
      id,
      teams: [{ name: "A", studentIds: [studentIds[0]!] }],
    });
    await teacher.assignments.setSlot({
      id,
      teamId: teams[0]!.id,
      sitting: { eventId, originalStart: sittings[0]! },
    });
    const detail = await teacher.assignments.byId({ id });
    // From the window's first midnight to the midnight after its last day,
    // not just the one slot booked so far.
    expect(detail.startsAt!.getTime()).toBeLessThan(sittings[0]!.getTime());
    expect(detail.endsAt!.getTime()).toBeGreaterThan(slot(14).getTime());
  });

  it("refuses new days that would leave a booked slot outside them", async () => {
    const { id } = await teacher.assignments.create({
      type: "PRESENTATION",
      title: "Projects",
      groupId,
      courseId,
      window: window(),
    });
    const { teams } = await teacher.assignments.saveTeams({
      id,
      teams: [
        { name: "A", studentIds: [studentIds[0]!] },
        { name: "B", studentIds: [studentIds[1]!] },
      ],
    });
    await teacher.assignments.setSlot({
      id,
      teamId: teams[1]!.id,
      sitting: { eventId, originalStart: sittings[1]! },
    });
    await expect(
      teacher.assignments.update({
        id,
        window: { start: isoDay(slot(-1)), end: isoDay(slot(1)) },
      }),
    ).rejects.toThrow(/^B is booked outside those days/);
    // Days that still hold it are fine.
    await expect(
      teacher.assignments.update({
        id,
        window: { start: isoDay(slot(-1)), end: isoDay(slot(8)) },
      }),
    ).resolves.toEqual({ ok: true });
  });
});

describe("pinning", () => {
  it("refuses a sitting that is called off", async () => {
    await db.eventException.create({
      data: {
        eventId,
        originalStart: sittings[3]!,
        type: ExceptionType.CANCELLED,
      },
    });
    await regenerateOccurrences(db, eventId);
    await expect(setTest(teacher, sittings[3])).rejects.toThrow(/called off/);
  });
});
