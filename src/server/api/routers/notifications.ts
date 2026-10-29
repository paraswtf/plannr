import { z } from "zod";

import {
  categoriesFor,
  DEFAULT_PREFERENCE,
  NOTIFICATION_CATEGORIES,
} from "~/lib/notifications";
import { pageArgs, pageInput, toPage } from "~/server/api/pagination";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { pushEnabled } from "~/server/services/push/config";

/**
 * Somebody's own notifications, and how they want to hear them.
 *
 * Like the push router beside it, every procedure is about the caller and
 * nobody else: an inbox is one person's to read and clear, and no permission
 * opens another's. What lands in it is decided where the news is made, by
 * `notify`; this router only reads it back and records the person's choices.
 */
export const notificationsRouter = createTRPCRouter({
  /**
   * The inbox, newest first.
   *
   * A small default page for a list, which `pageInput` warns against, and safe
   * here for the reason it is safe for the people directory: the inbox screen
   * has paged from its first day and names the page it wants every time, and
   * an inbox is read from the top.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          /** `unread` leaves out what has been opened or cleared. */
          filter: z.enum(["all", "unread"]).default("all"),
          ...pageInput({ defaultSize: 50, maxSize: 200 }),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        userId: ctx.actor.id,
        inInbox: true,
        ...(input.filter === "unread" ? { readAt: null } : {}),
      };
      const [rows, total] = await Promise.all([
        ctx.db.notification.findMany({
          where,
          select: {
            id: true,
            category: true,
            title: true,
            body: true,
            url: true,
            createdAt: true,
            readAt: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          ...pageArgs(input),
        }),
        ctx.db.notification.count({ where }),
      ]);
      return toPage(rows, total, input);
    }),

  /** The number on the Notifications tab. */
  unreadCount: protectedProcedure.query(async ({ ctx }) => ({
    count: await ctx.db.notification.count({
      where: { userId: ctx.actor.id, inInbox: true, readAt: null },
    }),
  })),

  /** Marks some of the caller's notifications read. Others' ids are ignored. */
  markRead: protectedProcedure
    .input(z.object({ ids: z.array(z.string().cuid()).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.notification.updateMany({
        where: { userId: ctx.actor.id, id: { in: input.ids }, readAt: null },
        data: { readAt: new Date() },
      });
      return { updated: count };
    }),

  /** Clears the whole inbox at once. */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const { count } = await ctx.db.notification.updateMany({
      where: { userId: ctx.actor.id, inInbox: true, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }),

  /**
   * The settings tab: every category this person can receive, with their
   * choice for each or the default where they have not made one.
   */
  preferences: protectedProcedure.query(async ({ ctx }) => {
    const chosen = await ctx.db.notificationPreference.findMany({
      where: { userId: ctx.actor.id },
      select: { category: true, inApp: true, push: true },
    });
    const byCategory = new Map(chosen.map((p) => [p.category, p]));
    return {
      /** Whether this deployment can push at all; the switches still save. */
      pushAvailable: pushEnabled(),
      categories: categoriesFor(ctx.actor.permissions).map((meta) => {
        const pref = byCategory.get(meta.category) ?? DEFAULT_PREFERENCE;
        return {
          category: meta.category,
          label: meta.label,
          description: meta.description,
          inApp: pref.inApp,
          push: pref.push,
        };
      }),
    };
  }),

  /** Changes how the caller hears about one category. Omitted switches stay as they are. */
  setPreference: protectedProcedure
    .input(
      z.object({
        category: z.enum(NOTIFICATION_CATEGORIES),
        inApp: z.boolean().optional(),
        push: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const change = {
        ...(input.inApp === undefined ? {} : { inApp: input.inApp }),
        ...(input.push === undefined ? {} : { push: input.push }),
      };
      const saved = await ctx.db.notificationPreference.upsert({
        where: {
          userId_category: { userId: ctx.actor.id, category: input.category },
        },
        update: change,
        create: {
          userId: ctx.actor.id,
          category: input.category,
          ...DEFAULT_PREFERENCE,
          ...change,
        },
        select: { category: true, inApp: true, push: true },
      });
      return saved;
    }),
});
