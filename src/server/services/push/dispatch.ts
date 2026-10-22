import { Prisma, type PrismaClient } from "../../../../generated/prisma";
import { pushEnabled, webPush } from "./config";

/** How long a taken notice stays taken if its dispatcher dies mid-send. */
const LEASE_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const BATCH = 20;
/** Notices older than this are news no longer: a missed class is not alerted a day later. */
const STALE_HOURS = 24;
const DEVICES_AT_ONCE = 25;

interface Claimed {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string;
  groupIds: string[];
  facultyIds: string[];
}

export interface DispatchReport {
  notices: number;
  delivered: number;
  pruned: number;
  failed: number;
}

/**
 * Sends the notices that are waiting.
 *
 * Taking a notice is one statement: `UPDATE ... WHERE id IN (SELECT ... FOR
 * UPDATE SKIP LOCKED) RETURNING`. Two dispatchers running at once (the request
 * that just made the edit and the cron sweep) each get different rows, and
 * neither waits for the other or sends the same notice twice. `claimedAt` is a
 * lease, so a dispatcher that dies holding a notice only delays it by
 * `LEASE_MINUTES`, not for ever.
 */
export async function dispatchPending(
  db: PrismaClient,
): Promise<DispatchReport> {
  const report: DispatchReport = {
    notices: 0,
    delivered: 0,
    pruned: 0,
    failed: 0,
  };
  if (!pushEnabled()) return report;

  const claimed = await db.$queryRaw<Claimed[]>(Prisma.sql`
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
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "kind", "title", "body", "url", "groupIds", "facultyIds"
  `);

  const push = webPush();
  for (const notice of claimed) {
    report.notices += 1;

    const devices = await db.pushSubscription.findMany({
      where: {
        user: {
          isActive: true,
          OR: [
            {
              studentProfile: {
                memberships: { some: { groupId: { in: notice.groupIds } } },
              },
            },
            { facultyProfile: { id: { in: notice.facultyIds } } },
          ],
        },
      },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    const payload = JSON.stringify({
      title: notice.title,
      body: notice.body,
      url: notice.url,
      // One tag per notice, so a device that is sent it twice shows it once.
      tag: notice.id,
      kind: notice.kind,
    });

    let transient = false;
    for (let i = 0; i < devices.length; i += DEVICES_AT_ONCE) {
      const chunk = devices.slice(i, i + DEVICES_AT_ONCE);
      const results = await Promise.allSettled(
        chunk.map((d) =>
          push.sendNotification(
            { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
            payload,
            {
              TTL: 6 * 60 * 60,
              urgency: "high",
              topic: notice.id.slice(0, 32),
            },
          ),
        ),
      );

      const dead: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          report.delivered += 1;
          return;
        }
        const status = (result.reason as { statusCode?: number }).statusCode;
        // 404/410: the browser has unsubscribed or the app was uninstalled.
        // The address will never work again, so it is forgotten.
        if (status === 404 || status === 410) dead.push(chunk[index]!.id);
        else {
          report.failed += 1;
          transient = true;
        }
      });
      if (dead.length) {
        await db.pushSubscription.deleteMany({ where: { id: { in: dead } } });
        report.pruned += dead.length;
      }
    }

    // A notice with a transient failure stays open and is retried when its
    // lease runs out; one that reached everybody it could is done.
    if (!transient) {
      await db.classChangeNotice.update({
        where: { id: notice.id },
        data: { sentAt: new Date() },
      });
    }
  }

  return report;
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
            body: "You will hear about changes to your classes here.",
            url: "/schedule",
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
