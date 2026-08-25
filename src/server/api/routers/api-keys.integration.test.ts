import { beforeEach, describe, expect, it } from "vitest";

import { GRANTABLE_SCOPES } from "~/lib/api-scopes";
import { PermissionFlags, SYSTEM_ROLES } from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { parseToken, verifySecret } from "~/server/api-keys/secret";
import { db } from "~/server/db";

/**
 * Minting, rolling and retiring the institution's machine credentials.
 *
 * What is being protected here is not a feature, it is a boundary. Every key is
 * a grant of authority to something that is not a person and will never be
 * asked to explain itself, so the properties below are the ones that decide how
 * much damage a leaked token can do and how completely it can be undone:
 *
 *   - the secret exists exactly once, in the response that minted it, and the
 *     database holds a digest;
 *   - a key's principal is a machine with no roles and no permission bits of
 *     its own, so "what can this key do?" is one column in one row;
 *   - nobody can grant more than they hold, and nobody at all can grant
 *     `Administrator`;
 *   - rolling keeps the identity and the audit trail, revoking keeps the
 *     record, and only deletion destroys anything — which is why it is behind a
 *     revoke.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`).
 */

const TZ = "Asia/Kolkata";
const ORG = "key-itest";
const ADMIN_EMAIL = "key-admin@plannr-demo.invalid";
/** Holds `ManageRoles` and nothing above it — the ceiling this file tests. */
const REGISTRAR_EMAIL = "key-registrar@plannr-demo.invalid";
/** Signed in, and nowhere near the API keys screen. */
const TEACHER_EMAIL = "key-teacher@plannr-demo.invalid";
const createCaller = createCallerFactory(appRouter);

let orgId: string;
let admin: ReturnType<typeof callerFor>;
let registrar: ReturnType<typeof callerFor>;
let teacher: ReturnType<typeof callerFor>;
let registrarId: string;

/**
 * Unlike the other fixtures, this one can build a caller that is a machine.
 *
 * Everywhere else `isServiceAccount` is pinned to false so a principal cannot
 * sneak in through a caller. Here the refusals aimed at a key are half the
 * subject, and there is no way to exercise them without being able to arrive as
 * one — so the flag is a parameter, and it still defaults to a person.
 */
function callerFor(user: {
  id: string;
  orgId: string;
  roles: Array<{ id: string; name: string; key: string | null }>;
  permissions: bigint;
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
        roles: user.roles,
        permissions: user.permissions.toString(),
        isActive: true,
        isServiceAccount: user.isServiceAccount ?? false,
      },
    },
  });
}

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: ORG },
    update: {},
    create: { slug: ORG, name: "Keys itest", timezone: TZ },
  });
  orgId = org.id;

  // Keys before principals: the key holds the foreign key, and a run that died
  // between the two writes would otherwise leave a row nothing can delete.
  await db.apiKey.deleteMany({ where: { orgId } });
  // Every principal, not a named list — their addresses are derived from a
  // random prefix, so a leftover from a previous run cannot be predicted.
  await db.user.deleteMany({ where: { orgId, isServiceAccount: true } });
  // The people as well, because User.email is globally unique and leaving them
  // behind makes the next run collide on it.
  await db.user.deleteMany({
    where: { email: { in: [ADMIN_EMAIL, REGISTRAR_EMAIL, TEACHER_EMAIL] } },
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
  const adminRole = await db.role.findUniqueOrThrow({
    where: { orgId_key: { orgId, key: "admin" } },
  });

  const adminUser = await db.user.create({
    data: { orgId, email: ADMIN_EMAIL, name: "Administrator" },
  });
  admin = callerFor({
    id: adminUser.id,
    orgId,
    roles: [{ id: adminRole.id, name: adminRole.name, key: adminRole.key }],
    permissions: adminRole.permissions,
  });

  const registrarUser = await db.user.create({
    data: { orgId, email: REGISTRAR_EMAIL, name: "Registrar" },
  });
  registrarId = registrarUser.id;
  // Granted personally rather than through a role, because the point is a
  // ceiling: they may administer keys and may not touch the settings.
  registrar = callerFor({
    id: registrarUser.id,
    orgId,
    roles: [],
    permissions: PermissionFlags.ManageRoles,
  });

  const teacherUser = await db.user.create({
    data: { orgId, email: TEACHER_EMAIL, name: "Dr. Teacher" },
  });
  teacher = callerFor({
    id: teacherUser.id,
    orgId,
    roles: [],
    permissions: PermissionFlags.ViewAllEvents | PermissionFlags.MarkAttendance,
  });
});

