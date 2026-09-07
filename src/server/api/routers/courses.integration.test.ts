import { beforeEach, describe, expect, it } from "vitest";

import { PermissionFlags, SYSTEM_ROLES } from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";

/**
 * The course catalogue, and the shape of the institution behind it.
 *
 * These are the reads the /courses and /setup screens are built on, so what is
 * being protected is the chain itself: a course belongs to a semester, groups
 * take it, faculty may teach it, and the students who sit for it are whoever is
 * in those groups. Nothing here enrols anybody directly, and a test that could
 * pass while that stopped being true would be worthless.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`).
 */

const TZ = "Asia/Kolkata";
const ORG = "cat-itest";
/** The machine identity the last block here works against, and a foil for it. */
const KEY_EMAIL = "cat-key@plannr-service.invalid";
const BYSTANDER_EMAIL = "cat-bystander@plannr-demo.invalid";
const createCaller = createCallerFactory(appRouter);

let orgId: string;
let coordinator: ReturnType<typeof callerFor>;
let courseId: string;
let groupId: string;
let facultyId: string;

function callerFor(user: {
  id: string;
  orgId: string;
  roles: Array<{ id: string; name: string; key: string | null }>;
  permissions: bigint;
}) {
  return createCaller({
    db,
    headers: new Headers(),
    session: {
      expires: new Date(Date.now() + 3_600_000).toISOString(),
      user: {
        id: user.id,
        orgId: user.orgId,
        roles: user.roles,
        permissions: user.permissions.toString(),
        isActive: true,
        // A cookie session is always a person; the fixture says so explicitly
        // so that a machine identity can never sneak in through a caller.
        isServiceAccount: false,
        viaApiKey: false,
      },
    },
  });
}

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: ORG },
    update: {},
    create: { slug: ORG, name: "Catalogue itest", timezone: TZ },
  });
  orgId = org.id;

  await db.event.deleteMany({ where: { orgId } });
  await db.groupCourse.deleteMany({ where: { course: { orgId } } });
  await db.courseFaculty.deleteMany({ where: { course: { orgId } } });
  await db.course.deleteMany({ where: { orgId } });
  await db.studentGroupMembership.deleteMany({ where: { group: { orgId } } });
  // The user as well as the profile: User.email is globally unique, so leaving
  // the account behind makes the next run collide on it.
  await db.user.deleteMany({
    where: {
      email: {
        in: [
          "77777777777@unknown.invalid",
          "nay2324777@sicsr.ac.in",
          KEY_EMAIL,
          BYSTANDER_EMAIL,
        ],
      },
    },
  });
  await db.group.deleteMany({ where: { orgId } });
  await db.batchSemester.deleteMany({ where: { semester: { orgId } } });
  await db.batch.deleteMany({ where: { orgId } });
  // Semesters last: everything above points at one. A test that opens the next
  // semester would otherwise collide with its own leftovers on the second run.
  await db.semester.deleteMany({ where: { orgId } });

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
  const adminRole = await db.role.findUniqueOrThrow({
    where: { orgId_key: { orgId, key: "admin" } },
  });
  const user = await db.user.upsert({
    where: { email: "cat-admin@plannr-demo.invalid" },
    update: {},
    create: {
      orgId,
      email: "cat-admin@plannr-demo.invalid",
      name: "Coordinator",
    },
  });
  coordinator = callerFor({
    id: user.id,
    orgId,
    roles: [{ id: adminRole.id, name: adminRole.name, key: adminRole.key }],
    permissions: adminRole.permissions,
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
  const batch = await db.batch.create({
    data: {
      orgId,
      programmeId: programme.id,
      name: "23-27 BCA",
      startYear: 2023,
      endYear: 2027,
    },
  });
  await db.batchSemester.create({
    data: { batchId: batch.id, semesterId: semester.id, number: "VII" },
  });

  const group = await db.group.create({
    data: {
      orgId,
      programmeId: programme.id,
      semesterId: semester.id,
      batchId: batch.id,
      name: "Div A",
    },
  });
  groupId = group.id;

  const course = await db.course.create({
    data: {
      orgId,
      semesterId: semester.id,
      programmeId: programme.id,
      code: "703",
      title: "Deep Learning",
    },
  });
  courseId = course.id;

  const teacherUser = await db.user.upsert({
    where: { email: "cat-teacher@plannr-demo.invalid" },
    update: {},
    create: {
      orgId,
      email: "cat-teacher@plannr-demo.invalid",
      name: "Dr. Teacher",
    },
  });
  facultyId = (
    await db.facultyProfile.upsert({
      where: { userId: teacherUser.id },
      update: {},
      create: { userId: teacherUser.id, orgId },
    })
  ).id;

  // Two students, one of whom sits in the group taking the course.
  for (const [email, prn, inGroup] of [
    ["cat-s1@plannr-demo.invalid", "88888888881", true],
    ["cat-s2@plannr-demo.invalid", "88888888882", false],
  ] as const) {
    const student = await db.user.upsert({
      where: { email },
      update: {},
      create: { orgId, email, name: prn },
    });
    const profile = await db.studentProfile.upsert({
      where: { userId: student.id },
      update: {},
      create: { userId: student.id, orgId, prn },
    });
    if (inGroup) {
      await db.studentGroupMembership.create({
        data: { studentId: profile.id, groupId: group.id },
      });
    }
  }
});

