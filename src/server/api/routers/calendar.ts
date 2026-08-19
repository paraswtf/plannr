import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  disconnect,
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
   * Queues a full pass over the caller's own calendar.
   *
   * Enqueues rather than syncing inline: a term's worth of classes is hundreds
   * of API calls, which is not something to hold an HTTP request open for. The
   * cron picks it up on its next minute.
   */
  resync: protectedProcedure.mutation(async ({ ctx }) => {
    const connection = await ctx.db.calendarConnection.findUnique({
      where: { userId: ctx.actor.id },
      select: { id: true, status: true },
    });
    if (connection?.status !== CalendarSyncStatus.ACTIVE) return { queued: 0 };
    const queued = await enqueueFullResync(ctx.db, connection.id);
    return { queued };
  }),

  /** Switches sync off and removes the calendar we created. */
  disconnect: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      await disconnect(ctx.db, ctx.actor.id);
      return { disconnected: true };
    }),
});
