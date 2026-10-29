import { beforeEach, describe, expect, it, vi } from "vitest";

// `authenticate.ts` imports `server-only`, which exists to fail any import
// outside a server component graph. That is the guarantee wanted in the build
// and an obstacle here, as in the REST handler's tests.
vi.mock("server-only", () => ({}));

import { PermissionFlags, SYSTEM_ROLES } from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { authenticateApiKey } from "~/server/api-keys/authenticate";
import { db } from "~/server/db";

/**
 * A key that speaks for a person.
 *
 * The whole feature rests on one claim, and this file exists to hold it up: a
 * personal key can do exactly what its owner can do and not one bit more, and
 * that is decided fresh on every single request rather than copied onto the row
 * when it was minted. Everything else — the Siri sentences, the shortcut, the
 * settings screen — is only safe because of that.
 *
 * So the cases below are the ones where it could be false. The token resolves
 * to the owner rather than to a machine, or "my timetable" is empty. The
 * intersection holds in both directions, or a student's phone can cancel a
 * lecture. Losing a role narrows the key without anybody revoking it, or a
 * credential outlives the access it was made from. And a key cannot mint a key,
 * or a leaked one renews itself past its own revocation.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`).
 */

const TZ = "Asia/Kolkata";
const ORG = "personal-key-itest";
const STUDENT_EMAIL = "pk-student@plannr-demo.invalid";
const ADMIN_EMAIL = "pk-admin@plannr-demo.invalid";
const createCaller = createCallerFactory(appRouter);

let orgId: string;
let studentId: string;
let adminId: string;
let studentRoleId: string;

function callerFor(user: {
  id: string;
  orgId: string;
  permissions: bigint;
  viaApiKey?: boolean;
  isServiceAccount?: boolean;
}) {
  return createCaller({
    db,
    headers: new Headers(),
    session: {
      expires: new Date(Date.now() + 3_600_000).toISOString(),
      user: {
        id: user.id,
        orgId: user.orgId,
        roles: [],
        permissions: user.permissions.toString(),
        isActive: true,
        isServiceAccount: user.isServiceAccount ?? false,
        viaApiKey: user.viaApiKey ?? false,
      },
    },
  });
}

/** Authenticates a token the way an HTTP request would. */
const present = (token: string) =>
  authenticateApiKey(
    new Headers({ authorization: `Bearer ${token}` }),
    "127.0.0.1",
  );

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: ORG },
    update: {},
    create: { slug: ORG, name: "Personal keys itest", timezone: TZ },
  });
  orgId = org.id;

  await db.apiKey.deleteMany({ where: { orgId } });
  await db.user.deleteMany({ where: { orgId, isServiceAccount: true } });
  await db.user.deleteMany({
    where: { email: { in: [STUDENT_EMAIL, ADMIN_EMAIL] } },
  });

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
  studentRoleId = studentRole.id;
  const adminRole = await db.role.findUniqueOrThrow({
    where: { orgId_key: { orgId, key: "admin" } },
  });

  const student = await db.user.create({
    data: {
      orgId,
      email: STUDENT_EMAIL,
      name: "A Student",
      roles: { create: { roleId: studentRole.id } },
    },
  });
  studentId = student.id;

  const admin = await db.user.create({
    data: {
      orgId,
      email: ADMIN_EMAIL,
      name: "An Administrator",
      roles: { create: { roleId: adminRole.id } },
    },
  });
  adminId = admin.id;
});

/** Mints one as the named person, the way the settings screen does. */
async function mintFor(userId: string, permissions: bigint) {
  const caller = callerFor({ id: userId, orgId, permissions });
  return caller.apiKeys.createMine({ name: "Siri" });
}

