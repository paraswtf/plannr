import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/server/db";
import { notify } from "./notify";

/**
 * Who `notify` writes a row for, and what each row owes, against a real Postgres.
 *
 * The function is a filter in front of one `createMany`, and every way it can go
 * wrong is a person getting a row they should not have (a deactivated account,
 * a machine, somebody in another organisation) or not getting one they should.
 * The cases are the choices a person can make, and the people who are never
 * addressed whatever they chose.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`). Push is a
 * switch here, because whether a row owes a push depends on the deployment as
 * well as on the person.
 */

let pushOn = true;
vi.mock("../push/config", () => ({
  pushEnabled: () => pushOn,
  webPush: () => {
    throw new Error("nothing here sends a push");
  },
}));

const TZ = "Asia/Kolkata";
const ORG = "notify-itest";
const FOREIGN_ORG = "notify-itest-foreign";
const EMAILS = {
  ana: "notify-ana@plannr-demo.invalid",
  ben: "notify-ben@plannr-demo.invalid",
  inactive: "notify-inactive@plannr-demo.invalid",
  machine: "notify-machine@plannr-service.invalid",
  foreign: "notify-foreign@plannr-demo.invalid",
};

let orgId: string;
let foreignOrgId: string;
const ids = {} as Record<keyof typeof EMAILS, string>;

const news = (overrides: Partial<Parameters<typeof notify>[2]> = {}) => ({
  orgId,
  category: "CLASS_CHANGES" as const,
  title: "Design Thinking has moved",
  body: "Now in room 4, was room 2.",
  url: "/schedule",
  ...overrides,
});

const rowsFor = (userId: string) =>
  db.notification.findMany({ where: { userId } });

async function choose(
  userId: string,
  category: "CLASS_CHANGES" | "REQUESTS",
  inApp: boolean,
  push: boolean,
) {
  await db.notificationPreference.create({
    data: { userId, category, inApp, push },
  });
}

beforeEach(async () => {
  pushOn = true;

  const upsertOrg = async (slug: string, name: string) =>
    (
      await db.organization.upsert({
        where: { slug },
        update: {},
        create: { slug, name, timezone: TZ },
      })
    ).id;
  orgId = await upsertOrg(ORG, "Notify itest");
  foreignOrgId = await upsertOrg(FOREIGN_ORG, "Notify itest, the other one");

  // Rows first, then the people they point at, and the accounts as well as
  // their rows because User.email is globally unique.
  await db.notification.deleteMany({
    where: { orgId: { in: [orgId, foreignOrgId] } },
  });
  await db.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });

  const make = async (
    key: keyof typeof EMAILS,
    extra: { isActive?: boolean; isServiceAccount?: boolean; orgId?: string },
  ) => {
    const user = await db.user.create({
      data: { orgId, email: EMAILS[key], name: key, ...extra },
    });
    ids[key] = user.id;
  };
  await make("ana", {});
  await make("ben", {});
  await make("inactive", { isActive: false });
  await make("machine", { isServiceAccount: true });
  await make("foreign", { orgId: foreignOrgId });
});

describe("notify, by what a person asked for", () => {
  it("writes an inbox row that owes a push to somebody who chose nothing", async () => {
    const written = await notify(db, [ids.ana], news());

    expect(written).toBe(1);
    const [row] = await rowsFor(ids.ana);
    expect(row).toMatchObject({
      orgId,
      category: "CLASS_CHANGES",
      title: "Design Thinking has moved",
      body: "Now in room 4, was room 2.",
      url: "/schedule",
      inInbox: true,
      pushPending: true,
      readAt: null,
      pushedAt: null,
    });
  });

  it("writes nothing when both the inbox and push are off", async () => {
    await choose(ids.ana, "CLASS_CHANGES", false, false);

    const written = await notify(db, [ids.ana], news());

    expect(written).toBe(0);
    expect(await rowsFor(ids.ana)).toEqual([]);
  });

  it("keeps the row but owes no push when push is off", async () => {
    await choose(ids.ana, "CLASS_CHANGES", true, false);

    await notify(db, [ids.ana], news());

    const [row] = await rowsFor(ids.ana);
    expect(row).toMatchObject({ inInbox: true, pushPending: false });
  });

  it("writes a row that is never listed when only push is on", async () => {
    await choose(ids.ana, "CLASS_CHANGES", false, true);

    await notify(db, [ids.ana], news());

    const [row] = await rowsFor(ids.ana);
    expect(row).toMatchObject({ inInbox: false, pushPending: true });
  });

  it("reads each person's own choice, in one call", async () => {
    await choose(ids.ana, "CLASS_CHANGES", false, false);
    await choose(ids.ben, "CLASS_CHANGES", true, false);

    const written = await notify(db, [ids.ana, ids.ben], news());

    expect(written).toBe(1);
    expect(await rowsFor(ids.ana)).toEqual([]);
    expect(await rowsFor(ids.ben)).toHaveLength(1);
  });

  it("is not affected by what somebody chose for another category", async () => {
    await choose(ids.ana, "REQUESTS", false, false);

    await notify(db, [ids.ana], news());

    const [row] = await rowsFor(ids.ana);
    expect(row).toMatchObject({ inInbox: true, pushPending: true });
  });
});

