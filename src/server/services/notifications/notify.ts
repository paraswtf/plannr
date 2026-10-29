import {
  DEFAULT_PREFERENCE,
  type NotificationCategory,
} from "~/lib/notifications";
import type { Db } from "../occurrences";
import { pushEnabled } from "../push/config";

/** One piece of news, before it is addressed to anybody. */
export interface News {
  orgId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /** A path inside the app. Opening the notification goes here. */
  url: string;
  /**
   * What this is news of. A person is told about the same key once, however
   * many times it is written: a retried dispatch, or two people pressing
   * Approve at the same moment.
   */
  sourceKey?: string;
}

/**
 * Puts one piece of news in each person's inbox, the way they asked to hear it.
 *
 * Call it inside the transaction that made the news, so the two commit
 * together or not at all. It writes rows and talks to nobody: pushes go out
 * after the response (`dispatchAfterResponse`), so a push service having a bad
 * minute can never fail the approval or the edit that caused them.
 *
 * Somebody who has switched both the inbox and push off for the category gets
 * no row. Somebody with only push on gets a row that is never listed, which is
 * what carries the push. Machine identities and switched-off accounts are left
 * out here, so no caller has to remember to.
 */
export async function notify(
  db: Db,
  userIds: Array<string | null | undefined>,
  news: News,
): Promise<number> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return 0;

  const [people, prefs] = await Promise.all([
    db.user.findMany({
      where: {
        id: { in: ids },
        orgId: news.orgId,
        isActive: true,
        isServiceAccount: false,
      },
      select: { id: true },
    }),
    db.notificationPreference.findMany({
      where: { userId: { in: ids }, category: news.category },
      select: { userId: true, inApp: true, push: true },
    }),
  ]);
  const chosen = new Map(prefs.map((p) => [p.userId, p]));
  const canPush = pushEnabled();

  const data = people.flatMap(({ id }) => {
    const pref = chosen.get(id) ?? DEFAULT_PREFERENCE;
    const push = canPush && pref.push;
    if (!pref.inApp && !push) return [];
    return [
      {
        orgId: news.orgId,
        userId: id,
        category: news.category,
        title: news.title,
        body: news.body,
        url: news.url,
        sourceKey: news.sourceKey ?? null,
        inInbox: pref.inApp,
        pushPending: push,
      },
    ];
  });
  if (data.length === 0) return 0;

  const { count } = await db.notification.createMany({
    data,
    skipDuplicates: true,
  });
  if (data.some((row) => row.pushPending)) await dispatchAfterResponse();
  return count;
}

/**
 * Asks for what is queued to be delivered once the response has gone.
 *
 * `after` runs when the request has finished, which is after its transaction
 * committed; if it rolled back, nothing was queued and the dispatcher finds
 * nothing. Outside a request (a script, a test) there is no `after`, and the
 * hourly cron sweep delivers instead.
 */
export async function dispatchAfterResponse() {
  try {
    const { after } = await import("next/server");
    after(async () => {
      const [{ db }, { dispatchPending }] = await Promise.all([
        import("~/server/db"),
        import("../push/dispatch"),
      ]);
      await dispatchPending(db).catch(() => undefined);
    });
  } catch {
    // Not inside a request: left for the cron.
  }
}
