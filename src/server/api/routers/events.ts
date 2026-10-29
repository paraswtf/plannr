import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { PermissionFlags } from "~/lib/permissions";
import { describeRRule, validateRRule } from "~/lib/recurrence";
import {
  pageArgs,
  pageInput,
  toPage,
  wholeList,
} from "~/server/api/pagination";
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
  lockResources,
  notifyBookingDecided,
  notifyBookingRequested,
  notifyChangeDecided,
  notifyChangeRequested,
  proposedSlots,
  verdictFor,
  verdictSeverity,
  type Verdict,
} from "~/server/services/approvals";
import {
  regenerateOccurrences,
  splitSeriesAt,
  type Db,
} from "~/server/services/occurrences";
import {
  EventKind,
  EventStatus,
  ExceptionType,
  RequestScope,
  RequestStatus,
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

        if (event.status === EventStatus.PENDING) {
          await notifyBookingRequested(tx, event, ctx.actor.id);
        }

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

      // Somebody without institutional authority may still change a booking of
      // their own that nobody has granted yet — it is a request either way, and
      // amending it before it is decided is not a change to anybody's day. The
      // limits still apply, or a two-hour cap is escaped by booking for one
      // hour and then editing it to eight.
      const ownUndecidedBooking =
        event.status === EventStatus.PENDING &&
        event.createdById === ctx.actor.id;
      const mayWriteDirectly =
        ctx.bits.hasAny(PermissionFlags.ManageAllEvents) ||
        !settings.requireApprovalChanges ||
        ownUndecidedBooking;

      if (!ctx.bits.hasAny(PermissionFlags.ManageAllEvents)) {
        const minutes = (endTime.getTime() - startTime.getTime()) / 60_000;
        if (
          event.kind !== EventKind.CLASS &&
          minutes > settings.maxStudentBookingMinutes
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Self-service bookings are limited to ${settings.maxStudentBookingMinutes} minutes.`,
          });
        }
      }

      // Not authorised to write, so it becomes a proposal instead. The event
      // goes on being what it is until somebody decides.
      if (!mayWriteDirectly) {
        const request = await ctx.db.$transaction(async (tx) => {
          const filed = await tx.eventChangeRequest.create({
            data: {
              orgId: ctx.orgId,
              eventId: event.id,
              requestedById: ctx.actor.id,
              scope:
                RequestScope[
                  input.scope.toUpperCase() as keyof typeof RequestScope
                ],
              originalStart: input.originalStart ?? null,
              newRoomId: input.patch.roomId ?? null,
              newStartTime: input.patch.startTime ?? null,
              newEndTime: input.patch.endTime ?? null,
              newTitle: input.patch.title ?? null,
              reason: input.patch.notes ?? null,
            },
          });
          await notifyChangeRequested(tx, { ...filed, event });
          return filed;
        });
        return {
          eventId: event.id,
          scope: input.scope,
          applied: false as const,
          requestId: request.id,
        };
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
          return {
            eventId: event.id,
            scope: input.scope,
            applied: true as const,
          };
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
          return { eventId: newId, scope: input.scope, applied: true as const };
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
        return {
          eventId: event.id,
          scope: input.scope,
          applied: true as const,
        };
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

  pendingApprovals: permissionProcedure(PermissionFlags.ApproveBookings)
    .input(
      z
        .object({
          /**
           * A work list is only ever as long as the decisions nobody has made
           * yet, and a term of that at a real college is tens of requests. Two
           * hundred covers a queue that has been left alone all year, so a
           * client that renders it whole — which is the only way anybody reads
           * a queue — does not lose the request at the bottom of it.
           */
          ...pageInput({ defaultSize: 200, maxSize: 500 }),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        orgId: ctx.orgId,
        status: EventStatus.PENDING,
        kind: EventKind.BOOKING,
      };
      const [rows, total] = await Promise.all([
        ctx.db.event.findMany({
          where,
          include: {
            room: { select: { code: true, capacity: true } },
            createdBy: { select: { name: true, email: true } },
          },
          orderBy: { startTime: "asc" },
          ...pageArgs(input),
        }),
        ctx.db.event.count({ where }),
      ]);
      return toPage(rows, total, input);
    }),

  /**
   * Everything waiting for a decision, in one list.
   *
   * Bookings and changes are stored differently but compete for the same rooms,
   * so they are read as one queue: two items asking for the same hour have to
   * be visible together or they get decided as though they were independent.
   * Each carries a verdict worked out server-side — what it would clash with,
   * and which other undecided requests want the same slot — because that is the
   * question the approver is actually answering, and they should not have to
   * open five tabs to answer it.
   */
  approvalQueue: permissionProcedure(PermissionFlags.ApproveBookings).query(
    async ({ ctx }) => {
      const [bookings, changes] = await Promise.all([
        ctx.db.event.findMany({
          where: {
            orgId: ctx.orgId,
            status: EventStatus.PENDING,
            kind: EventKind.BOOKING,
          },
          include: {
            room: { select: { code: true, capacity: true } },
            groups: { select: { groupId: true } },
            group: { select: { name: true, label: true } },
            createdBy: { select: { id: true, name: true, email: true } },
            exceptions: {
              where: { type: ExceptionType.CANCELLED },
              select: { originalStart: true },
            },
          },
          orderBy: { createdAt: "asc" },
        }),
        ctx.db.eventChangeRequest.findMany({
          where: { orgId: ctx.orgId, status: RequestStatus.PENDING },
          include: {
            requestedBy: { select: { id: true, name: true, email: true } },
            newRoom: { select: { code: true, capacity: true } },
            event: {
              include: {
                room: { select: { code: true, capacity: true } },
                group: { select: { name: true, label: true } },
                groups: { select: { groupId: true } },
                faculty: { select: { user: { select: { name: true } } } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        }),
      ]);

      const bookingItems = await Promise.all(
        bookings.map(async (event) => ({
          kind: "booking" as const,
          id: event.id,
          title: event.title,
          requestedAt: event.createdAt,
          requestedBy: event.createdBy,
          reason: event.notes,
          room: event.room,
          cohort: event.group?.label ?? event.group?.name ?? null,
          startTime: event.startTime,
          endTime: event.endTime,
          rrule: event.rrule,
          recurrenceText: event.rrule ? describeRRule(event.rrule) : null,
          scope: null,
          was: null,
          verdict: await verdictFor(
            ctx.db,
            {
              orgId: ctx.orgId,
              roomId: event.roomId,
              groupId: event.groupId,
              groupIds: event.groups.map((g) => g.groupId),
              facultyId: event.facultyId,
              startTime: event.startTime,
              endTime: event.endTime,
              timezone: event.timezone,
              rrule: event.rrule,
              excludeEventId: event.id,
            },
            { skipDates: event.exceptions.map((e) => e.originalStart) },
          ),
        })),
      );

      const changeItems = await Promise.all(
        changes.map(async (request) => {
          const slots = proposedSlots(request);
          const first = slots[0];
          return {
            kind: "change" as const,
            id: request.id,
            title: request.newTitle ?? request.event.title,
            requestedAt: request.createdAt,
            requestedBy: request.requestedBy,
            reason: request.reason,
            room: request.newRoom ?? request.event.room,
            cohort:
              request.event.group?.label ?? request.event.group?.name ?? null,
            startTime: first?.start ?? request.event.startTime,
            endTime: first?.end ?? request.event.endTime,
            rrule: request.event.rrule,
            recurrenceText: request.event.rrule
              ? describeRRule(request.event.rrule)
              : null,
            scope: request.scope,
            cancelling: request.cancelling,
            // What it looks like today, so the approver sees a change rather
            // than a proposal with no context.
            was: {
              title: request.event.title,
              roomCode: request.event.room.code,
              startTime: request.event.startTime,
              endTime: request.event.endTime,
              faculty: request.event.faculty?.user.name ?? null,
            },
            verdict: request.cancelling
              ? ({ hard: [], warnings: [], contested: [] } satisfies Verdict)
              : await verdictFor(
                  ctx.db,
                  {
                    orgId: ctx.orgId,
                    roomId: request.newRoomId ?? request.event.roomId,
                    groupId: request.event.groupId,
                    groupIds: request.event.groups.map((g) => g.groupId),
                    facultyId: request.event.facultyId,
                    startTime: first?.start ?? request.event.startTime,
                    endTime: first?.end ?? request.event.endTime,
                    timezone: request.event.timezone,
                    // One sitting moving occupies one slot, whatever the rule.
                    rrule:
                      request.scope === RequestScope.OCCURRENCE
                        ? null
                        : request.event.rrule,
                    excludeEventId: request.eventId,
                  },
                  { excludeRequestId: request.id },
                ),
          };
        }),
      );

      // `wholeList`, and one of the few places it is the honest answer rather
      // than the lazy one: the queue is two different tables read separately
      // and re-sorted by age, so page two of it is not `skip` on either query.
      // Over-fetching both and slicing the merge would be the same unbounded
      // read handing back a shorter answer, which buys nothing at all.
      //
      // The `take` cap that used to sit on each query goes with it, and is not
      // missed. It never bounded the work — every item costs a verdict either
      // way — and it quietly broke the one thing this list is for: two
      // requests for the same hour have to be visible together, and the
      // fifty-first request is one the approver decides as though nothing else
      // had ever wanted the room.
      return wholeList(
        [...bookingItems, ...changeItems]
          .map((item) => ({ ...item, severity: verdictSeverity(item.verdict) }))
          .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime()),
      );
    },
  ),

  approve: permissionProcedure(PermissionFlags.ApproveBookings)
    .input(
      z.object({ id: z.string().cuid(), note: z.string().max(300).optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      const settings = await ctx.db.orgSettings.findUniqueOrThrow({
        where: { orgId: ctx.orgId },
      });

      return ctx.db.$transaction(async (tx) => {
        const event = await tx.event.findFirst({
          where: { id: input.id, orgId: ctx.orgId },
          include: {
            groups: { select: { groupId: true } },
            exceptions: {
              where: { type: ExceptionType.CANCELLED },
              select: { originalStart: true },
            },
          },
        });
        if (!event) throw new TRPCError({ code: "NOT_FOUND" });

        // Only a request can be granted. Without this, an id is enough to bring
        // a refused or cancelled booking back to life.
        if (event.status !== EventStatus.PENDING) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That booking is not waiting for a decision.",
          });
        }

        // Nothing else may approve into this room until the transaction ends,
        // so the re-check below reads a settled timetable rather than racing
        // another approval of a request for the same slot.
        await lockResources(tx, {
          roomId: event.roomId,
          facultyId: event.facultyId,
          groupIds: event.groups.map((g) => g.groupId),
        });

        // The slot may have been taken while the request sat in the queue, so
        // approving re-checks rather than trusting the original preflight —
        // and checks everything the request itself was checked against, or a
        // booking could be approved into a clash that would have blocked it.
        const verdict = await verdictFor(
          tx,
          {
            orgId: ctx.orgId,
            roomId: event.roomId,
            groupId: event.groupId,
            groupIds: event.groups.map((g) => g.groupId),
            facultyId: event.facultyId,
            startTime: event.startTime,
            endTime: event.endTime,
            timezone: event.timezone,
            rrule: event.rrule,
            excludeEventId: event.id,
          },
          // Weeks the requester asked to skip are not being booked, so whatever
          // is in the room those weeks is not this booking's problem.
          { skipDates: event.exceptions.map((e) => e.originalStart) },
        );
        if (settings.blockConflicts && verdict.hard.length > 0) {
          throw conflictError(verdict.hard);
        }

        await tx.event.update({
          where: { id: event.id },
          data: {
            status: EventStatus.CONFIRMED,
            decidedById: ctx.actor.id,
            decidedAt: new Date(),
            decisionNote: input.note ?? null,
          },
        });
        await regenerateOccurrences(tx, event.id);
        await notifyBookingDecided(tx, event, {
          approved: true,
          deciderId: ctx.actor.id,
          note: input.note,
        });
        return {
          approved: true,
          warnings: verdict.warnings,
          // Said out loud rather than swallowed: these are the requests that
          // wanted the same slot and have just lost it.
          contested: verdict.contested,
        };
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
        const event = await tx.event.findFirst({
          where: { id: input.id, orgId: ctx.orgId },
        });
        if (!event) throw new TRPCError({ code: "NOT_FOUND" });
        if (event.status !== EventStatus.PENDING) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That booking is not waiting for a decision.",
          });
        }

        // The reason goes in its own column. `notes` is what the person asking
        // wrote, and overwriting it destroys the only record of what they
        // wanted — including for the appeal.
        await tx.event.update({
          where: { id: event.id },
          data: {
            status: EventStatus.REJECTED,
            decidedById: ctx.actor.id,
            decidedAt: new Date(),
            decisionNote: input.reason ?? null,
          },
        });
        await regenerateOccurrences(tx, event.id);
        await notifyBookingDecided(tx, event, {
          approved: false,
          deciderId: ctx.actor.id,
          note: input.reason,
        });
        return { rejected: true };
      });
    }),

  /**
   * Asks for a class or a booking to be changed, rather than changing it.
   *
   * The event goes on being exactly what it is: sixty people have this lecture
   * in their week already, and a proposal nobody has agreed to must not move
   * it under them. `update` files one of these automatically when the person
   * editing has not got the authority to write directly, so the client does not
   * have to know which case it is in.
   */
  requestChange: protectedProcedure
    .input(
      z.object({
        eventId: z.string().cuid(),
        scope: scopeInput.default("series"),
        originalStart: z.date().optional(),
        newRoomId: z.string().cuid().optional(),
        newStartTime: z.date().optional(),
        newEndTime: z.date().optional(),
        newTitle: z.string().min(1).max(160).optional(),
        cancelling: z.boolean().default(false),
        reason: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.event.findFirst({
        where: { id: input.eventId, orgId: ctx.orgId },
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      // Asking is not editing, but it is not open to strangers either: the
      // people who may ask are the people who could have edited it directly if
      // the setting were off.
      await assertMayEdit(ctx, event);

      if (input.scope !== "series" && !input.originalStart) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Changing a single sitting needs the sitting's date.",
        });
      }
      const asked =
        input.newRoomId ??
        input.newStartTime ??
        input.newEndTime ??
        input.newTitle ??
        (input.cancelling ? "cancel" : undefined);
      if (asked === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A change request has to ask for something.",
        });
      }
      const start = input.newStartTime ?? event.startTime;
      const end = input.newEndTime ?? event.endTime;
      if (end <= start) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The end time must be after the start time.",
        });
      }

      return ctx.db.$transaction(async (tx) => {
        const filed = await tx.eventChangeRequest.create({
          data: {
            orgId: ctx.orgId,
            eventId: event.id,
            requestedById: ctx.actor.id,
            scope:
              RequestScope[
                input.scope.toUpperCase() as keyof typeof RequestScope
              ],
            originalStart: input.originalStart ?? null,
            newRoomId: input.newRoomId ?? null,
            newStartTime: input.newStartTime ?? null,
            newEndTime: input.newEndTime ?? null,
            newTitle: input.newTitle ?? null,
            cancelling: input.cancelling,
            reason: input.reason ?? null,
          },
        });
        await notifyChangeRequested(tx, { ...filed, event });
        return filed;
      });
    }),

  /** Grants a change, and makes it — through the same path an edit takes. */
  approveChange: permissionProcedure(PermissionFlags.ApproveBookings)
    .input(
      z.object({ id: z.string().cuid(), note: z.string().max(300).optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      const settings = await ctx.db.orgSettings.findUniqueOrThrow({
        where: { orgId: ctx.orgId },
      });

      return ctx.db.$transaction(async (tx) => {
        const request = await tx.eventChangeRequest.findFirst({
          where: { id: input.id, orgId: ctx.orgId },
          include: {
            event: { include: { groups: { select: { groupId: true } } } },
          },
        });
        if (!request) throw new TRPCError({ code: "NOT_FOUND" });
        if (request.status !== RequestStatus.PENDING) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That request has already been decided.",
          });
        }

        const event = request.event;
        const roomId = request.newRoomId ?? event.roomId;
        await lockResources(tx, {
          roomId,
          facultyId: event.facultyId,
          groupIds: event.groups.map((g) => g.groupId),
        });

        if (!request.cancelling) {
          const slots = proposedSlots(request);
          const first = slots[0];
          const verdict = await verdictFor(
            tx,
            {
              orgId: ctx.orgId,
              roomId,
              groupId: event.groupId,
              groupIds: event.groups.map((g) => g.groupId),
              facultyId: event.facultyId,
              startTime: first?.start ?? event.startTime,
              endTime: first?.end ?? event.endTime,
              timezone: event.timezone,
              rrule:
                request.scope === RequestScope.OCCURRENCE ? null : event.rrule,
              // The class moving out of its old slot cannot clash with itself.
              excludeEventId: event.id,
            },
            { excludeRequestId: request.id },
          );
          if (settings.blockConflicts && verdict.hard.length > 0) {
            throw conflictError(verdict.hard);
          }
        }

        // Applied exactly as an ordinary edit is, so an approved change reaches
        // the grid, the registers and everybody's Google Calendar by the same
        // road as every other change to a timetable.
        if (request.cancelling) {
          await tx.eventException.upsert({
            where: {
              eventId_originalStart: {
                eventId: event.id,
                originalStart: request.originalStart ?? event.startTime,
              },
            },
            update: { type: ExceptionType.CANCELLED, reason: request.reason },
            create: {
              eventId: event.id,
              originalStart: request.originalStart ?? event.startTime,
              type: ExceptionType.CANCELLED,
              reason: request.reason,
            },
          });
          if (request.scope === RequestScope.SERIES) {
            await tx.event.update({
              where: { id: event.id },
              data: { status: EventStatus.CANCELLED },
            });
          }
          await regenerateOccurrences(tx, event.id);
        } else if (request.scope === RequestScope.OCCURRENCE) {
          await tx.eventException.upsert({
            where: {
              eventId_originalStart: {
                eventId: event.id,
                originalStart: request.originalStart!,
              },
            },
            update: {
              type: ExceptionType.MODIFIED,
              newStartTime: request.newStartTime,
              newEndTime: request.newEndTime,
              newRoomId: request.newRoomId,
              newTitle: request.newTitle,
            },
            create: {
              eventId: event.id,
              originalStart: request.originalStart!,
              type: ExceptionType.MODIFIED,
              newStartTime: request.newStartTime,
              newEndTime: request.newEndTime,
              newRoomId: request.newRoomId,
              newTitle: request.newTitle,
            },
          });
          await regenerateOccurrences(tx, event.id);
        } else if (request.scope === RequestScope.FOLLOWING) {
          await splitSeriesAt(tx, event.id, request.originalStart!, {
            title: request.newTitle ?? undefined,
            roomId: request.newRoomId ?? undefined,
            startTime: request.newStartTime ?? undefined,
            endTime: request.newEndTime ?? undefined,
          });
        } else {
          await tx.event.update({
            where: { id: event.id },
            data: {
              title: request.newTitle ?? undefined,
              roomId: request.newRoomId ?? undefined,
              startTime: request.newStartTime ?? undefined,
              endTime: request.newEndTime ?? undefined,
            },
          });
          await regenerateOccurrences(tx, event.id);
        }

        await tx.eventChangeRequest.update({
          where: { id: request.id },
          data: {
            status: RequestStatus.APPROVED,
            decidedById: ctx.actor.id,
            decidedAt: new Date(),
            decisionNote: input.note ?? null,
          },
        });
        await notifyChangeDecided(tx, request, {
          approved: true,
          deciderId: ctx.actor.id,
          note: input.note,
        });
        return { approved: true };
      });
    }),

  rejectChange: permissionProcedure(PermissionFlags.ApproveBookings)
    .input(
      z.object({
        id: z.string().cuid(),
        reason: z.string().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const request = await tx.eventChangeRequest.findFirst({
          where: { id: input.id, orgId: ctx.orgId },
          include: { event: true },
        });
        if (!request) throw new TRPCError({ code: "NOT_FOUND" });
        if (request.status !== RequestStatus.PENDING) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That request has already been decided.",
          });
        }
        await tx.eventChangeRequest.update({
          where: { id: request.id },
          data: {
            status: RequestStatus.REJECTED,
            decidedById: ctx.actor.id,
            decidedAt: new Date(),
            decisionNote: input.reason ?? null,
          },
        });
        await notifyChangeDecided(tx, request, {
          approved: false,
          deciderId: ctx.actor.id,
          note: input.reason,
        });
        return { rejected: true };
      });
    }),

  /** Thought better of it. Only the person who asked may take it back. */
  withdrawChange: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.db.eventChangeRequest.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: { id: true, status: true, requestedById: true },
      });
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });
      if (request.requestedById !== ctx.actor.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the person who asked can withdraw a request.",
        });
      }
      if (request.status !== RequestStatus.PENDING) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That request has already been decided.",
        });
      }
      await ctx.db.eventChangeRequest.update({
        where: { id: request.id },
        data: { status: RequestStatus.WITHDRAWN },
      });
      return { withdrawn: true };
    }),

  /** What somebody who has asked for something sees while they wait. */
  myRequests: protectedProcedure
    .input(
      z
        .object({
          /**
           * A hundred, doubling the hard `take: 50` it replaces. This is one
           * person's own proposals over the whole time they have been here —
           * tens of them, even for a coordinator who reschedules constantly —
           * and the panel that draws it merges this list with `myBookings`
           * before sorting the merge by age. So a short answer would not
           * shorten what is on screen, it would drop the newest few out of the
           * middle of it, which is the kind of wrong that looks right.
           */
          ...pageInput({ defaultSize: 100, maxSize: 500 }),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = { orgId: ctx.orgId, requestedById: ctx.actor.id };
      const [rows, total] = await Promise.all([
        ctx.db.eventChangeRequest.findMany({
          where,
          include: {
            newRoom: { select: { code: true } },
            decidedBy: { select: { name: true } },
            event: {
              select: {
                title: true,
                startTime: true,
                endTime: true,
                room: { select: { code: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          ...pageArgs(input),
        }),
        ctx.db.eventChangeRequest.count({ where }),
      ]);
      return toPage(rows, total, input);
    }),

  myBookings: protectedProcedure
    .input(
      z
        .object({
          /**
           * Nothing bounded this at all before, and the panel that reads it
           * renders it whole: it merges these with `myRequests`, sorts the
           * merge by age and shows the most recent handful. Rows are ordered
           * by when the room was wanted rather than when it was asked for, so
           * anything missing from a short answer goes missing from the *top*
           * of what is drawn. Five hundred is more bookings than one person
           * makes in a degree.
           */
          ...pageInput({ defaultSize: 500, maxSize: 2000 }),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        orgId: ctx.orgId,
        createdById: ctx.actor.id,
        kind: EventKind.BOOKING,
        // Refused ones belong here too: being told no, and why, is the whole
        // point of asking, and a request that simply vanishes reads as a bug.
        status: {
          in: [
            EventStatus.CONFIRMED,
            EventStatus.PENDING,
            EventStatus.REJECTED,
          ],
        },
      };
      const [rows, total] = await Promise.all([
        ctx.db.event.findMany({
          where,
          include: { room: { select: { code: true } } },
          orderBy: { startTime: "asc" },
          ...pageArgs(input),
        }),
        ctx.db.event.count({ where }),
      ]);
      return toPage(rows, total, input);
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

  // Whoever booked a room may change it — but on the strength of the
  // permission that let them book it, not merely on having created the row. A
  // bare creator check outranks every other rule in this function, which is how
  // somebody whose booking rights were withdrawn keeps editing.
  if (
    event.createdById === ctx.actor.id &&
    ctx.bits.hasAny(PermissionFlags.BookRoom)
  ) {
    return;
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "You can only change events you teach or booked yourself.",
  });
}
