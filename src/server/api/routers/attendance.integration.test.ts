import { beforeEach, describe, expect, it } from "vitest";

import { SYSTEM_ROLES } from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";

/**
 * What a student's attendance figure actually means.
 *
 * Three numbers are reported and they are not interchangeable: *scheduled* is
 * every sitting of the semester, *conducted* is the registers that were really
 * taken, and the percentage is attended over conducted. The distinction is the
 * whole point — a teacher who forgets to mark a lecture must not thereby mark
 * everyone absent, and a student must still be able to see how much of the
 * course is left. These tests hold that apart.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`).
 */

const TZ = "Asia/Kolkata";
const ORG = "att-itest";
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
        // The session carries permissions as a string; the context is what turns
        // them back into bits.
        permissions: actor.permissions.toString(),
        isActive: true,
        // A cookie session is always a person; the fixture says so explicitly
        // so that a machine identity can never sneak in through a caller.
        isServiceAccount: false,
      },
    },
  });
}

let orgId: string;
let student: Actor;
let studentId: string;
let courseId: string;
let occurrenceIds: string[] = [];

/** A lecture of `courseId` at the given hour, with its single sitting. */
async function lectureAt(
  day: number,
  hour: number,
  groupId: string,
  facultyId: string,
) {
  const start = new Date(Date.UTC(2026, 6, day, hour - 5, 30));
  const end = new Date(Date.UTC(2026, 6, day, hour - 4, 30));
  const event = await db.event.create({
    data: {
      orgId,
      kind: "CLASS",
      status: "CONFIRMED",
      title: "Deep Learning",
      courseId,
      groupId,
      facultyId,
      roomId: (await db.room.findFirstOrThrow({ where: { orgId } })).id,
      startTime: start,
      endTime: end,
      timezone: TZ,
    },
  });
  const occurrence = await db.eventOccurrence.create({
    data: {
      orgId,
      eventId: event.id,
      start,
      end,
      roomId: event.roomId,
      groupId,
      facultyId,
      kind: "CLASS",
      status: "CONFIRMED",
    },
  });
  return occurrence.id;
}

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: ORG },
    update: {},
    create: { slug: ORG, name: "Attendance itest", timezone: TZ },
  });
  orgId = org.id;

  await db.attendanceRecord.deleteMany({ where: { session: { orgId } } });
  await db.attendanceSession.deleteMany({ where: { orgId } });
  await db.eventOccurrence.deleteMany({ where: { orgId } });
  await db.event.deleteMany({ where: { orgId } });
  await db.groupCourse.deleteMany({ where: { course: { orgId } } });
  await db.courseFaculty.deleteMany({ where: { course: { orgId } } });
  await db.course.deleteMany({ where: { orgId } });
  await db.studentGroupMembership.deleteMany({ where: { group: { orgId } } });
  await db.group.deleteMany({ where: { orgId } });

  for (const role of SYSTEM_ROLES) {
    await db.role.upsert({
      where: { orgId_key: { orgId, key: role.key } },
      update: {},
      create: {
        orgId,
        key: role.key,
        name: role.name,
        permissions: role.permissions,
        isSystem: true,
      },
    });
  }
  const studentRole = await db.role.findUniqueOrThrow({
    where: { orgId_key: { orgId, key: "student" } },
  });

  const building = await db.building.upsert({
    where: { id: `${orgId}-b` },
    update: {},
    create: { id: `${orgId}-b`, orgId, name: "Main" },
  });
  await db.room.upsert({
    where: { id: `${orgId}-r` },
    update: {},
    create: {
      id: `${orgId}-r`,
      orgId,
      buildingId: building.id,
      code: "A1",
      floor: 0,
      capacity: 60,
      type: "LECTURE",
    },
  });

  const semester = await db.semester.upsert({
    where: { orgId_name: { orgId, name: "Autumn 2026" } },
    update: {},
    create: {
      orgId,
      name: "Autumn 2026",
      startDate: new Date("2026-07-01"),
      endDate: new Date("2026-11-30"),
    },
  });
  const programme = await db.programme.upsert({
    where: { orgId_code: { orgId, code: "BCA" } },
    update: {},
    create: { orgId, code: "BCA", name: "Computer Applications" },
  });
  const group = await db.group.create({
    data: {
      orgId,
      programmeId: programme.id,
      semesterId: semester.id,
      name: "Div A",
    },
  });
  const course = await db.course.create({
    data: {
      orgId,
      semesterId: semester.id,
      programmeId: programme.id,
      title: "Deep Learning",
    },
  });
  courseId = course.id;
  await db.groupCourse.create({ data: { groupId: group.id, courseId } });

  const teacherUser = await db.user.upsert({
    where: { email: "att-teacher@plannr-demo.invalid" },
    update: {},
    create: {
      orgId,
      email: "att-teacher@plannr-demo.invalid",
      name: "Teacher",
    },
  });
  const teacher = await db.facultyProfile.upsert({
    where: { userId: teacherUser.id },
    update: {},
    create: { userId: teacherUser.id, orgId },
  });

  const studentUser = await db.user.upsert({
    where: { email: "att-student@plannr-demo.invalid" },
    update: {},
    create: {
      orgId,
      email: "att-student@plannr-demo.invalid",
      name: "Student",
    },
  });
  await db.userRole.upsert({
    where: {
      userId_roleId: { userId: studentUser.id, roleId: studentRole.id },
    },
    update: {},
    create: { userId: studentUser.id, roleId: studentRole.id },
  });
  const profile = await db.studentProfile.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: { userId: studentUser.id, orgId, prn: "99999999999" },
  });
  studentId = profile.id;
  await db.studentGroupMembership.create({
    data: { studentId: profile.id, groupId: group.id },
  });

  student = {
    id: studentUser.id,
    orgId,
    roles: [
      { id: studentRole.id, name: studentRole.name, key: studentRole.key },
    ],
    permissions: 0n,
  };

  // Four sittings of the one course.
  occurrenceIds = [];
  for (const day of [6, 7, 8, 9]) {
    occurrenceIds.push(await lectureAt(day, 9, group.id, teacher.id));
  }
});

