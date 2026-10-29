import { Prisma, type PrismaClient } from "../../../../generated/prisma";
import { notify } from "../notifications/notify";
import { pushEnabled, webPush } from "./config";

/** How long a taken notice or push stays taken if its dispatcher dies mid-send. */
const LEASE_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const NOTICE_BATCH = 20;
const PUSH_BATCH = 100;
/** News older than this is news no longer: a missed class is not alerted a day later. */
const STALE_HOURS = 24;
const DEVICES_AT_ONCE = 25;

interface ClaimedNotice {
  id: string;
  title: string;
  body: string;
  url: string;
  groupIds: string[];
  facultyIds: string[];
}

interface ClaimedPush {
  id: string;
  userId: string;
  title: string;
  body: string;
}

export interface DispatchReport {
  /** Class-change notices turned into inbox rows. */
  notices: number;
  /** Inbox rows those notices became. */
  notified: number;
  /** Notifications whose push was attempted. */
  pushes: number;
  delivered: number;
  pruned: number;
  failed: number;
}

/**
 * Delivers whatever is waiting, in two steps.
 *
 * First, each class-change notice is addressed: the edit that caused it wrote
 * down only the groups and teachers concerned, and here they become a row per
 * person, so that each of them can read and clear it. Then every row that owes
 * a push is sent to that person's devices.
 *
 * Taking work is one statement each time: `UPDATE ... WHERE id IN (SELECT ...
 * FOR UPDATE SKIP LOCKED) RETURNING`. Two dispatchers running at once (the
 * request that just made the edit and the cron sweep) each get different rows,
 * and neither waits for the other or sends the same thing twice. The claim is a
 * lease, so a dispatcher that dies holding work only delays it by
 * `LEASE_MINUTES`, not for ever.
 *
 * The inbox does not depend on push being set up: a deployment with no VAPID
 * keys still fills everybody's inbox, and simply sends nothing to phones.
 */
export async function dispatchPending(
  db: PrismaClient,
): Promise<DispatchReport> {
  const report: DispatchReport = {
    notices: 0,
    notified: 0,
    pushes: 0,
    delivered: 0,
    pruned: 0,
    failed: 0,
  };
  await addressClassChanges(db, report);
  if (pushEnabled()) await sendPushes(db, report);
  return report;
}

/** Turns queued class-change notices into a notification per person concerned. */
async function addressClassChanges(db: PrismaClient, report: DispatchReport) {
  const claimed = await db.$queryRaw<ClaimedNotice[]>(Prisma.sql`
    UPDATE "ClassChangeNotice"
    SET "claimedAt" = NOW(), "attempts" = "attempts" + 1
    WHERE "id" IN (
      SELECT "id" FROM "ClassChangeNotice"
      WHERE "sentAt" IS NULL
        AND "attempts" < ${MAX_ATTEMPTS}
        AND "createdAt" > NOW() - make_interval(hours => ${STALE_HOURS}::int)
        AND ("claimedAt" IS NULL
             OR "claimedAt" < NOW() - make_interval(mins => ${LEASE_MINUTES}::int))
      ORDER BY "createdAt"
      LIMIT ${NOTICE_BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "title", "body", "url", "groupIds", "facultyIds"
  `);

  for (const notice of claimed) {
    report.notices += 1;
    // Who it concerns is read now, from the groups and teachers the edit
    // named: a student who joined the group since still hears about it.
    const people = await db.user.findMany({
      where: {
        isActive: true,
        isServiceAccount: false,
        OR: [
          {
            studentProfile: {
              memberships: { some: { groupId: { in: notice.groupIds } } },
            },
          },
          { facultyProfile: { id: { in: notice.facultyIds } } },
        ],
      },
      select: { id: true, orgId: true },
    });

    const byOrg = new Map<string, string[]>();
    for (const p of people) {
      byOrg.set(p.orgId, [...(byOrg.get(p.orgId) ?? []), p.id]);
    }
    for (const [orgId, userIds] of byOrg) {
      report.notified += await notify(db, userIds, {
        orgId,
        category: "CLASS_CHANGES",
        title: notice.title,
        body: notice.body,
        url: notice.url,
        // Keyed on the notice, so a dispatcher that dies after writing some of
        // these and is retried does not tell anybody twice.
        sourceKey: `class-change:${notice.id}`,
      });
    }

    await db.classChangeNotice.update({
      where: { id: notice.id },
      data: { sentAt: new Date() },
    });
  }
}

