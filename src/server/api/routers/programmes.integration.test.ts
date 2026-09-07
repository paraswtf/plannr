import { beforeEach, describe, expect, it } from "vitest";

import {
  PermissionBitField,
  PermissionFlags,
  SYSTEM_ROLES,
} from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";

/**
 * Programme management: the top of the hierarchy students are divided by.
 *
 * The rule worth protecting is the delete guard. `Group.programme` and
 * `Batch.programme` are both `onDelete: Restrict`, so a cascade was never on
 * the table — but a bare foreign-key error is not an answer, and a programme
 * quietly taking a year's groups and their timetables with it would be far
 * worse. The router refuses with an explanation instead, and these tests hold
 * it to that.
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
let student: Actor;

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
    where: { slug: "course-itest" },
    update: {},
    create: { slug: "course-itest", name: "Course Org", timezone: TZ },
  });
  orgId = org.id;
  await db.orgSettings.upsert({
    where: { orgId },
    update: {},
    create: { orgId },
  });

  // Groups and batches hold courses down, so they go first.
  await db.group.deleteMany({ where: { orgId } });
  await db.batch.deleteMany({ where: { orgId } });
  await db.programme.deleteMany({ where: { orgId } });

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
    "course-itest-coordinator@plannr-demo.invalid",
    "Course Coordinator",
    ["coordinator"],
  );
  student = await makeActor(
    "course-itest-student@plannr-demo.invalid",
    "Course Student",
    ["student"],
  );
});

describe("programmes", () => {
  it("creates a course and lists it", async () => {
    const api = callerFor(coordinator);
    const created = await api.groups.createCourse({
      code: "MCA",
      name: "Master of Computer Applications",
    });
    expect(created.code).toBe("MCA");

    const listed = await api.groups.programmeList({ query: "MCA" });
    expect(listed.total).toBe(1);
    expect(listed.rows).toHaveLength(1);
    expect(listed.rows[0]).toMatchObject({
      code: "MCA",
      groupCount: 0,
      batchCount: 0,
    });
  });

  it("refuses a duplicate code, whatever the casing", async () => {
    const api = callerFor(coordinator);
    await api.groups.createCourse({ code: "BCA", name: "Computer Apps" });

    await expect(
      api.groups.createCourse({ code: "bca", name: "Something else" }),
    ).rejects.toThrow(/already a course coded/i);
  });

  it("renames a course", async () => {
    const api = callerFor(coordinator);
    const created = await api.groups.createCourse({
      code: "BBA",
      name: "Buisness Administration",
    });

    const updated = await api.groups.updateCourse({
      id: created.id,
      name: "Business Administration",
    });
    expect(updated.name).toBe("Business Administration");
  });

  it("will not rename a course onto another's code", async () => {
    const api = callerFor(coordinator);
    await api.groups.createCourse({ code: "BCA", name: "Computer Apps" });
    const second = await api.groups.createCourse({ code: "BBA", name: "Biz" });

    await expect(
      api.groups.updateCourse({ id: second.id, code: "BCA" }),
    ).rejects.toThrow(/already a course coded/i);
  });

  it("deletes a course nothing is filed under", async () => {
    const api = callerFor(coordinator);
    const created = await api.groups.createCourse({
      code: "TMP",
      name: "Temp",
    });

    await expect(
      api.groups.deleteCourse({ id: created.id }),
    ).resolves.toMatchObject({ deleted: true });
    expect(await db.programme.count({ where: { id: created.id } })).toBe(0);
  });

  it("refuses to delete a course that still has groups", async () => {
    const api = callerFor(coordinator);
    const course = await api.groups.createCourse({ code: "BCA", name: "Apps" });
    await api.groups.create({ name: "BCA-A", programmeId: course.id });

    await expect(api.groups.deleteCourse({ id: course.id })).rejects.toThrow(
      /still has 1 group/i,
    );
    // Nothing was taken with it.
    expect(await db.programme.count({ where: { id: course.id } })).toBe(1);
    expect(await db.group.count({ where: { programmeId: course.id } })).toBe(1);
  });

  it("refuses to delete a course that still has batches", async () => {
    const api = callerFor(coordinator);
    const course = await api.groups.createCourse({ code: "BCA", name: "Apps" });
    await api.groups.createBatch({
      name: "23-27 BCA",
      programmeId: course.id,
      startYear: 2023,
      endYear: 2027,
    });

    await expect(api.groups.deleteCourse({ id: course.id })).rejects.toThrow(
      /still has 1 batch/i,
    );
  });

  it("names everything that is holding a course down", async () => {
    const api = callerFor(coordinator);
    const course = await api.groups.createCourse({ code: "BCA", name: "Apps" });
    await api.groups.create({ name: "BCA-A", programmeId: course.id });
    await api.groups.createBatch({
      name: "23-27 BCA",
      programmeId: course.id,
      startYear: 2023,
      endYear: 2027,
    });

    await expect(api.groups.deleteCourse({ id: course.id })).rejects.toThrow(
      /1 group and 1 batch/i,
    );

    const impact = await api.groups.programmeDeleteImpact({ id: course.id });
    expect(impact).toMatchObject({ groupCount: 1, batchCount: 1, code: "BCA" });
  });

  it("counts what is filed under a course", async () => {
    const api = callerFor(coordinator);
    const course = await api.groups.createCourse({ code: "BCA", name: "Apps" });
    await api.groups.create({ name: "BCA-A", programmeId: course.id });
    await api.groups.create({ name: "BCA-B", programmeId: course.id });
    await api.groups.createBatch({
      name: "23-27 BCA",
      programmeId: course.id,
      startYear: 2023,
      endYear: 2027,
    });

    const listed = await api.groups.programmeList({ query: "BCA" });
    expect(listed.rows[0]).toMatchObject({ groupCount: 2, batchCount: 1 });
  });

  it("keeps course management behind the permission for it", async () => {
    const api = callerFor(student);
    await expect(
      api.groups.createCourse({ code: "NOPE", name: "Not allowed" }),
    ).rejects.toThrow(/permission/i);
  });

  it("lets a coordinator manage courses out of the box", async () => {
    // The tab would be useless to the role that actually runs the timetable
    // if the seeded permissions did not include this.
    expect(
      new PermissionBitField(coordinator.permissions).has(
        PermissionFlags.ManageProgrammes,
      ),
    ).toBe(true);
  });
});