/** Marks one sitting with a status for our student. */
async function mark(
  index: number,
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED",
) {
  const occurrence = await db.eventOccurrence.findUniqueOrThrow({
    where: { id: occurrenceIds[index]! },
  });
  const session = await db.attendanceSession.upsert({
    where: {
      occurrenceId_groupId: {
        occurrenceId: occurrence.id,
        groupId: occurrence.groupId!,
      },
    },
    update: {},
    create: {
      orgId,
      occurrenceId: occurrence.id,
      groupId: occurrence.groupId!,
    },
  });
  await db.attendanceRecord.upsert({
    where: { sessionId_studentId: { sessionId: session.id, studentId } },
    update: { status },
    create: { sessionId: session.id, studentId, status },
  });
}

describe("what a student's attendance says", () => {
  it("counts only the registers that were taken, and shows the rest as scheduled", async () => {
    await mark(0, "PRESENT");
    await mark(1, "ABSENT");

    const [course] = (await callerFor(student).attendance.mine()).courses;
    expect(course).toMatchObject({
      title: "Deep Learning",
      attended: 1,
      conducted: 2,
      scheduled: 4,
      percentage: 50,
    });
  });

  it("has no percentage at all before anybody takes a register", async () => {
    const [course] = (await callerFor(student).attendance.mine()).courses;
    // Nothing marked: 0 of 0 is not 0%, it is not yet a question.
    expect(course).toMatchObject({
      attended: 0,
      conducted: 0,
      scheduled: 4,
      percentage: null,
    });
  });

  it("treats arriving late as having been there", async () => {
    await mark(0, "LATE");
    const [course] = (await callerFor(student).attendance.mine()).courses;
    expect(course).toMatchObject({
      attended: 1,
      conducted: 1,
      percentage: 100,
    });
  });

  it("lets an excused absence count on neither side", async () => {
    await mark(0, "PRESENT");
    await mark(1, "EXCUSED");
    const [course] = (await callerFor(student).attendance.mine()).courses;
    // Being away with permission neither flatters the percentage nor damages it.
    expect(course).toMatchObject({
      attended: 1,
      conducted: 1,
      percentage: 100,
      scheduled: 4,
    });
  });

  it("lists every sitting, marked or not, so the student can check the record", async () => {
    await mark(0, "ABSENT");
    const [course] = (await callerFor(student).attendance.mine()).courses;
    expect(course!.register).toHaveLength(4);
    expect(course!.register.filter((r) => r.status === null)).toHaveLength(3);
    expect(course!.register.some((r) => r.status === "ABSENT")).toBe(true);
  });

  it("says how many of the remaining sittings would get them back to 75%", async () => {
    await mark(0, "ABSENT");
    await mark(1, "ABSENT");

    const [course] = (await callerFor(student).attendance.mine()).courses;
    expect(course).toMatchObject({
      attended: 0,
      conducted: 2,
      scheduled: 4,
      percentage: 0,
    });
    // Two sittings are left and even both would only reach 50%, so there is no
    // number to give — saying "2" would be a promise the arithmetic cannot keep.
    expect(course!.needed).toBeNull();
  });

  it("gives a reachable number when the threshold is still in reach", async () => {
    await mark(0, "ABSENT");
    const [course] = (await callerFor(student).attendance.mine()).courses;
    // One absence of one register: attending all three that remain gives 3/4.
    expect(course!.needed).toBe(3);
  });

  it("says nothing to a student who is already above the line", async () => {
    await mark(0, "PRESENT");
    await mark(1, "PRESENT");
    const [course] = (await callerFor(student).attendance.mine()).courses;
    expect(course!.percentage).toBe(100);
    expect(course!.needed).toBeNull();
  });
});
