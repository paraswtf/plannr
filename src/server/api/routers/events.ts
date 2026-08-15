import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { PermissionFlags } from "~/lib/permissions";
import { describeRRule, validateRRule } from "~/lib/recurrence";
import {
  createTRPCRouter,
  permissionProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  checkCapacity,
  checkConflicts,
  hasHardConflict,
  type Conflict,
} from "~/server/services/conflicts";
import {
  regenerateOccurrences,
  splitSeriesAt,
  type Db,
} from "~/server/services/occurrences";
import {
  EventKind,
  EventStatus,
  ExceptionType,
} from "../../../../generated/prisma";

/**
 * Writes go through here. The invariant the whole read path depends on: any
 * change to an event or its exceptions regenerates that event's occurrences
 * inside the same transaction.
 */

const scopeInput = z.enum(["occurrence", "following", "series"]);

const createInput = z.object({
  kind: z.nativeEnum(EventKind).default(EventKind.BOOKING),
  title: z.string().min(1).max(160),
  roomId: z.string().cuid(),
  /**
   * Every group attending. A combined lecture lists several; the first is the
   * one denormalised onto the event and its occurrences, so the existing read
   * paths keep working unchanged.
   */
  groupIds: z.array(z.string().cuid()).max(20).optional(),
  groupId: z.string().cuid().nullish(),
  /** The subject being taught. A class has one; a room booking does not. */
  courseId: z.string().cuid().nullish(),
  facultyId: z.string().cuid().nullish(),
  semesterId: z.string().cuid().nullish(),
  startTime: z.date(),
  endTime: z.date(),
  rrule: z.string().max(400).nullish(),
  notes: z.string().max(1000).nullish(),
  /**
   * Dates of the series to leave out, as the rule would have produced them.
   * How a clash on three Tuesdays out of twelve is settled without giving up
   * the other nine.
   */
  skipDates: z.array(z.date()).max(100).optional(),
});

/** Conflicts a client may safely be shown; the raw error carries the same list. */
function conflictError(conflicts: Conflict[]): TRPCError {
  const first = conflicts.find((c) => c.severity === "hard");
  return new TRPCError({
    code: "CONFLICT",
    message: first?.message ?? "That slot is no longer free.",
    cause: conflicts,
  });
}

async function orgTimezone(db: Db, orgId: string) {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true },
  });
  return org?.timezone ?? "Asia/Kolkata";
}

