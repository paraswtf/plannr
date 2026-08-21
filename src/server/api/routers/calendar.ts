import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  disconnect,
  drainConnection,
  enqueueFullResync,
  syncEnabled,
} from "~/server/services/calendar/sync";
import { CalendarSyncStatus } from "../../../../generated/prisma";

/**
 * Somebody's own Google Calendar connection.
 *
 * Every procedure here is about the caller and nobody else — there is no
 * `asUserId`, and no permission opens one. An administrator may rearrange the
 * timetable, which is what puts classes in other people's calendars; that is
 * not the same as being able to reach into those calendars, and this router is
 * the second thing rather than the first.
 */
export const calendarRouter = createTRPCRouter({
  /** What the schedule screen needs to draw the sync control. */
  status: protectedProcedure.query(async ({ ctx }) => {
    if (!syncEnabled()) return { available: false as const };

    const connection = await ctx.db.calendarConnection.findUnique({
      where: { userId: ctx.actor.id },
      select: {
        googleEmail: true,
        status: true,
        syncedAt: true,
        lastError: true,
        calendarId: true,
      },
    });

    if (!connection || connection.status === CalendarSyncStatus.PAUSED) {
      return { available: true as const, connected: false as const };
    }

    // Work still owed, so the UI can say "catching up" rather than showing a
    // stale "last synced" and looking stuck.
    const pending = await ctx.db.calendarSyncTask.count({
      where: { connection: { userId: ctx.actor.id }, status: "PENDING" },
    });

    return {
      available: true as const,
      connected: true as const,
      email: connection.googleEmail,
      /** REVOKED needs a reconnect; the UI says so rather than silently idling. */
      revoked: connection.status === CalendarSyncStatus.REVOKED,
      syncedAt: connection.syncedAt,
      pending,
      lastError: connection.lastError,
    };
  }),

  /**
   * Brings the caller's own calendar up to date, now.
   *
   * Queues a full pass and then works it off in this request instead of leaving
   * it to the cron. That used to be the other way round, which was right when
   * the cron ran every minute; it drains hourly on Hobby now, and a button
   * called "Sync now" cannot mean "some time within the hour".
   *
   * The budget is deliberately short — a term's worth of classes is hundreds of
   * API calls and will not fit in one request. What it cannot finish stays
   * queued: `remaining` says how much, so the caller can ask again with
   * `resume`, and the cron completes it either way.
   */
  resync: protectedProcedure
    .input(z.object({ resume: z.boolean().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const connection = await ctx.db.calendarConnection.findUnique({
        where: { userId: ctx.actor.id },
        select: { id: true, status: true },
      });
      if (connection?.status !== CalendarSyncStatus.ACTIVE) {
        return { queued: 0, claimed: 0, changed: 0, remaining: 0 };
      }

      // Only the first press queues a pass. `enqueueFullResync` resets every task
      // for the connection to PENDING — including the ones just finished — so a
      // continuation that re-queued would re-arm the very queue it is draining,
      // and the count would rise and fall for ever instead of reaching zero.
      const queued = input?.resume
        ? 0
        : await enqueueFullResync(ctx.db, connection.id);
      const report = await drainConnection(ctx.db, connection.id);

      return {
        queued,
        /**
         * Tasks this pass actually took. Zero with work still `remaining` means
         * everything left is leased or backing off, so asking again immediately
         * would achieve nothing.
         */
        claimed: report.claimed,
        /** Entries actually written to Google, so the UI can stay quiet if none. */
        changed: report.inserted + report.patched + report.deleted,
        remaining: report.remaining,
      };
    }),

  /** Switches sync off and removes the calendar we created. */
  disconnect: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      await disconnect(ctx.db, ctx.actor.id);
      return { disconnected: true };
    }),
});
