import { z } from "zod";

import { PermissionFlags } from "~/lib/permissions";
import {
  createTRPCRouter,
  permissionProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { OCCUPYING_STATUSES } from "~/server/services/conflicts";
import { findNextFreeSlot } from "~/server/services/free-slots";
import { RoomFeature, RoomType } from "../../../../generated/prisma";

const roomInput = z.object({
  code: z.string().min(1).max(32),
  buildingId: z.string().cuid(),
  floor: z.number().int().min(-2).max(50),
  capacity: z.number().int().min(1).max(2000),
  type: z.nativeEnum(RoomType),
  features: z.array(z.nativeEnum(RoomFeature)).default([]),
  notes: z.string().max(500).optional(),
});

export const roomsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          query: z.string().trim().optional(),
          buildingId: z.string().cuid().optional(),
          type: z.nativeEnum(RoomType).optional(),
          minCapacity: z.number().int().min(0).optional(),
          features: z.array(z.nativeEnum(RoomFeature)).optional(),
          includeInactive: z.boolean().default(false),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.room.findMany({
        where: {
          orgId: ctx.orgId,
          ...(input.includeInactive ? {} : { isActive: true }),
          ...(input.buildingId ? { buildingId: input.buildingId } : {}),
          ...(input.type ? { type: input.type } : {}),
          ...(input.minCapacity
            ? { capacity: { gte: input.minCapacity } }
            : {}),
          ...(input.features?.length
            ? { features: { hasEvery: input.features } }
            : {}),
          ...(input.query
            ? {
                OR: [
                  {
                    code: {
                      contains: input.query,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    notes: {
                      contains: input.query,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              }
            : {}),
        },
        include: { building: { select: { id: true, name: true } } },
        orderBy: [{ building: { name: "asc" } }, { code: "asc" }],
      });
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.room.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        include: { building: true },
      });
    }),

  /** Rooms with nothing booked in the given window — the Book screen's filter. */
  availability: protectedProcedure
    .input(
      z.object({
        from: z.date(),
        to: z.date(),
        buildingId: z.string().cuid().optional(),
        type: z.nativeEnum(RoomType).optional(),
        minCapacity: z.number().int().min(0).optional(),
        features: z.array(z.nativeEnum(RoomFeature)).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.room.findMany({
        where: {
          orgId: ctx.orgId,
          isActive: true,
          ...(input.buildingId ? { buildingId: input.buildingId } : {}),
          ...(input.type ? { type: input.type } : {}),
          ...(input.minCapacity
            ? { capacity: { gte: input.minCapacity } }
            : {}),
          ...(input.features?.length
            ? { features: { hasEvery: input.features } }
            : {}),
          occurrences: {
            none: {
              status: { in: [...OCCUPYING_STATUSES] },
              start: { lt: input.to },
              end: { gt: input.from },
            },
          },
        },
        include: { building: { select: { id: true, name: true } } },
        orderBy: [{ building: { name: "asc" } }, { code: "asc" }],
      });
    }),

  /** Powers the "use next free slot" button on the conflict banner. */
  nextFreeSlot: protectedProcedure
    .input(
      z.object({
        roomId: z.string().cuid(),
        after: z.date(),
        durationMinutes: z
          .number()
          .int()
          .min(15)
          .max(12 * 60),
        ignoreEventId: z.string().cuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return findNextFreeSlot(ctx.db, {
        orgId: ctx.orgId,
        roomId: input.roomId,
        after: input.after,
        durationMinutes: input.durationMinutes,
        ignoreEventId: input.ignoreEventId,
      });
    }),

  create: permissionProcedure(PermissionFlags.ManageRooms)
    .input(roomInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.room.create({
        data: { ...input, orgId: ctx.orgId },
      });
    }),

  update: permissionProcedure(PermissionFlags.ManageRooms)
    .input(roomInput.partial().extend({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      // Scope the update by org so an id from another tenant cannot be touched.
      const { count } = await ctx.db.room.updateMany({
        where: { id, orgId: ctx.orgId },
        data: patch,
      });
      if (count === 0) throw new Error("Room not found");
      return ctx.db.room.findUniqueOrThrow({ where: { id } });
    }),

  /**
   * What would be lost by deleting this room. The UI shows this before asking
   * for confirmation, matching the cascade warnings in the previous app.
   */
  deleteImpact: permissionProcedure(PermissionFlags.ManageRooms)
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const [eventCount, upcomingCount] = await Promise.all([
        ctx.db.event.count({ where: { roomId: input.id, orgId: ctx.orgId } }),
        ctx.db.eventOccurrence.count({
          where: {
            roomId: input.id,
            orgId: ctx.orgId,
            start: { gte: new Date() },
            status: { in: [...OCCUPYING_STATUSES] },
          },
        }),
      ]);
      return { eventCount, upcomingCount };
    }),

  /**
   * Rooms with history are archived rather than deleted, so past timetables stay
   * readable. `force` deletes the events too, and is only reachable after the
   * impact dialog.
   */
  archive: permissionProcedure(PermissionFlags.ManageRooms)
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.room.updateMany({
        where: { id: input.id, orgId: ctx.orgId },
        data: { isActive: false },
      });
      return { archived: true };
    }),

  delete: permissionProcedure(PermissionFlags.ManageRooms)
    .input(
      z.object({ id: z.string().cuid(), force: z.boolean().default(false) }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const room = await tx.room.findFirst({
          where: { id: input.id, orgId: ctx.orgId },
          select: { id: true },
        });
        if (!room) throw new Error("Room not found");

        const eventCount = await tx.event.count({ where: { roomId: room.id } });
        if (eventCount > 0) {
          if (!input.force) {
            throw new Error(
              `This room has ${eventCount} scheduled event(s). Archive it, or confirm deletion.`,
            );
          }
          // Occurrences cascade from their events.
          await tx.event.deleteMany({ where: { roomId: room.id } });
        }

        await tx.room.delete({ where: { id: room.id } });
        return { deleted: true, deletedEvents: eventCount };
      });
    }),
});

export const buildingsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.building.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { name: "asc" },
      include: { _count: { select: { rooms: true } } },
    });
  }),

  create: permissionProcedure(PermissionFlags.ManageRooms)
    .input(z.object({ name: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.building.create({
        data: { name: input.name, orgId: ctx.orgId },
      });
    }),

  update: permissionProcedure(PermissionFlags.ManageRooms)
    .input(
      z.object({ id: z.string().cuid(), name: z.string().min(1).max(120) }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.building.updateMany({
        where: { id: input.id, orgId: ctx.orgId },
        data: { name: input.name },
      });
      return ctx.db.building.findUniqueOrThrow({ where: { id: input.id } });
    }),

  delete: permissionProcedure(PermissionFlags.ManageRooms)
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const rooms = await ctx.db.room.count({
        where: { buildingId: input.id },
      });
      if (rooms > 0) {
        throw new Error(
          `This building still has ${rooms} room(s). Move or delete them first.`,
        );
      }
      await ctx.db.building.deleteMany({
        where: { id: input.id, orgId: ctx.orgId },
      });
      return { deleted: true };
    }),
});