const mint = (name = "Timetable Sync") =>
  admin.apiKeys.create({ name, scopes: ["ManageAllEvents", "ViewRooms"] });

describe("minting a key", () => {
  /**
   * The most important assertion in this file. If this ever stops holding —
   * because somebody adds `hash` to a select, or stores `token` "for support" —
   * the institution's credentials are readable by anybody with a psql prompt,
   * and no amount of care elsewhere makes up for it.
   */
  it("hands back the secret once and keeps only a digest of it", async () => {
    const created = await mint();

    expect(created.shownOnce).toBe(true);
    expect(typeof created.token).toBe("string");

    const parsed = parseToken(created.token);
    expect(parsed).not.toBeNull();
    expect(parsed!.prefix).toBe(created.prefix);

    const stored = await db.apiKey.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.hash).not.toBe(parsed!.secret);
    expect(stored.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySecret(parsed!.secret, stored.hash)).toBe(true);
    expect(stored.last4).toBe(parsed!.secret.slice(-4));

    // Nothing anywhere on the row is the token itself.
    expect(JSON.stringify(stored)).not.toContain(parsed!.secret);
  });

  it("returns the secret exactly once, and never again", async () => {
    const created = await mint();

    const listed = await admin.apiKeys.list();
    const fetched = await admin.apiKeys.byId({ id: created.id });

    expect(listed[0]).not.toHaveProperty("token");
    expect(fetched).not.toHaveProperty("token");
    // The public handle survives, because that is what it is for.
    expect(fetched.prefix).toBe(created.prefix);
    expect(fetched.last4).toBe(created.last4);
  });

  /**
   * A principal is a machine identity and nothing else. Bits or roles on this
   * row would be a second, invisible source of authority — one the key editor
   * does not show and narrowing the key's scopes would not touch.
   */
  it("creates a machine identity with no roles and no permissions", async () => {
    const created = await mint();

    const key = await db.apiKey.findUniqueOrThrow({
      where: { id: created.id },
      select: { principalId: true, scopes: true, createdById: true },
    });
    const principal = await db.user.findUniqueOrThrow({
      where: { id: key.principalId },
    });

    expect(principal.isServiceAccount).toBe(true);
    expect(principal.permissions).toBe(0n);
    expect(principal.orgId).toBe(orgId);
    expect(principal.email).toContain(created.prefix);
    expect(principal.email.endsWith(".invalid")).toBe(true);
    expect(await db.userRole.count({ where: { userId: principal.id } })).toBe(
      0,
    );

    // The grant lives on the key, and the audit column names the person.
    expect(key.scopes).toBe(
      PermissionFlags.ManageAllEvents | PermissionFlags.ViewRooms,
    );
    expect(key.createdById).not.toBe(key.principalId);
  });

  it("reports the scopes the key really has, implications included", async () => {
    const created = await mint();

    expect(created.scopes).toContain("ManageAllEvents");
    // Nobody ticked these; the key holds them all the same, and a console that
    // hid that would understate what a leak costs.
    expect(created.scopes).toContain("ViewAllEvents");
    expect(created.scopes).toContain("ViewOwnEvents");
    expect(created.scopes).toContain("ViewRooms");
    expect(created.status).toBe("active");
    expect(created.createdBy?.id).toBeTruthy();
  });

  it("refuses somebody who is merely signed in", async () => {
    await expect(
      teacher.apiKeys.create({ name: "Mine", scopes: ["ViewAllEvents"] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await db.apiKey.count({ where: { orgId } })).toBe(0);
    // And no orphan principal from a transaction that got halfway.
    expect(
      await db.user.count({ where: { orgId, isServiceAccount: true } }),
    ).toBe(0);
  });

  it("refuses a key that has learned to mint keys", async () => {
    const created = await mint();
    const key = await db.apiKey.findUniqueOrThrow({
      where: { id: created.id },
      select: { principalId: true },
    });
    // The worst case: a principal that somehow holds the very bit that guards
    // this screen. It passes `permissionProcedure` and is still refused.
    const asKey = callerFor({
      id: key.principalId,
      orgId,
      roles: [],
      permissions: PermissionFlags.ManageRoles,
      isServiceAccount: true,
    });

    await expect(
      asKey.apiKeys.create({ name: "Offspring", scopes: ["ViewRooms"] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      asKey.apiKeys.create({ name: "Offspring", scopes: ["ViewRooms"] }),
    ).rejects.toThrow(/Sign in to the console/i);

    // Nor may it roll, revoke or delete its way around that.
    await expect(asKey.apiKeys.roll({ id: created.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      asKey.apiKeys.revoke({ id: created.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      asKey.apiKeys.delete({ id: created.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      asKey.apiKeys.update({ id: created.id, name: "Renamed" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await db.apiKey.count({ where: { orgId } })).toBe(1);
  });
});

describe("what a key may be granted", () => {
  /**
   * `Administrator` means "and everything added in future releases too". Nobody
   * can make that promise on behalf of a third-party integration, so it is
   * refused to everyone — including the administrator who holds it.
   */
  it("refuses Administrator to an administrator", async () => {
    await expect(
      admin.apiKeys.create({ name: "Everything", scopes: ["Administrator"] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      admin.apiKeys.create({ name: "Everything", scopes: ["Administrator"] }),
    ).rejects.toThrow(/Administrator cannot be granted/i);

    await expect(
      admin.apiKeys.create({
        name: "Everything, quietly",
        scopes: ["ViewRooms", "Administrator"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await db.apiKey.count({ where: { orgId } })).toBe(0);
  });

  it("lets an administrator grant everything else", async () => {
    const created = await admin.apiKeys.create({
      name: "The lot",
      scopes: GRANTABLE_SCOPES,
    });
    expect(created.scopes).toEqual(GRANTABLE_SCOPES);
  });

  it("refuses a scope the granter does not hold themselves", async () => {
    await expect(
      registrar.apiKeys.create({
        name: "Above my station",
        scopes: ["ManageSettings"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      registrar.apiKeys.create({
        name: "Above my station",
        scopes: ["ManageSettings"],
      }),
    ).rejects.toThrow(/you do not hold it yourself/i);

    expect(await db.apiKey.count({ where: { orgId } })).toBe(0);
  });

  it("lets a granter grant what they hold, including by implication", async () => {
    // `ManageRoles` implies `ViewUsers`, and nobody should have to tick a box
    // they were never shown in order to pass it on.
    const created = await registrar.apiKeys.create({
      name: "Directory reader",
      scopes: ["ViewUsers"],
    });
    expect(created.scopes).toEqual(["ViewUsers"]);
    expect(created.createdBy?.id).toBe(registrarId);
  });

  it("refuses an empty grant", async () => {
    await expect(
      admin.apiKeys.create({ name: "Useless", scopes: [] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("holds the same line when a key is widened after the fact", async () => {
    const created = await registrar.apiKeys.create({
      name: "Directory reader",
      scopes: ["ViewUsers"],
    });

    await expect(
      registrar.apiKeys.update({
        id: created.id,
        scopes: ["ViewUsers", "ManageSettings"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      admin.apiKeys.update({ id: created.id, scopes: ["Administrator"] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const after = await admin.apiKeys.byId({ id: created.id });
    expect(after.scopes).toEqual(["ViewUsers"]);
  });
});

describe("rolling a key", () => {
  /**
   * The difference between rolling and replacing, and the reason rolling is the
   * answer to "the token is in a git commit": the row, the principal and every
   * event the app ever scheduled stay attached to each other. A rotation costs
   * the institution no history.
   */
  it("changes the secret and keeps everything else", async () => {
    const created = await mint();
    const before = await db.apiKey.findUniqueOrThrow({
      where: { id: created.id },
    });

    const rolled = await admin.apiKeys.roll({ id: created.id });
    const after = await db.apiKey.findUniqueOrThrow({
      where: { id: created.id },
    });

    expect(rolled.id).toBe(created.id);
    expect(after.principalId).toBe(before.principalId);
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    expect(after.scopes).toBe(before.scopes);
    expect(after.requestCount).toBe(before.requestCount);

    // The old token is dead, and its prefix no longer resolves to anything —
    // so probing with it is answered the same way as a token invented from
    // nothing, rather than confirming the key it names is real.
    expect(after.hash).not.toBe(before.hash);
    expect(after.prefix).not.toBe(before.prefix);
    expect(verifySecret(parseToken(created.token)!.secret, after.hash)).toBe(
      false,
    );
    expect(verifySecret(parseToken(rolled.token)!.secret, after.hash)).toBe(
      true,
    );

    // The principal's address is derived from the prefix, so it moves too.
    const principal = await db.user.findUniqueOrThrow({
      where: { id: after.principalId },
    });
    expect(principal.email).toContain(after.prefix);
    expect(principal.isServiceAccount).toBe(true);
  });

  it("will not roll a revoked key back into service", async () => {
    const created = await mint();
    await admin.apiKeys.revoke({ id: created.id });

    await expect(admin.apiKeys.roll({ id: created.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("retiring a key", () => {
  /**
   * Revoking is idempotent because the one moment it gets called twice is an
   * incident, and nobody dealing with a leaked token needs an error message
   * about a race.
   */
  it("revokes once and reports the same thing every time after", async () => {
    const created = await mint();

    const first = await admin.apiKeys.revoke({ id: created.id });
    expect(first.status).toBe("revoked");
    expect(first.revokedAt).not.toBeNull();

    const second = await admin.apiKeys.revoke({ id: created.id });
    expect(second.status).toBe("revoked");
    expect(second.revokedAt!.getTime()).toBe(first.revokedAt!.getTime());

    // The record survives, because everything the key scheduled points at it.
    const stored = await db.apiKey.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.revokedById).toBeTruthy();
    expect(await db.user.count({ where: { id: stored.principalId } })).toBe(1);
  });

  it("refuses to edit a key that has been revoked", async () => {
    const created = await mint();
    await admin.apiKeys.revoke({ id: created.id });

    await expect(
      admin.apiKeys.update({ id: created.id, name: "Second thoughts" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  /**
   * Deleting takes the audit trail with it, so it is deliberately the second
   * destructive act rather than the first — by the time anyone reaches it, the
   * key has been off long enough for whatever depended on it to have complained.
   */
  it("will not delete a live key, and will delete a revoked one", async () => {
    const created = await mint();

    await expect(
      admin.apiKeys.delete({ id: created.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.apiKeys.delete({ id: created.id })).rejects.toThrow(
      /Revoke it first/i,
    );
    expect(await db.apiKey.count({ where: { id: created.id } })).toBe(1);

    const { principalId } = await db.apiKey.findUniqueOrThrow({
      where: { id: created.id },
      select: { principalId: true },
    });

    await admin.apiKeys.revoke({ id: created.id });
    await expect(admin.apiKeys.delete({ id: created.id })).resolves.toEqual({
      deleted: true,
    });

    // The key and its machine identity go together, always.
    expect(await db.apiKey.count({ where: { id: created.id } })).toBe(0);
    expect(await db.user.count({ where: { id: principalId } })).toBe(0);
  });

  it("answers NOT_FOUND for a key belonging to another institution", async () => {
    const other = await db.organization.upsert({
      where: { slug: "key-itest-other" },
      update: {},
      create: { slug: "key-itest-other", name: "Elsewhere", timezone: TZ },
    });
    const theirPrincipal = await db.user.create({
      data: {
        orgId: other.id,
        email: "svc-elsewhere@api.plannr.invalid",
        name: "Theirs (API key)",
        isServiceAccount: true,
      },
    });
    const theirs = await db.apiKey.create({
      data: {
        orgId: other.id,
        name: "Theirs",
        prefix: "ffffffff",
        hash: "0".repeat(64),
        last4: "abcd",
        principalId: theirPrincipal.id,
        scopes: PermissionFlags.ViewRooms,
      },
    });

    await expect(admin.apiKeys.byId({ id: theirs.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(admin.apiKeys.revoke({ id: theirs.id })).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );

    await db.apiKey.delete({ where: { id: theirs.id } });
    await db.user.delete({ where: { id: theirPrincipal.id } });
  });
});

describe("listing keys", () => {
  it("never carries a hash, whichever way a key is read", async () => {
    const created = await mint("Sync");
    await admin.apiKeys.create({ name: "Reports", scopes: ["ViewRooms"] });

    const stored = await db.apiKey.findMany({
      where: { orgId },
      select: { hash: true },
    });
    const hashes = stored.map((key) => key.hash);
    expect(hashes).toHaveLength(2);

    const listed = await admin.apiKeys.list();
    const fetched = await admin.apiKeys.byId({ id: created.id });
    const rolled = await admin.apiKeys.roll({ id: created.id });

    for (const row of [...listed, fetched, rolled]) {
      expect(row).not.toHaveProperty("hash");
      const serialised = JSON.stringify(row);
      for (const hash of hashes) expect(serialised).not.toContain(hash);
    }
  });

  it("puts the newest first, and shows only this institution's keys", async () => {
    await mint("First");
    await admin.apiKeys.create({ name: "Second", scopes: ["ViewRooms"] });

    const listed = await admin.apiKeys.list();
    expect(listed.map((key) => key.name)).toEqual(["Second", "First"]);
  });

  it("is closed to somebody who cannot administer roles", async () => {
    await expect(teacher.apiKeys.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  /** The vocabulary itself is a static list and says nothing about anybody. */
  it("offers the scope catalogue to anyone signed in, without Administrator", async () => {
    const catalogue = await teacher.apiKeys.scopeCatalog();
    const offered = catalogue.flatMap((group) =>
      group.scopes.map((scope) => scope.name),
    );
    expect(offered).toEqual(GRANTABLE_SCOPES);
    expect(offered).not.toContain("Administrator");
  });
});

describe("what a key has been doing", () => {
  it("starts at nothing, with its whole rate-limit window ahead of it", async () => {
    const created = await mint();

    const usage = await admin.apiKeys.usage({ id: created.id });
    expect(usage.requestCount).toBe(0);
    expect(usage.lastUsedAt).toBeNull();
    expect(usage.eventsCreated).toBe(0);
    expect(usage.rateLimit.usedThisWindow).toBe(0);
    expect(usage.rateLimit.remaining).toBe(usage.rateLimit.perMinute);
    expect(usage.rateLimit.windowStartedAt).toBeNull();
  });

  /**
   * A window that closed at lunchtime is indistinguishable from one that never
   * opened, as far as the next request is concerned. Reporting it as a live
   * window would have an admin reading "119 of 120 used" beside a key with all
   * its headroom back.
   */
  it("reports a stale window as no window at all", async () => {
    const created = await mint();
    await db.apiKey.update({
      where: { id: created.id },
      data: {
        windowStartedAt: new Date(Date.now() - 10 * 60 * 1000),
        windowCount: 119,
        requestCount: 4_000,
      },
    });

    const usage = await admin.apiKeys.usage({ id: created.id });
    expect(usage.requestCount).toBe(4_000);
    expect(usage.rateLimit.usedThisWindow).toBe(0);
    expect(usage.rateLimit.remaining).toBe(usage.rateLimit.perMinute);
    expect(usage.rateLimit.resetsInSeconds).toBe(0);
  });
});
