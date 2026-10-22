import { z } from "zod";

import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { pushEnabled } from "~/server/services/push/config";
import { sendTest } from "~/server/services/push/dispatch";

/**
 * Somebody's own notification devices.
 *
 * Like the calendar connection, every procedure is about the caller and
 * nobody else: a phone is one person's to enable and no permission opens
 * another's. What gets sent to it is decided elsewhere, by whose classes
 * changed; this router only decides whether a device is listening.
 */
export const pushRouter = createTRPCRouter({
  /** What the settings screen needs to decide whether to offer anything. */
  config: protectedProcedure.query(async ({ ctx }) => {
    if (!pushEnabled()) return { available: false as const };
    const devices = await ctx.db.pushSubscription.count({
      where: { userId: ctx.actor.id },
    });
    return {
      available: true as const,
      publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      devices,
    };
  }),

  /**
   * Registers this browser. Keyed on the push endpoint, which is unique to the
   * browser, so a second person signing in on the same phone takes the row over
   * instead of leaving the first person's notifications arriving on it.
   */
  subscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url().max(1000),
        keys: z.object({
          p256dh: z.string().min(1).max(200),
          auth: z.string().min(1).max(100),
        }),
        userAgent: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!pushEnabled()) return { ok: false as const };
      await ctx.db.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        update: {
          userId: ctx.actor.id,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent ?? null,
          lastSeenAt: new Date(),
        },
        create: {
          userId: ctx.actor.id,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent ?? null,
        },
      });
      return { ok: true as const };
    }),

  /** Stops notifications on one browser. Only the caller's own can be removed. */
  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().url().max(1000) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.pushSubscription.deleteMany({
        where: { endpoint: input.endpoint, userId: ctx.actor.id },
      });
      return { ok: true as const };
    }),

  /** Sends a notification to every device the caller has enabled, to prove it works. */
  sendTest: protectedProcedure.mutation(({ ctx }) =>
    sendTest(ctx.db, ctx.actor.id),
  ),
});