describe("a personal key is its owner", () => {
  it("resolves to the person rather than to a machine", async () => {
    const key = await mintFor(studentId, PermissionFlags.ViewOwnEvents);
    const result = await present(key.token);

    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    // The id is what makes "my timetable" answerable at all.
    expect(result.session.user.id).toBe(studentId);
    expect(result.session.user.isServiceAccount).toBe(false);
    // ...and this is what stops it minting another one.
    expect(result.session.user.viaApiKey).toBe(true);
    expect(result.key.ownerId).toBe(studentId);
  });

  it("holds what its owner holds, and no more", async () => {
    const key = await mintFor(studentId, PermissionFlags.ViewOwnEvents);
    const result = await present(key.token);
    if (!result?.ok) throw new Error("expected the key to authenticate");

    const bits = BigInt(result.session.user.permissions);
    expect(bits & PermissionFlags.ViewOwnEvents).toBe(
      PermissionFlags.ViewOwnEvents,
    );
    // The key carries what it was given and nothing the role never held: a
    // student's role has neither of these, so neither can appear on the key.
    expect(bits & PermissionFlags.BookRoom).toBe(0n);
    expect(bits & PermissionFlags.ManageAllEvents).toBe(0n);
  });

  it("does not inherit an administrator's authority", async () => {
    // The case that matters here specifically: the same person is the admin
    // account and a student record, and the key on their phone must be the
    // student's. `Administrator` also means "and everything added in future
    // releases", which is not a promise a token in a shortcut may carry.
    const key = await mintFor(adminId, PermissionFlags.Administrator);
    const result = await present(key.token);
    if (!result?.ok) throw new Error("expected the key to authenticate");

    const bits = BigInt(result.session.user.permissions);
    expect(bits & PermissionFlags.Administrator).toBe(0n);
    expect(bits & PermissionFlags.ManageAllEvents).toBe(0n);
    expect(bits & PermissionFlags.ManageUsers).toBe(0n);
    expect(bits & PermissionFlags.ViewOwnEvents).toBe(
      PermissionFlags.ViewOwnEvents,
    );
  });

  it("narrows the moment the owner loses a role, with no revocation", async () => {
    const key = await mintFor(studentId, PermissionFlags.ViewOwnEvents);

    await db.userRole.deleteMany({
      where: { userId: studentId, roleId: studentRoleId },
    });

    const result = await present(key.token);
    if (!result?.ok) throw new Error("expected the key to authenticate");
    // Still a valid credential; it simply cannot do anything any more.
    expect(BigInt(result.session.user.permissions)).toBe(0n);
  });

  it("stops working when the owner is deactivated", async () => {
    // Switching somebody off has to switch off every credential they hold, or
    // "remove their access" is a thing the console claims and does not do.
    const key = await mintFor(studentId, PermissionFlags.ViewOwnEvents);
    await db.user.update({
      where: { id: studentId },
      data: { isActive: false },
    });

    const result = await present(key.token);
    expect(result?.ok).toBe(false);
  });
});

