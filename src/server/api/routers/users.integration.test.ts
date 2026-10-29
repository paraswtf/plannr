import { beforeEach, describe, expect, it } from "vitest";

import { SYSTEM_ROLES } from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";

/**
 * The People directory's filters and its order.
 *
 * What is being protected is that a filter says what the rows under it say:
 * picking "Active" returns only people the row would call Active, and the four
 * statuses between them list everybody once. And that the students the import
 * could not name sort after everybody named, rather than ahead of them.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`).
 */

const TZ = "Asia/Kolkata";
const ORG = "people-itest";
const ADMIN_EMAIL = "people-admin@plannr-demo.invalid";
const createCaller = createCallerFactory(appRouter);

let orgId: string;
let admin: ReturnType<typeof callerFor>;
/** One fixture person per status, by the status they should be listed under. */
let ids: Record<"active" | "never" | "inactive" | "waiting" | "blank", string>;

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
    create: { slug: ORG, name: "People itest", timezone: TZ },
  });
  orgId = org.id;

  // Accounts go with their users (onDelete: Cascade). The org is private to
  // this file, so every user in it is a fixture.
  await db.user.deleteMany({ where: { orgId } });

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
  const me = await db.user.create({
    data: { orgId, email: ADMIN_EMAIL, name: "Admin" },
  });
  // Signed in, so the admin is one of the active people.
  await db.account.create({
    data: {
      userId: me.id,
      type: "oauth",
      provider: "google",
      providerAccountId: "people-itest-admin",
    },
  });
  admin = callerFor({
    id: me.id,
    orgId,
    roles: [{ id: adminRole.id, name: adminRole.name, key: adminRole.key }],
    permissions: adminRole.permissions,
  });

  const active = await db.user.create({
    data: {
      orgId,
      email: "people-itest-zed@plannr-demo.invalid",
      name: "Zed Zane",
    },
  });
  await db.account.create({
    data: {
      userId: active.id,
      type: "oauth",
      provider: "google",
      providerAccountId: "people-itest-zed",
    },
  });
  const never = await db.user.create({
    data: {
      orgId,
      email: "people-itest-aanya@plannr-demo.invalid",
      name: "Aanya Sharma",
    },
  });
  const inactive = await db.user.create({
    data: {
      orgId,
      email: "people-itest-off@plannr-demo.invalid",
      name: "Disabled Person",
      isActive: false,
    },
  });
  const waiting = await db.user.create({
    data: {
      orgId,
      email: "77777700001@unknown.invalid",
      name: "Waiting Student",
      isActive: false,
    },
  });
  // What the student import writes for a roster row with no name.
  const blank = await db.user.create({
    data: {
      orgId,
      email: "people-itest-blank@plannr-demo.invalid",
      name: null,
    },
  });
  ids = {
    active: active.id,
    never: never.id,
    inactive: inactive.id,
    waiting: waiting.id,
    blank: blank.id,
  };
});

const listed = async (
  status: "all" | "active" | "never-signed-in" | "inactive" | "waiting",
) => (await admin.users.list({ status, pageSize: 200 })).rows.map((r) => r.id);

describe("users.list status", () => {
  it("lists under Active only the people who have signed in", async () => {
    const rows = await listed("active");
    expect(rows).toContain(ids.active);
    expect(rows).not.toContain(ids.never);
    expect(rows).not.toContain(ids.blank);
    expect(rows).not.toContain(ids.inactive);
    expect(rows).not.toContain(ids.waiting);
  });

  it("lists under Not signed in only the enabled who never arrived", async () => {
    expect(new Set(await listed("never-signed-in"))).toEqual(
      new Set([ids.never, ids.blank]),
    );
  });

  it("keeps people waiting on an address out of Disabled", async () => {
    expect(await listed("inactive")).toEqual([ids.inactive]);
    expect(await listed("waiting")).toEqual([ids.waiting]);
  });

  it("lists everybody under exactly one status", async () => {
    const all = await listed("all");
    const parts = [
      ...(await listed("active")),
      ...(await listed("never-signed-in")),
      ...(await listed("inactive")),
      ...(await listed("waiting")),
    ];
    expect(parts).toHaveLength(all.length);
    expect(new Set(parts)).toEqual(new Set(all));
  });

  it("counts what it lists", async () => {
    for (const status of [
      "active",
      "never-signed-in",
      "inactive",
      "waiting",
    ] as const) {
      expect(await admin.users.count({ status })).toBe(
        (await listed(status)).length,
      );
    }
  });
});

describe("users.list order", () => {
  it("puts somebody with no name after everybody named", async () => {
    const rows = await listed("never-signed-in");
    expect(rows).toEqual([ids.never, ids.blank]);
    const all = await listed("all");
    expect(all.at(-1)).toBe(ids.blank);
  });
});
