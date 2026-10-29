import { beforeEach, describe, expect, it, vi } from "vitest";

import { NOTIFICATION_CATEGORIES } from "~/lib/notifications";
import { SYSTEM_ROLES } from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";
import { NotificationCategory } from "../../../../generated/prisma";

/**
 * The inbox and its settings, against a real Postgres.
 *
 * What is being protected is that an inbox is one person's: every read and every
 * write below is made as somebody who shares an organisation with somebody else
 * holding rows of their own, and the other person's rows must come through
 * untouched. The router has no permission to check, so this is the only line of
 * defence there is.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`). Push is
 * replaced by a switch, so `pushAvailable` can be seen both ways.
 */

let pushOn = false;
vi.mock("~/server/services/push/config", () => ({
  pushEnabled: () => pushOn,
  webPush: () => {
    throw new Error("nothing here sends a push");
  },
}));

const TZ = "Asia/Kolkata";
const ORG = "inbox-itest";
const ME = "inbox-me@plannr-demo.invalid";
const OTHER = "inbox-other@plannr-demo.invalid";
const createCaller = createCallerFactory(appRouter);

let orgId: string;
let me: { id: string };
let other: { id: string };

const permissionsOf = (key: string) =>
  SYSTEM_ROLES.find((role) => role.key === key)!.permissions;

function callerFor(userId: string, role: string) {
  return createCaller({
    db,
    headers: new Headers(),
    session: {
      expires: new Date(Date.now() + 3_600_000).toISOString(),
      user: {
        id: userId,
        orgId,
        roles: [],
        permissions: permissionsOf(role).toString(),
        isActive: true,
        isServiceAccount: false,
        viaApiKey: false,
      },
    },
  });
}

/** The caller. A student unless told otherwise, who is offered the fewest categories. */
const asMe = (role = "student") => callerFor(me.id, role);

let clock = 0;
/** One row, each a minute after the last, so "newest first" has an answer. */
async function note(
  userId: string,
  title: string,
  extra: Partial<{
    category: NotificationCategory;
    inInbox: boolean;
    readAt: Date | null;
  }> = {},
) {
  clock += 1;
  return db.notification.create({
    data: {
      orgId,
      userId,
      category: extra.category ?? NotificationCategory.CLASS_CHANGES,
      title,
      body: `${title} body`,
      url: "/schedule",
      inInbox: extra.inInbox ?? true,
      readAt: extra.readAt ?? null,
      createdAt: new Date(Date.UTC(2026, 9, 1, 9, clock)),
    },
  });
}

beforeEach(async () => {
  pushOn = false;
  clock = 0;

  const org = await db.organization.upsert({
    where: { slug: ORG },
    update: {},
    create: { slug: ORG, name: "Inbox itest", timezone: TZ },
  });
  orgId = org.id;

  // Rows first, then the people they point at. User.email is globally unique,
  // so the accounts are removed too rather than left to collide on the next run.
  await db.notification.deleteMany({ where: { orgId } });
  await db.notificationPreference.deleteMany({
    where: { user: { email: { in: [ME, OTHER] } } },
  });
  await db.user.deleteMany({ where: { email: { in: [ME, OTHER] } } });

  me = await db.user.create({ data: { orgId, email: ME, name: "Me" } });
  other = await db.user.create({
    data: { orgId, email: OTHER, name: "Somebody else" },
  });
});