describe("notify, when push is not configured", () => {
  beforeEach(() => {
    pushOn = false;
  });

  it("still fills the inbox, and owes no push", async () => {
    await notify(db, [ids.ana], news());

    const [row] = await rowsFor(ids.ana);
    expect(row).toMatchObject({ inInbox: true, pushPending: false });
  });

  it("writes nothing for somebody who wanted only push", async () => {
    await choose(ids.ana, "CLASS_CHANGES", false, true);

    const written = await notify(db, [ids.ana], news());

    expect(written).toBe(0);
    expect(await rowsFor(ids.ana)).toEqual([]);
  });
});

describe("notify, and the people it never addresses", () => {
  it("skips a deactivated account", async () => {
    await notify(db, [ids.inactive], news());
    expect(await rowsFor(ids.inactive)).toEqual([]);
  });

  it("skips a service account", async () => {
    await notify(db, [ids.machine], news());
    expect(await rowsFor(ids.machine)).toEqual([]);
  });

  it("skips somebody in another organisation", async () => {
    await notify(db, [ids.foreign], news());
    expect(await rowsFor(ids.foreign)).toEqual([]);
  });

  it("addresses the people who qualify and only them", async () => {
    const written = await notify(
      db,
      [ids.ana, ids.inactive, ids.machine, ids.foreign, ids.ben],
      news(),
    );

    expect(written).toBe(2);
    expect(
      await db.notification.count({
        where: { userId: { in: Object.values(ids) } },
      }),
    ).toBe(2);
  });

  it("ignores empty, missing and repeated ids", async () => {
    expect(await notify(db, [], news())).toBe(0);
    expect(await notify(db, [null, undefined], news())).toBe(0);

    const written = await notify(db, [ids.ana, ids.ana, null], news());

    expect(written).toBe(1);
    expect(await rowsFor(ids.ana)).toHaveLength(1);
  });
});

describe("notify, and telling somebody the same thing twice", () => {
  it("writes a source key once per person however often it is sent", async () => {
    const first = await notify(
      db,
      [ids.ana],
      news({ sourceKey: "class-change:abc" }),
    );
    const second = await notify(
      db,
      [ids.ana],
      news({ sourceKey: "class-change:abc" }),
    );

    expect(first).toBe(1);
    expect(second).toBe(0);
    expect(await rowsFor(ids.ana)).toHaveLength(1);
  });

  it("tops up the people a retried call had not reached", async () => {
    await notify(db, [ids.ana], news({ sourceKey: "class-change:abc" }));

    const written = await notify(
      db,
      [ids.ana, ids.ben],
      news({ sourceKey: "class-change:abc" }),
    );

    expect(written).toBe(1);
    expect(await rowsFor(ids.ana)).toHaveLength(1);
    expect(await rowsFor(ids.ben)).toHaveLength(1);
  });

  it("treats different source keys as different news", async () => {
    await notify(db, [ids.ana], news({ sourceKey: "class-change:one" }));
    await notify(db, [ids.ana], news({ sourceKey: "class-change:two" }));

    expect(await rowsFor(ids.ana)).toHaveLength(2);
  });

  it("does not dedupe news that has no source key", async () => {
    await notify(db, [ids.ana], news());
    await notify(db, [ids.ana], news());

    expect(await rowsFor(ids.ana)).toHaveLength(2);
  });

  it("leaves a row that was already pushed as it was", async () => {
    await notify(db, [ids.ana], news({ sourceKey: "k" }));
    await db.notification.updateMany({
      where: { userId: ids.ana },
      data: { pushPending: false, pushedAt: new Date() },
    });

    await notify(db, [ids.ana], news({ sourceKey: "k" }));

    const [row] = await rowsFor(ids.ana);
    expect(row).toMatchObject({ pushPending: false });
    expect(row!.pushedAt).toBeInstanceOf(Date);
  });
});