describe("the catalogue", () => {
  it("lists a semester's courses with what hangs off each", async () => {
    await coordinator.courses.setGroups({ courseId, groupIds: [groupId] });
    await coordinator.courses.setFaculty({ courseId, facultyIds: [facultyId] });

    const page = await coordinator.courses.list({});
    expect(page.semester?.name).toBe("Autumn 2026");
    expect(page.rows).toHaveLength(1);
    expect(page.total).toBe(1);
    expect(page.rows[0]).toMatchObject({
      code: "703",
      title: "Deep Learning",
      programme: { code: "BCA" },
      _count: { faculty: 1, groups: 1 },
    });
  });

  it("pages the catalogue, and still hands over the lot by default", async () => {
    const semester = await db.semester.findFirstOrThrow({ where: { orgId } });
    const programme = await db.programme.findFirstOrThrow({ where: { orgId } });
    for (const title of ["Algorithms", "Compilers"]) {
      await db.course.create({
        data: {
          orgId,
          semesterId: semester.id,
          programmeId: programme.id,
          title,
        },
      });
    }

    const first = await coordinator.courses.list({ pageSize: 2 });
    expect(first.rows.map((c) => c.title)).toEqual(["Algorithms", "Compilers"]);
    expect(first).toMatchObject({
      total: 3,
      page: 1,
      pageSize: 2,
      pageCount: 2,
    });

    const second = await coordinator.courses.list({ page: 2, pageSize: 2 });
    expect(second.rows.map((c) => c.title)).toEqual(["Deep Learning"]);

    // The point of the default: the catalogue screen filters in the browser, so
    // a caller that never mentions paging has to keep receiving the semester
    // whole.
    const whole = await coordinator.courses.list({});
    expect(whole.rows).toHaveLength(3);
    expect(whole.pageCount).toBe(1);
  });

  it("answers a semester that teaches nothing with an empty page", async () => {
    const { semester } = await coordinator.semesters.create({
      name: "Spring 2027",
      startDate: new Date("2027-01-05"),
      endDate: new Date("2027-05-30"),
    });

    const page = await coordinator.courses.list({ semesterId: semester.id });
    expect(page.rows).toEqual([]);
    // Page 1 of 1 holding nothing, rather than page 1 of 0.
    expect(page).toMatchObject({ total: 0, page: 1, pageCount: 1 });
    expect(page.semester?.name).toBe("Spring 2027");
  });

  it("counts everyone sitting for a course through its groups, not by enrolment", async () => {
    await coordinator.courses.setGroups({ courseId, groupIds: [groupId] });

    const course = await coordinator.courses.byId({ courseId });
    // One of the two students is in the group; the other is not enrolled by
    // being in the same programme.
    expect(course.headcount).toBe(1);
    expect(course.groups).toHaveLength(1);
  });

  it("replaces the teachers rather than adding to them", async () => {
    await coordinator.courses.setFaculty({ courseId, facultyIds: [facultyId] });
    await coordinator.courses.setFaculty({ courseId, facultyIds: [] });

    const course = await coordinator.courses.byId({ courseId });
    expect(course.faculty).toEqual([]);
  });

  it("refuses a course from another institution", async () => {
    const other = await db.organization.upsert({
      where: { slug: "cat-itest-other" },
      update: {},
      create: { slug: "cat-itest-other", name: "Elsewhere", timezone: TZ },
    });
    const semester = await db.semester.upsert({
      where: { orgId_name: { orgId: other.id, name: "Theirs" } },
      update: {},
      create: {
        orgId: other.id,
        name: "Theirs",
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-11-30"),
      },
    });
    const theirs = await db.course.create({
      data: { orgId: other.id, semesterId: semester.id, title: "Not yours" },
    });

    await expect(
      coordinator.courses.byId({ courseId: theirs.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("a student the college has sent no address for", () => {
  /**
   * The college's lists often carry no address, and those students are really
   * enrolled — they sit in rooms and appear on registers. So the app holds them
   * without one, and the PRN rather than the address is what identifies them.
   */
  it("exists, cannot sign in, and keeps its record when the address arrives", async () => {
    const prn = "77777777777";
    const user = await db.user.create({
      data: {
        orgId,
        name: "No Address Yet",
        email: `${prn}@unknown.invalid`,
        isActive: false,
      },
    });
    const profile = await db.studentProfile.create({
      data: { userId: user.id, orgId, prn },
    });

    // The account exists and is shut.
    expect(user.isActive).toBe(false);

    // The day the address arrives, the import finds them by PRN and replaces
    // the placeholder — the same person, not a second record.
    const found = await db.studentProfile.findUnique({
      where: { orgId_prn: { orgId, prn } },
      select: { id: true, userId: true },
    });
    expect(found?.id).toBe(profile.id);

    await db.user.update({
      where: { id: found!.userId },
      data: { email: "nay2324777@sicsr.ac.in", isActive: true },
    });

    expect(await db.studentProfile.count({ where: { orgId, prn } })).toBe(1);
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.email).toBe("nay2324777@sicsr.ac.in");
    expect(after.isActive).toBe(true);
  });
});

describe("opening the next semester", () => {
  it("carries each intake forward a number, and leaves the finished behind", async () => {
    const finishing = await db.batch.create({
      data: {
        orgId,
        programmeId: (await db.programme.findFirstOrThrow({ where: { orgId } }))
          .id,
        name: "22-26 BCA",
        startYear: 2022,
        endYear: 2026,
      },
    });
    const autumn = await db.semester.findFirstOrThrow({ where: { orgId } });
    // A four-year degree runs to VIII, so this one is in its last semester.
    await db.batchSemester.create({
      data: { batchId: finishing.id, semesterId: autumn.id, number: "VIII" },
    });

    const result = await coordinator.semesters.create({
      name: "Spring 2027",
      startDate: new Date("2027-01-05"),
      endDate: new Date("2027-05-30"),
      carryFrom: autumn.id,
    });

    // The 23-27 intake goes VII → VIII; the 22-26 one has finished.
    expect(result.carried).toBe(1);
    expect(result.graduated).toEqual(["22-26 BCA"]);

    const carried = await db.batchSemester.findMany({
      where: { semesterId: result.semester.id },
      include: { batch: { select: { name: true } } },
    });
    expect(carried).toHaveLength(1);
    expect(carried[0]).toMatchObject({ number: "VIII" });
    expect(carried[0]!.batch.name).toBe("23-27 BCA");
  });

  it("opens one on its own when nothing is carried", async () => {
    const result = await coordinator.semesters.create({
      name: "Spring 2027",
      startDate: new Date("2027-01-05"),
      endDate: new Date("2027-05-30"),
    });
    expect(result.carried).toBe(0);
    expect(
      await db.batchSemester.count({
        where: { semesterId: result.semester.id },
      }),
    ).toBe(0);
  });

  it("lists what the college has kept as a page, newest first", async () => {
    await coordinator.semesters.create({
      name: "Spring 2027",
      startDate: new Date("2027-01-05"),
      endDate: new Date("2027-05-30"),
    });

    const page = await coordinator.semesters.list();
    expect(page.rows.map((s) => s.name)).toEqual([
      "Spring 2027",
      "Autumn 2026",
    ]);
    expect(page).toMatchObject({ total: 2, page: 1, pageCount: 1 });

    const first = await coordinator.semesters.list({ pageSize: 1 });
    expect(first.rows.map((s) => s.name)).toEqual(["Spring 2027"]);
    expect(first).toMatchObject({ total: 2, pageCount: 2 });
  });

  it("refuses a second semester of the same name", async () => {
    await expect(
      coordinator.semesters.create({
        name: "Autumn 2026",
        startDate: new Date("2027-01-05"),
        endDate: new Date("2027-05-30"),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses one that ends before it starts", async () => {
    await expect(
      coordinator.semesters.create({
        name: "Backwards",
        startDate: new Date("2027-05-30"),
        endDate: new Date("2027-01-05"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("will not delete a semester that is holding anything", async () => {
    const autumn = await db.semester.findFirstOrThrow({ where: { orgId } });
    // It holds the course and group made in the fixture.
    await expect(
      coordinator.semesters.remove({ id: autumn.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deletes an empty one, so a typo can be undone", async () => {
    const { semester } = await coordinator.semesters.create({
      name: "Opened by mistake",
      startDate: new Date("2027-01-05"),
      endDate: new Date("2027-05-30"),
    });
    await expect(
      coordinator.semesters.remove({ id: semester.id }),
    ).resolves.toMatchObject({ id: semester.id });
  });
});

describe("the shape of the institution", () => {
  it("reports the chain a coordinator has to arrange", async () => {
    await coordinator.courses.setGroups({ courseId, groupIds: [groupId] });

    const structure = await coordinator.courses.structure();
    expect(structure?.semester?.name).toBe("Autumn 2026");
    expect(structure?.programmes[0]).toMatchObject({
      code: "BCA",
      courses: 1,
      batches: [{ name: "23-27 BCA", number: "VII", groups: 1 }],
    });
    expect(structure?.totals).toMatchObject({ courses: 1, groups: 1 });
  });

  it("names the gaps rather than leaving them to be discovered", async () => {
    // No teacher on the course, and a class of this semester that teaches no
    // course at all. The lecture carries its semester, as every imported one
    // does — the count belongs under the semester's own heading, so a class
    // from another term must not be swept into it.
    const semester = await db.semester.findFirstOrThrow({ where: { orgId } });
    const room = await db.room.upsert({
      where: { id: `${orgId}-room` },
      update: {},
      create: {
        id: `${orgId}-room`,
        orgId,
        buildingId: (
          await db.building.upsert({
            where: { id: `${orgId}-bld` },
            update: {},
            create: { id: `${orgId}-bld`, orgId, name: "Main" },
          })
        ).id,
        code: "A1",
        floor: 0,
        capacity: 40,
        type: "LECTURE",
      },
    });
    await db.event.create({
      data: {
        orgId,
        kind: "CLASS",
        status: "CONFIRMED",
        title: "Subjectless",
        roomId: room.id,
        groupId,
        semesterId: semester.id,
        startTime: new Date("2026-07-06T03:30:00Z"),
        endTime: new Date("2026-07-06T04:30:00Z"),
        timezone: TZ,
      },
    });

    const structure = await coordinator.courses.structure();
    expect(structure?.gaps.coursesWithoutFaculty).toBe(1);
    expect(structure?.gaps.lecturesWithoutCourse).toBe(1);
  });
});

/**
 * An API key's machine identity.
 *
 * A key acts as its own hidden `User` row so that audit columns — who created
 * this event, who asked for this change — have a truthful answer that is not a
 * person. That row is a hazard on every people-facing screen: left alone it
 * turns up in the staff directory, in pickers, in headcounts. Worse, it is a
 * target: hand it a role and the key silently gains every permission that role
 * carries, on every request, without the scope model ever mentioning it.
 *
 * So the rule these protect is a simple one stated twice — a principal is not
 * shown to anybody, and it cannot be edited from here at all.
 */
describe("an API key's machine identity", () => {
  /**
   * Deliberately the worst case: a principal carrying a faculty profile, which
   * is what would put it in front of a class. Nothing in the app can give it
   * one — `users.update` refuses — so it is written straight to the table, and
   * the screens are asked to hold up anyway.
   */
  async function makePrincipal() {
    const user = await db.user.upsert({
      where: { email: KEY_EMAIL },
      update: {
        name: "Timetable Sync",
        isServiceAccount: true,
        permissions: 0n,
      },
      create: {
        orgId,
        email: KEY_EMAIL,
        name: "Timetable Sync",
        isServiceAccount: true,
      },
    });
    await db.facultyProfile.upsert({
      where: { userId: user.id },
      update: { shortName: "Sync", department: "Integrations" },
      create: {
        userId: user.id,
        orgId,
        shortName: "Sync",
        department: "Integrations",
      },
    });
    return user;
  }

  it("is in neither the directory nor the headcount an admin is shown", async () => {
    const before = await coordinator.users.count({});
    const principal = await makePrincipal();

    expect(await coordinator.users.count({})).toBe(before);
    expect(await coordinator.users.count({ query: "Timetable Sync" })).toBe(0);

    const listed = await coordinator.users.list({ pageSize: 200 });
    expect(listed.total).toBe(before);
    expect(listed.rows.map((r) => r.id)).not.toContain(principal.id);

    // Not reachable by id either, so a link cannot open a page for a bot.
    expect(await coordinator.users.byId({ id: principal.id })).toBeNull();
  });

  it("cannot be handed a role, which is how a key would be widened", async () => {
    const principal = await makePrincipal();
    const faculty = await db.role.findUniqueOrThrow({
      where: { orgId_key: { orgId, key: "faculty" } },
    });

    await expect(
      coordinator.users.setRoles({
        id: principal.id,
        roleIds: [faculty.id],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      coordinator.users.setRoles({
        id: principal.id,
        roleIds: [faculty.id],
      }),
    ).rejects.toThrow(/API keys screen/i);

    expect(await db.userRole.count({ where: { userId: principal.id } })).toBe(
      0,
    );
  });

  it("cannot be renamed, repermissioned or deleted from the people screen", async () => {
    const principal = await makePrincipal();

    await expect(
      coordinator.users.update({ id: principal.id, name: "Dr Innocent" }),
    ).rejects.toThrow(/API keys screen/i);
    await expect(
      coordinator.users.setExtraPermissions({
        id: principal.id,
        permissions: PermissionFlags.Administrator.toString(),
      }),
    ).rejects.toThrow(/API keys screen/i);
    await expect(
      coordinator.users.delete({ id: principal.id }),
    ).rejects.toThrow(/API keys screen/i);

    // Deleting it would take the audit trail with it, so it is still here,
    // still a machine, and still holding nothing.
    const after = await db.user.findUniqueOrThrow({
      where: { id: principal.id },
    });
    expect(after.name).toBe("Timetable Sync");
    expect(after.permissions).toBe(0n);
    expect(after.isServiceAccount).toBe(true);
  });

  it("is skipped, not deleted, when a select-all sweeps it up", async () => {
    const principal = await makePrincipal();
    const bystander = await db.user.create({
      data: { orgId, email: BYSTANDER_EMAIL, name: "Ordinary Person" },
    });

    const result = await coordinator.users.bulkDelete({
      ids: [principal.id, bystander.id],
    });

    expect(result.deleted).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({ id: principal.id });
    expect(result.skipped[0]!.reason).toMatch(/API keys screen/i);
    expect(await db.user.count({ where: { id: principal.id } })).toBe(1);
    expect(await db.user.count({ where: { id: bystander.id } })).toBe(0);
  });

  it("cannot be pasted into a bulk-add by its address", async () => {
    await makePrincipal();

    const resolved = await coordinator.users.resolveIdentifiers({
      identifiers: [KEY_EMAIL],
    });
    expect(resolved.matched).toEqual([]);
    expect(resolved.unmatched).toEqual([KEY_EMAIL]);
  });

  it("is not offered as somebody who could take a class", async () => {
    await makePrincipal();

    const faculty = await coordinator.groups.facultyList({ pageSize: 100 });
    expect(faculty.rows.map((f) => f.name)).not.toContain("Sync");
    expect(faculty.rows.map((f) => f.email)).not.toContain(KEY_EMAIL);
  });

  it("is not counted among the people who hold a role", async () => {
    const principal = await makePrincipal();
    const student = await db.role.findUniqueOrThrow({
      where: { orgId_key: { orgId, key: "student" } },
    });
    const countOf = async () =>
      (await coordinator.roles.list()).rows.find((r) => r.key === "student")!
        .userCount;

    const before = await countOf();
    // Straight into the join table, because `setRoles` refuses — this is the
    // "if it ever slips through" case the filter is there for.
    await db.userRole.create({
      data: { userId: principal.id, roleId: student.id },
    });

    expect(await countOf()).toBe(before);
    expect(
      (await coordinator.roles.deleteImpact({ id: student.id })).userCount,
    ).toBe(before);
  });
});