describe("notifications.list", () => {
  it("lists the caller's own rows, newest first", async () => {
    await note(me.id, "first");
    await note(me.id, "second");
    await note(other.id, "not mine");
    await note(me.id, "third");

    const page = await asMe().notifications.list({});

    expect(page.rows.map((r) => r.title)).toEqual(["third", "second", "first"]);
    expect(page.total).toBe(3);
    expect(page.rows[0]).toMatchObject({
      category: "CLASS_CHANGES",
      body: "third body",
      url: "/schedule",
      readAt: null,
    });
  });

  it("never lists a row that exists only to carry a push", async () => {
    await note(me.id, "shown");
    await note(me.id, "push only", { inInbox: false });

    const page = await asMe().notifications.list({});

    expect(page.rows.map((r) => r.title)).toEqual(["shown"]);
    expect(page.total).toBe(1);
  });

  it("leaves out what has been read when asked for unread", async () => {
    await note(me.id, "read", { readAt: new Date() });
    await note(me.id, "unread");

    const unread = await asMe().notifications.list({ filter: "unread" });
    const all = await asMe().notifications.list({ filter: "all" });

    expect(unread.rows.map((r) => r.title)).toEqual(["unread"]);
    expect(unread.total).toBe(1);
    expect(all.rows.map((r) => r.title)).toEqual(["unread", "read"]);
  });

  it("pages, and counts the whole inbox rather than the page", async () => {
    for (let i = 1; i <= 5; i++) await note(me.id, `n${i}`);

    const second = await asMe().notifications.list({ page: 2, pageSize: 2 });

    expect(second.rows.map((r) => r.title)).toEqual(["n3", "n2"]);
    expect(second.total).toBe(5);
    expect(second.pageCount).toBe(3);
  });

  it("answers an empty inbox with an empty page", async () => {
    const page = await asMe().notifications.list({});
    expect(page.rows).toEqual([]);
    expect(page.total).toBe(0);
  });
});

describe("notifications.unreadCount", () => {
  it("counts the caller's unread rows that the inbox would list", async () => {
    await note(me.id, "unread one");
    await note(me.id, "unread two");
    await note(me.id, "read", { readAt: new Date() });
    await note(me.id, "hidden", { inInbox: false });
    await note(other.id, "theirs");

    expect(await asMe().notifications.unreadCount()).toEqual({ count: 2 });
    expect(
      await callerFor(other.id, "student").notifications.unreadCount(),
    ).toEqual({ count: 1 });
  });

  it("is zero for somebody with nothing", async () => {
    expect(await asMe().notifications.unreadCount()).toEqual({ count: 0 });
  });
});

describe("notifications.markRead", () => {
  it("marks the named rows read and no others", async () => {
    const a = await note(me.id, "a");
    const b = await note(me.id, "b");
    const c = await note(me.id, "c");

    const result = await asMe().notifications.markRead({ ids: [a.id, b.id] });

    expect(result).toEqual({ updated: 2 });
    const rows = await db.notification.findMany({ where: { userId: me.id } });
    const readAt = new Map(rows.map((r) => [r.id, r.readAt]));
    expect(readAt.get(a.id)).toBeInstanceOf(Date);
    expect(readAt.get(b.id)).toBeInstanceOf(Date);
    expect(readAt.get(c.id)).toBeNull();
  });

  it("ignores ids that belong to somebody else", async () => {
    const mine = await note(me.id, "mine");
    const theirs = await note(other.id, "theirs");

    const result = await asMe().notifications.markRead({
      ids: [mine.id, theirs.id],
    });

    expect(result).toEqual({ updated: 1 });
    const stillUnread = await db.notification.findUniqueOrThrow({
      where: { id: theirs.id },
    });
    expect(stillUnread.readAt).toBeNull();
  });

  it("does not count, or move the time of, a row already read", async () => {
    const earlier = new Date("2026-10-01T10:00:00Z");
    const done = await note(me.id, "done", { readAt: earlier });

    const result = await asMe().notifications.markRead({ ids: [done.id] });

    expect(result).toEqual({ updated: 0 });
    const row = await db.notification.findUniqueOrThrow({
      where: { id: done.id },
    });
    expect(row.readAt).toEqual(earlier);
  });

  it("refuses an empty list", async () => {
    await expect(asMe().notifications.markRead({ ids: [] })).rejects.toThrow();
  });
});

describe("notifications.markAllRead", () => {
  it("clears the caller's inbox and leaves everybody else's alone", async () => {
    await note(me.id, "one");
    await note(me.id, "two");
    await note(me.id, "already", { readAt: new Date() });
    const theirs = await note(other.id, "theirs");

    const result = await asMe().notifications.markAllRead();

    expect(result).toEqual({ updated: 2 });
    expect(await asMe().notifications.unreadCount()).toEqual({ count: 0 });
    const untouched = await db.notification.findUniqueOrThrow({
      where: { id: theirs.id },
    });
    expect(untouched.readAt).toBeNull();
  });

  it("answers zero when there is nothing to clear", async () => {
    expect(await asMe().notifications.markAllRead()).toEqual({ updated: 0 });
  });
});