describe("what a personal key may not do", () => {
  it("cannot mint another key", async () => {
    // A credential that renews itself survives its own revocation, under a
    // name nobody in the building recognises.
    const key = await mintFor(studentId, PermissionFlags.ViewOwnEvents);
    const result = await present(key.token);
    if (!result?.ok) throw new Error("expected the key to authenticate");

    const asKey = callerFor({
      id: studentId,
      orgId,
      permissions: BigInt(result.session.user.permissions),
      viaApiKey: true,
    });

    await expect(
      asKey.apiKeys.createMine({ name: "Offspring" }),
    ).rejects.toThrow(/cannot mint/i);
  });

  it("cannot revoke a key through the credential either", async () => {
    const key = await mintFor(studentId, PermissionFlags.ViewOwnEvents);
    const asKey = callerFor({
      id: studentId,
      orgId,
      permissions: PermissionFlags.ViewOwnEvents,
      viaApiKey: true,
    });
    await expect(asKey.apiKeys.revokeMine({ id: key.id })).rejects.toThrow(
      /cannot revoke/i,
    );
  });

  it("cannot be revoked or rolled by somebody else's admin console", async () => {
    /*
     * `roll` hands back a working token. An administrator who rolled a
     * student's personal key would be given a credential that acts as that
     * student — an escalation nobody would think to look for — so every lookup
     * in the console is filtered to the institution's own keys.
     */
    const key = await mintFor(studentId, PermissionFlags.ViewOwnEvents);
    const admin = callerFor({
      id: adminId,
      orgId,
      permissions: PermissionFlags.Administrator,
    });

    await expect(admin.apiKeys.roll({ id: key.id })).rejects.toThrow();
    await expect(admin.apiKeys.revoke({ id: key.id })).rejects.toThrow();
    await expect(admin.apiKeys.byId({ id: key.id })).rejects.toThrow();
  });

  it("stays out of the institution's credential register", async () => {
    // A college where everybody sets up Siri would otherwise turn the console
    // into a directory of student handsets, burying the dozen credentials that
    // actually grant something.
    await mintFor(studentId, PermissionFlags.ViewOwnEvents);
    const admin = callerFor({
      id: adminId,
      orgId,
      permissions: PermissionFlags.Administrator,
    });

    const listed = await admin.apiKeys.list();
    expect(listed.rows).toHaveLength(0);
  });

  it("is listed to its owner, and only to its owner", async () => {
    const key = await mintFor(studentId, PermissionFlags.ViewOwnEvents);

    const student = callerFor({
      id: studentId,
      orgId,
      permissions: PermissionFlags.ViewOwnEvents,
    });
    const mine = await student.apiKeys.mine();
    expect(mine.map((row) => row.id)).toEqual([key.id]);

    const admin = callerFor({
      id: adminId,
      orgId,
      permissions: PermissionFlags.Administrator,
    });
    expect(await admin.apiKeys.mine()).toEqual([]);
  });

  it("cannot be revoked by anybody but its owner", async () => {
    const key = await mintFor(studentId, PermissionFlags.ViewOwnEvents);
    const admin = callerFor({
      id: adminId,
      orgId,
      permissions: PermissionFlags.Administrator,
    });
    await expect(admin.apiKeys.revokeMine({ id: key.id })).rejects.toThrow(
      /no key with that id/i,
    );
  });

  it("stops authenticating once its owner switches it off", async () => {
    const key = await mintFor(studentId, PermissionFlags.ViewOwnEvents);
    const student = callerFor({
      id: studentId,
      orgId,
      permissions: PermissionFlags.ViewOwnEvents,
    });
    await student.apiKeys.revokeMine({ id: key.id });

    const result = await present(key.token);
    expect(result?.ok).toBe(false);
  });

  it("takes its principal with it, so the tables do not grow for ever", async () => {
    /*
     * A personal key holds ViewOwnEvents and can therefore never have written
     * anything, so unlike an institutional key there is no history to orphan —
     * and tombstoning one would leave a User row per phone anybody ever set up,
     * invisible to the console and reclaimable by nothing.
     */
    const key = await mintFor(studentId, PermissionFlags.ViewOwnEvents);
    const row = await db.apiKey.findUniqueOrThrow({
      where: { id: key.id },
      select: { principalId: true },
    });

    const student = callerFor({
      id: studentId,
      orgId,
      permissions: PermissionFlags.ViewOwnEvents,
    });
    await student.apiKeys.revokeMine({ id: key.id });

    expect(await db.apiKey.findUnique({ where: { id: key.id } })).toBeNull();
    expect(
      await db.user.findUnique({ where: { id: row.principalId } }),
    ).toBeNull();
  });

  it("caps how many one person may hold at once", async () => {
    const student = callerFor({
      id: studentId,
      orgId,
      permissions: PermissionFlags.ViewOwnEvents,
    });
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push((await student.apiKeys.createMine({ name: `Phone ${i}` })).id);
    }
    await expect(
      student.apiKeys.createMine({ name: "One too many" }),
    ).rejects.toThrow(/already have/i);

    // ...and switching one off frees the slot, because it is really gone.
    await student.apiKeys.revokeMine({ id: ids[0]! });
    await expect(
      student.apiKeys.createMine({ name: "Replacement" }),
    ).resolves.toBeTruthy();
  });
});

describe("a service key is unchanged", () => {
  it("still resolves to its own machine principal", async () => {
    const admin = callerFor({
      id: adminId,
      orgId,
      permissions: PermissionFlags.Administrator,
    });
    const key = await admin.apiKeys.create({
      name: "Noticeboard",
      scopes: ["ViewRooms"],
    });

    const result = await present(key.token);
    if (!result?.ok) throw new Error("expected the key to authenticate");
    expect(result.session.user.isServiceAccount).toBe(true);
    expect(result.session.user.id).not.toBe(adminId);
    expect(result.key.ownerId).toBeNull();
    // Its scopes are the whole grant, unintersected with anybody's roles.
    expect(BigInt(result.session.user.permissions)).toBe(
      PermissionFlags.ViewRooms,
    );
  });
});
