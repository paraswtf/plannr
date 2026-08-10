import { z } from "zod";

import { DEFAULT_TIMEZONE, endOfLocalDay, startOfLocalDay } from "~/lib/dates";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { OCCUPYING_STATUSES } from "~/server/services/conflicts";
import type { Db } from "~/server/services/occurrences";

/**
 * Read models for the timetable screens.
 *
 * Every query here is a single indexed range scan over `EventOccurrence` —
 * recurrence was resolved at write time, so nothing expands rules on read.
 */

/** Shape the grid and list views consume. */
const selectOccurrence = {
  id: true,
  eventId: true,
  start: true,
  end: true,
  roomId: true,
  kind: true,
  status: true,
  event: { select: { title: true, rrule: true, notes: true } },
  room: { select: { code: true, buildingId: true } },
  group: { select: { id: true, name: true, label: true } },
  faculty: {
    select: {
      id: true,
      shortName: true,
      user: { select: { name: true } },
    },
  },
} as const;

type OccurrenceRow = {
  id: string;
  eventId: string;
  start: Date;
  end: Date;
  roomId: string;
  kind: string;
  status: string;
  event: { title: string; rrule: string | null; notes: string | null };
  room: { code: string; buildingId: string };
  group: { id: string; name: string; label: string | null } | null;
  faculty: {
    id: string;
    shortName: string | null;
    user: { name: string | null };
  } | null;
};

function toDto(row: OccurrenceRow) {
  return {
    occurrenceId: row.id,
    eventId: row.eventId,
    start: row.start,
    end: row.end,
    roomId: row.roomId,
    roomCode: row.room.code,
    buildingId: row.room.buildingId,
    title: row.event.title,
    notes: row.event.notes,
    kind: row.kind,
    status: row.status,
    groupId: row.group?.id ?? null,
    groupLabel: row.group?.label ?? row.group?.name ?? null,
    facultyId: row.faculty?.id ?? null,
    facultyName: row.faculty?.shortName ?? row.faculty?.user.name ?? null,
    isRecurring: row.event.rrule !== null,
  };
}

export type OccurrenceDto = ReturnType<typeof toDto>;

async function orgTimezone(db: Db, orgId: string): Promise<string> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true },
  });
  return org?.timezone ?? DEFAULT_TIMEZONE;
}

export const timetableRouter = createTRPCRouter({
  /** Rooms × time for one day — the main admin grid. */
  grid: protectedProcedure
    .input(
      z.object({
        date: z.date(),
        buildingId: z.string().cuid().optional(),
        includeCancelled: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const timeZone = await orgTimezone(ctx.db, ctx.orgId);
      const from = startOfLocalDay(input.date, timeZone);
      const to = endOfLocalDay(input.date, timeZone);

      const [rooms, occurrences, settings] = await Promise.all([
        ctx.db.room.findMany({
          where: {
            orgId: ctx.orgId,
            isActive: true,
            ...(input.buildingId ? { buildingId: input.buildingId } : {}),
          },
          include: { building: { select: { id: true, name: true } } },
          orderBy: [{ building: { name: "asc" } }, { code: "asc" }],
        }),
        ctx.db.eventOccurrence.findMany({
          where: {
            orgId: ctx.orgId,
            start: { lt: to },
            end: { gt: from },
            ...(input.includeCancelled
              ? {}
              : { status: { in: [...OCCUPYING_STATUSES] } }),
            ...(input.buildingId
              ? { room: { buildingId: input.buildingId } }
              : {}),
          },
          select: selectOccurrence,
          orderBy: { start: "asc" },
        }),
        ctx.db.orgSettings.findUnique({ where: { orgId: ctx.orgId } }),
      ]);

      return {
        timeZone,
        from,
        to,
        rooms,
        occurrences: (occurrences as OccurrenceRow[]).map(toDto),
        settings,
      };
    }),

  /** A week for one lane: a room, a group, or a faculty member. */
  week: protectedProcedure
    .input(
      z.object({
        from: z.date(),
        to: z.date(),
        roomId: z.string().cuid().optional(),
        groupId: z.string().cuid().optional(),
        facultyId: z.string().cuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const occurrences = await ctx.db.eventOccurrence.findMany({
        where: {
          orgId: ctx.orgId,
          status: { in: [...OCCUPYING_STATUSES] },
          start: { lt: input.to },
          end: { gt: input.from },
          ...(input.roomId ? { roomId: input.roomId } : {}),
          ...(input.groupId ? { groupId: input.groupId } : {}),
          ...(input.facultyId ? { facultyId: input.facultyId } : {}),
        },
        select: selectOccurrence,
        orderBy: { start: "asc" },
      });
      return (occurrences as OccurrenceRow[]).map(toDto);
    }),

  /**
   * What the signed-in user is doing on a given day: their group's classes for
   * a student, their teaching for a faculty member. Powers Today and My Classes.
   */
  myDay: protectedProcedure
    .input(z.object({ date: z.date() }).default({ date: new Date() }))
    .query(async ({ ctx, input }) => {
      const timeZone = await orgTimezone(ctx.db, ctx.orgId);
      const from = startOfLocalDay(input.date, timeZone);
      const to = endOfLocalDay(input.date, timeZone);
      const scope = await resolveScope(ctx.db, ctx.actor.id);

      if (!scope) return { timeZone, from, to, occurrences: [], scope: null };

      const occurrences = await ctx.db.eventOccurrence.findMany({
        where: {
          orgId: ctx.orgId,
          status: { in: [...OCCUPYING_STATUSES] },
          start: { lt: to },
          end: { gt: from },
          ...(scope.kind === "student"
            ? { groupId: { in: scope.groupIds } }
            : { facultyId: scope.facultyId }),
        },
        select: selectOccurrence,
        orderBy: { start: "asc" },
      });

      return {
        timeZone,
        from,
        to,
        scope,
        occurrences: (occurrences as OccurrenceRow[]).map(toDto),
      };
    }),

  /** A faculty member's whole week, for the My Classes summary panel. */
  myWeek: protectedProcedure
    .input(z.object({ from: z.date(), to: z.date() }))
    .query(async ({ ctx, input }) => {
      const scope = await resolveScope(ctx.db, ctx.actor.id);
      if (!scope) return [];

      const occurrences = await ctx.db.eventOccurrence.findMany({
        where: {
          orgId: ctx.orgId,
          status: { in: [...OCCUPYING_STATUSES] },
          start: { lt: input.to },
          end: { gt: input.from },
          ...(scope.kind === "student"
            ? { groupId: { in: scope.groupIds } }
            : { facultyId: scope.facultyId }),
        },
        select: selectOccurrence,
        orderBy: { start: "asc" },
      });
      return (occurrences as OccurrenceRow[]).map(toDto);
    }),
});

type Scope =
  | { kind: "student"; groupIds: string[] }
  | { kind: "faculty"; facultyId: string };

/** Which occurrences belong to this user: their groups, or their teaching. */
async function resolveScope(db: Db, userId: string): Promise<Scope | null> {
  const faculty = await db.facultyProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (faculty) return { kind: "faculty", facultyId: faculty.id };

  const student = await db.studentProfile.findUnique({
    where: { userId },
    select: { memberships: { select: { groupId: true } } },
  });
  if (student) {
    return {
      kind: "student",
      groupIds: student.memberships.map((m) => m.groupId),
    };
  }
  return null;
}