/** Sends every push that is owed, to each person's devices. */
async function sendPushes(db: PrismaClient, report: DispatchReport) {
  // A push that has waited past the point of being news is dropped rather than
  // left pending for ever. The row stays in the inbox either way.
  await db.$executeRaw(Prisma.sql`
    UPDATE "Notification" SET "pushPending" = false
    WHERE "pushPending"
      AND "createdAt" <= NOW() - make_interval(hours => ${STALE_HOURS}::int)
  `);

  const claimed = await db.$queryRaw<ClaimedPush[]>(Prisma.sql`
    UPDATE "Notification"
    SET "pushClaimedAt" = NOW(), "pushAttempts" = "pushAttempts" + 1
    WHERE "id" IN (
      SELECT "id" FROM "Notification"
      WHERE "pushPending"
        AND "pushAttempts" < ${MAX_ATTEMPTS}
        AND ("pushClaimedAt" IS NULL
             OR "pushClaimedAt" < NOW() - make_interval(mins => ${LEASE_MINUTES}::int))
      ORDER BY "createdAt"
      LIMIT ${PUSH_BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "userId", "title", "body"
  `);
  if (claimed.length === 0) return;

  const devices = await db.pushSubscription.findMany({
    where: { userId: { in: [...new Set(claimed.map((n) => n.userId))] } },
    select: {
      id: true,
      userId: true,
      endpoint: true,
      p256dh: true,
      auth: true,
    },
  });
  const devicesOf = new Map<string, typeof devices>();
  for (const d of devices) {
    devicesOf.set(d.userId, [...(devicesOf.get(d.userId) ?? []), d]);
  }

  const push = webPush();
  const dead = new Set<string>();
  for (const notification of claimed) {
    report.pushes += 1;
    const targets = (devicesOf.get(notification.userId) ?? []).filter(
      (d) => !dead.has(d.id),
    );
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      // Through the inbox, so opening it from the lock screen also marks it
      // read; the route then forwards to the page the news is about.
      url: `/api/notifications/${notification.id}/open`,
      // One tag per notification, so a device that is sent it twice shows it once.
      tag: notification.id,
    });

    let transient = false;
    for (let i = 0; i < targets.length; i += DEVICES_AT_ONCE) {
      const chunk = targets.slice(i, i + DEVICES_AT_ONCE);
      const results = await Promise.allSettled(
        chunk.map((d) =>
          push.sendNotification(
            { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
            payload,
            {
              TTL: 6 * 60 * 60,
              urgency: "high",
              topic: notification.id.slice(0, 32),
            },
          ),
        ),
      );
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          report.delivered += 1;
          return;
        }
        const status = (result.reason as { statusCode?: number }).statusCode;
        // 404/410: the browser has unsubscribed or the app was uninstalled.
        // The address will never work again, so it is forgotten.
        if (status === 404 || status === 410) dead.add(chunk[index]!.id);
        else {
          report.failed += 1;
          transient = true;
        }
      });
    }

    // A push with a transient failure stays owed and is retried when its lease
    // runs out, until it runs out of attempts; one that reached every device
    // it could, including none, is done.
    await db.notification.update({
      where: { id: notification.id },
      data: transient
        ? { pushClaimedAt: null }
        : { pushPending: false, pushedAt: new Date() },
    });
  }

  if (dead.size) {
    await db.pushSubscription.deleteMany({ where: { id: { in: [...dead] } } });
    report.pruned += dead.size;
  }
}

/** Sends a test notification to every device one person has enabled. */
export async function sendTest(
  db: PrismaClient,
  userId: string,
): Promise<{ sent: number }> {
  if (!pushEnabled()) return { sent: 0 };
  const push = webPush();
  const devices = await db.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    devices.map(async (d) => {
      try {
        await push.sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
          JSON.stringify({
            title: "Notifications are on",
            body: "You will hear about your classes and requests here.",
            url: "/notifications",
            tag: "plannr-test",
            kind: "TEST",
          }),
          { TTL: 60 },
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(d.id);
      }
    }),
  );
  if (dead.length) {
    await db.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  }
  return { sent };
}