describe("notifications.preferences", () => {
  it("starts with everything on, for the categories a student can have", async () => {
    const result = await asMe("student").notifications.preferences();

    expect(result.categories.map((c) => c.category)).toEqual([
      "CLASS_CHANGES",
      "ASSIGNMENTS",
    ]);
    expect(result.categories[0]).toMatchObject({ inApp: true, push: true });
    expect(result.categories[0]!.label).toBeTruthy();
    expect(result.categories[0]!.description).toBeTruthy();
  });

  it("offers each role the categories that fit what it can do", async () => {
    const offered = async (role: string) =>
      (await asMe(role).notifications.preferences()).categories.map(
        (c) => c.category,
      );

    expect(await offered("student")).toEqual(["CLASS_CHANGES", "ASSIGNMENTS"]);
    expect(await offered("faculty")).toEqual([
      "CLASS_CHANGES",
      "REQUESTS",
      "ASSIGNMENTS",
    ]);
    expect(await offered("coordinator")).toEqual([...NOTIFICATION_CATEGORIES]);
    expect(await offered("admin")).toEqual([...NOTIFICATION_CATEGORIES]);
  });

  it("shows the caller's own choice where they have made one", async () => {
    await db.notificationPreference.create({
      data: {
        userId: me.id,
        category: "CLASS_CHANGES",
        inApp: true,
        push: false,
      },
    });
    await db.notificationPreference.create({
      data: {
        userId: other.id,
        category: "CLASS_CHANGES",
        inApp: false,
        push: false,
      },
    });

    const result = await asMe().notifications.preferences();

    expect(result.categories[0]).toMatchObject({
      category: "CLASS_CHANGES",
      inApp: true,
      push: false,
    });
  });

  it("says whether this deployment can push at all", async () => {
    pushOn = false;
    expect((await asMe().notifications.preferences()).pushAvailable).toBe(
      false,
    );
    pushOn = true;
    expect((await asMe().notifications.preferences()).pushAvailable).toBe(true);
  });
});

describe("notifications.setPreference", () => {
  it("changes one switch and leaves the other at its default", async () => {
    const saved = await asMe().notifications.setPreference({
      category: "CLASS_CHANGES",
      push: false,
    });

    expect(saved).toEqual({
      category: "CLASS_CHANGES",
      inApp: true,
      push: false,
    });
  });

  it("keeps an earlier choice when only the other switch is sent", async () => {
    const caller = asMe();
    await caller.notifications.setPreference({
      category: "CLASS_CHANGES",
      push: false,
    });

    const saved = await caller.notifications.setPreference({
      category: "CLASS_CHANGES",
      inApp: false,
    });

    expect(saved).toEqual({
      category: "CLASS_CHANGES",
      inApp: false,
      push: false,
    });
    const rows = await db.notificationPreference.findMany({
      where: { userId: me.id },
    });
    expect(rows).toHaveLength(1);
  });

  it("can turn a switch back on", async () => {
    const caller = asMe();
    await caller.notifications.setPreference({
      category: "CLASS_CHANGES",
      inApp: false,
      push: false,
    });
    const saved = await caller.notifications.setPreference({
      category: "CLASS_CHANGES",
      inApp: true,
    });
    expect(saved).toMatchObject({ inApp: true, push: false });
  });

  it("is read back by preferences, and touches nobody else's choice", async () => {
    await asMe().notifications.setPreference({
      category: "CLASS_CHANGES",
      inApp: false,
    });

    const mine = await asMe().notifications.preferences();
    const theirs = await callerFor(
      other.id,
      "student",
    ).notifications.preferences();

    expect(mine.categories[0]).toMatchObject({ inApp: false, push: true });
    expect(theirs.categories[0]).toMatchObject({ inApp: true, push: true });
  });

  it("refuses a category that does not exist", async () => {
    await expect(
      asMe().notifications.setPreference({
        // @ts-expect-error not a category, which is the point
        category: "SOMETHING_ELSE",
        push: false,
      }),
    ).rejects.toThrow();
  });
});