export const eventsRouter = createTRPCRouter({
  byId: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const event = await ctx.db.event.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        include: {
          room: { include: { building: true } },
          group: true,
          faculty: { include: { user: { select: { name: true } } } },
          exceptions: true,
        },
      });
      if (!event) return null;
      return {
        ...event,
        recurrenceText: event.rrule ? describeRRule(event.rrule) : null,
      };
    }),

  /** Live preflight for the booking form's conflict banner. */
  checkConflicts: protectedProcedure
    .input(
      createInput
        .pick({
          roomId: true,
          groupId: true,
          groupIds: true,
          facultyId: true,
          startTime: true,
          endTime: true,
          rrule: true,
        })
        .extend({ excludeEventId: z.string().cuid().optional() }),
    )
    .query(async ({ ctx, input }) => {
      const timezone = await orgTimezone(ctx.db, ctx.orgId);
      const [conflicts, capacity] = await Promise.all([
        checkConflicts(ctx.db, {
          orgId: ctx.orgId,
          roomId: input.roomId,
          groupId: input.groupId,
          groupIds: input.groupIds,
          facultyId: input.facultyId,
          startTime: input.startTime,
          endTime: input.endTime,
          timezone,
          rrule: input.rrule,
          excludeEventId: input.excludeEventId,
        }),
        checkCapacity(ctx.db, {
          roomId: input.roomId,
          groupId: input.groupId,
        }),
      ]);
      return capacity ? [...conflicts, capacity] : conflicts;
    }),

  create: protectedProcedure
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      if (input.endTime <= input.startTime) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The end time must be after the start time.",
        });
      }

      const settings = await ctx.db.orgSettings.findUniqueOrThrow({
        where: { orgId: ctx.orgId },
      });
      const timezone = await orgTimezone(ctx.db, ctx.orgId);

      // A class is institutional scheduling; a booking is a request for a room.
      const isClass = input.kind === EventKind.CLASS;
      if (isClass && !ctx.bits.hasAny(PermissionFlags.ManageAllEvents)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only schedulers can add classes to the timetable.",
        });
      }
      if (!isClass && !ctx.bits.has(PermissionFlags.BookRoom)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to book rooms.",
        });
      }

      // The self-booking limits exist to stop students holding rooms all day.
      // They are keyed on capability rather than on holding the student role,
      // so someone who teaches *and* studies is not caught by them.
      const isSelfServeBooking =
        !isClass && !ctx.bits.has(PermissionFlags.ManageAllEvents);
      if (isSelfServeBooking) {
        if (!settings.allowStudentSelfBooking) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Self-service room booking is currently switched off.",
          });
        }
        const minutes =
          (input.endTime.getTime() - input.startTime.getTime()) / 60_000;
        if (minutes > settings.maxStudentBookingMinutes) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Self-service bookings are limited to ${settings.maxStudentBookingMinutes} minutes.`,
          });
        }
      }

      if (input.rrule) {
        const check = validateRRule(input.rrule, {
          startTime: input.startTime,
          endTime: input.endTime,
          timezone,
        });
        if (!check.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: check.error });
        }
      }

      // Self-service requests wait for sign-off when the setting demands it.
      // Anyone who can approve bookings skips the queue, since they would only
      // be approving their own request.
      const status =
        isSelfServeBooking &&
        settings.requireApprovalStudentBookings &&
        !ctx.bits.has(PermissionFlags.ApproveBookings)
          ? EventStatus.PENDING
          : EventStatus.CONFIRMED;

      // One list of groups from here on: whichever way the caller expressed it,
      // the first is the primary and the rest ride along on the join table.
      const groupIds = [
        ...new Set(
          [
            ...(input.groupIds ?? []),
            ...(input.groupId ? [input.groupId] : []),
          ].filter(Boolean),
        ),
      ];
      const primaryGroupId = groupIds[0] ?? null;

      // A class is a group being taught. Without one it is a room booking with
      // a lecture's name on it, and nothing downstream — attendance, a group's
      // own timetable — has anything to attach to.
      if (isClass && !primaryGroupId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A class needs at least one group attending it.",
        });
      }

      if (groupIds.length > 0) {
        const known = await ctx.db.group.count({
          where: { id: { in: groupIds }, orgId: ctx.orgId },
        });
        if (known !== groupIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One of those groups does not exist.",
          });
        }
      }

      const skipped = new Set(
        (input.skipDates ?? []).map((date) => date.getTime()),
      );

      return ctx.db.$transaction(async (tx) => {
        // Re-checked inside the transaction: the client's preflight is a
        // courtesy, not a guarantee, and the slot may have gone since.
        const found = await checkConflicts(tx, {
          orgId: ctx.orgId,
          roomId: input.roomId,
          groupId: primaryGroupId,
          groupIds,
          facultyId: input.facultyId,
          startTime: input.startTime,
          endTime: input.endTime,
          timezone,
          rrule: input.rrule,
        });
        // A date being skipped is not booked, so whatever it clashed with is
        // no longer this event's problem.
        const conflicts = found.filter(
          (c) => !c.candidate || !skipped.has(c.candidate.start.getTime()),
        );
        if (settings.blockConflicts && hasHardConflict(conflicts)) {
          throw conflictError(conflicts);
        }

        const event = await tx.event.create({
          data: {
            orgId: ctx.orgId,
            kind: input.kind,
            status,
            title: input.title,
            roomId: input.roomId,
            groupId: primaryGroupId,
            courseId: input.courseId ?? null,
            facultyId: input.facultyId ?? null,
            semesterId: input.semesterId ?? null,
            createdById: ctx.actor.id,
            startTime: input.startTime,
            endTime: input.endTime,
            timezone,
            rrule: input.rrule ?? null,
            notes: input.notes ?? null,
          },
        });

        if (groupIds.length > 0) {
          await tx.eventGroup.createMany({
            data: groupIds.map((groupId) => ({ eventId: event.id, groupId })),
          });
        }

        // Skipped dates are recorded the same way a cancelled occurrence is, so
        // the series stays one event and the gaps are visible as exceptions.
        if (skipped.size > 0) {
          await tx.eventException.createMany({
            data: [...skipped].map((time) => ({
              eventId: event.id,
              originalStart: new Date(time),
              type: ExceptionType.CANCELLED,
              reason: "Skipped when the series was booked",
            })),
          });
        }
        await regenerateOccurrences(tx, event.id);

        return {
          event,
          skipped: skipped.size,
          warnings: conflicts.filter((c) => c.severity === "warning"),
        };
      });
    }),

  /** Moves, resizes or retimes an event. Drag interactions land here too. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        scope: scopeInput.default("series"),
        /** Identifies which occurrence, for non-series scopes. */
        originalStart: z.date().optional(),
        patch: z.object({
          title: z.string().min(1).max(160).optional(),
          roomId: z.string().cuid().optional(),
          startTime: z.date().optional(),
          endTime: z.date().optional(),
          facultyId: z.string().cuid().nullish(),
          groupId: z.string().cuid().nullish(),
          courseId: z.string().cuid().nullish(),
          rrule: z.string().max(400).nullish(),
          notes: z.string().max(1000).nullish(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.event.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMayEdit(ctx, event);

      if (input.scope !== "series" && !input.originalStart) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Editing a single occurrence needs the occurrence's date.",
        });
      }

      const settings = await ctx.db.orgSettings.findUniqueOrThrow({
        where: { orgId: ctx.orgId },
      });

      const startTime = input.patch.startTime ?? event.startTime;
      const endTime = input.patch.endTime ?? event.endTime;
      if (endTime <= startTime) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The end time must be after the start time.",
        });
      }

      return ctx.db.$transaction(async (tx) => {
        const conflicts = await checkConflicts(tx, {
          orgId: ctx.orgId,
          roomId: input.patch.roomId ?? event.roomId,
          groupId:
            input.patch.groupId === undefined
              ? event.groupId
              : input.patch.groupId,
          facultyId:
            input.patch.facultyId === undefined
              ? event.facultyId
              : input.patch.facultyId,
          startTime,
          endTime,
          timezone: event.timezone,
          // A single-occurrence edit only occupies one slot, whatever the rule.
          rrule:
            input.scope === "occurrence"
              ? null
              : (input.patch.rrule ?? event.rrule),
          excludeEventId: event.id,
        });
        if (settings.blockConflicts && hasHardConflict(conflicts)) {
          throw conflictError(conflicts);
        }

        if (input.scope === "occurrence") {
          await tx.eventException.upsert({
            where: {
              eventId_originalStart: {
                eventId: event.id,
                originalStart: input.originalStart!,
              },
            },
            update: {
              type: ExceptionType.MODIFIED,
              newStartTime: input.patch.startTime ?? null,
              newEndTime: input.patch.endTime ?? null,
              newRoomId: input.patch.roomId ?? null,
              newTitle: input.patch.title ?? null,
              newFacultyId: input.patch.facultyId ?? null,
            },
            create: {
              eventId: event.id,
              originalStart: input.originalStart!,
              type: ExceptionType.MODIFIED,
              newStartTime: input.patch.startTime ?? null,
              newEndTime: input.patch.endTime ?? null,
              newRoomId: input.patch.roomId ?? null,
              newTitle: input.patch.title ?? null,
              newFacultyId: input.patch.facultyId ?? null,
            },
          });
          await regenerateOccurrences(tx, event.id);
          return { eventId: event.id, scope: input.scope };
        }

        if (input.scope === "following") {
          const newId = await splitSeriesAt(
            tx,
            event.id,
            input.originalStart!,
            {
              title: input.patch.title,
              roomId: input.patch.roomId,
              groupId: input.patch.groupId,
              facultyId: input.patch.facultyId,
              startTime: input.patch.startTime,
              endTime: input.patch.endTime,
              notes: input.patch.notes,
            },
          );
          return { eventId: newId, scope: input.scope };
        }

        await tx.event.update({
          where: { id: event.id },
          data: {
            title: input.patch.title,
            roomId: input.patch.roomId,
            startTime: input.patch.startTime,
            endTime: input.patch.endTime,
            facultyId: input.patch.facultyId,
            groupId: input.patch.groupId,
            courseId: input.patch.courseId,
            rrule: input.patch.rrule,
            notes: input.patch.notes,
          },
        });
        await regenerateOccurrences(tx, event.id);
        return { eventId: event.id, scope: input.scope };
      });
    }),

  cancel: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        scope: scopeInput.default("series"),
        originalStart: z.date().optional(),
        reason: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.event.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMayEdit(ctx, event);

      return ctx.db.$transaction(async (tx) => {
        if (input.scope === "occurrence") {
          if (!input.originalStart) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cancelling one occurrence needs its date.",
            });
          }
          await tx.eventException.upsert({
            where: {
              eventId_originalStart: {
                eventId: event.id,
                originalStart: input.originalStart,
              },
            },
            update: { type: ExceptionType.CANCELLED, reason: input.reason },
            create: {
              eventId: event.id,
              originalStart: input.originalStart,
              type: ExceptionType.CANCELLED,
              reason: input.reason,
            },
          });
          await regenerateOccurrences(tx, event.id);
          return { cancelled: 1 };
        }

        if (input.scope === "following" && input.originalStart && event.rrule) {
          // Truncate rather than delete, so past occurrences survive.
          const { setUntil } = await import("~/lib/recurrence");
          await tx.event.update({
            where: { id: event.id },
            data: {
              rrule: setUntil(
                event.rrule,
                new Date(input.originalStart.getTime() - 60_000),
                event.timezone,
              ),
            },
          });
          const { written } = await regenerateOccurrences(tx, event.id);
          return { cancelled: written };
        }

        await tx.event.update({
          where: { id: event.id },
          data: { status: EventStatus.CANCELLED },
        });
        await regenerateOccurrences(tx, event.id);
        return { cancelled: "series" as const };
      });
    }),

  /** Restores a single cancelled occurrence by dropping its exception. */
  restoreOccurrence: protectedProcedure
    .input(z.object({ id: z.string().cuid(), originalStart: z.date() }))
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.event.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMayEdit(ctx, event);

      return ctx.db.$transaction(async (tx) => {
        await tx.eventException.deleteMany({
          where: {
            eventId: event.id,
            originalStart: input.originalStart,
            type: ExceptionType.CANCELLED,
          },
        });
        await regenerateOccurrences(tx, event.id);
        return { restored: true };
      });
    }),

  pendingApprovals: permissionProcedure(PermissionFlags.ApproveBookings).query(
    async ({ ctx }) => {
      return ctx.db.event.findMany({
        where: {
          orgId: ctx.orgId,
          status: EventStatus.PENDING,
          kind: EventKind.BOOKING,
        },
        include: {
          room: { select: { code: true, capacity: true } },
          createdBy: { select: { name: true, email: true } },
        },
        orderBy: { startTime: "asc" },
      });
    },
  ),

  approve: permissionProcedure(PermissionFlags.ApproveBookings)
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const settings = await ctx.db.orgSettings.findUniqueOrThrow({
        where: { orgId: ctx.orgId },
      });

      return ctx.db.$transaction(async (tx) => {
        const event = await tx.event.findFirst({
          where: { id: input.id, orgId: ctx.orgId },
        });
        if (!event) throw new TRPCError({ code: "NOT_FOUND" });

        // The slot may have been taken while the request sat in the queue, so
        // approving re-checks rather than trusting the original preflight.
        const conflicts = await checkConflicts(tx, {
          orgId: ctx.orgId,
          roomId: event.roomId,
          groupId: event.groupId,
          facultyId: event.facultyId,
          startTime: event.startTime,
          endTime: event.endTime,
          timezone: event.timezone,
          rrule: event.rrule,
          excludeEventId: event.id,
        });
        if (settings.blockConflicts && hasHardConflict(conflicts)) {
          throw conflictError(conflicts);
        }

        await tx.event.update({
          where: { id: event.id },
          data: { status: EventStatus.CONFIRMED },
        });
        await regenerateOccurrences(tx, event.id);
        return { approved: true };
      });
    }),

  reject: permissionProcedure(PermissionFlags.ApproveBookings)
    .input(
      z.object({
        id: z.string().cuid(),
        reason: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        await tx.event.updateMany({
          where: { id: input.id, orgId: ctx.orgId },
          data: { status: EventStatus.REJECTED, notes: input.reason },
        });
        await regenerateOccurrences(tx, input.id);
        return { rejected: true };
      });
    }),

  myBookings: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.event.findMany({
      where: {
        orgId: ctx.orgId,
        createdById: ctx.actor.id,
        kind: EventKind.BOOKING,
        status: { in: [EventStatus.CONFIRMED, EventStatus.PENDING] },
      },
      include: { room: { select: { code: true } } },
      orderBy: { startTime: "asc" },
    });
  }),
});

/**
 * Schedulers may edit anything; faculty may edit what they teach or booked
 * themselves. Everyone else may not.
 */
async function assertMayEdit(
  ctx: {
    bits: { hasAny: (...flags: bigint[]) => boolean };
    actor: { id: string };
    db: Db;
  },
  event: { facultyId: string | null; createdById: string | null },
) {
  if (ctx.bits.hasAny(PermissionFlags.ManageAllEvents)) return;

  if (ctx.bits.hasAny(PermissionFlags.ManageOwnEvents)) {
    if (event.createdById === ctx.actor.id) return;
    if (event.facultyId) {
      const profile = await ctx.db.facultyProfile.findUnique({
        where: { userId: ctx.actor.id },
        select: { id: true },
      });
      if (profile?.id === event.facultyId) return;
    }
  }

  if (event.createdById === ctx.actor.id) return;

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "You can only change events you teach or booked yourself.",
  });
}
