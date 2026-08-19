import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { contactAddress, contactAddresses } from "~/lib/people";
import { PermissionFlags } from "~/lib/permissions";
import {
  createTRPCRouter,
  permissionProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { enqueueForEvents } from "~/server/services/calendar/sync";
import { OCCUPYING_STATUSES } from "~/server/services/conflicts";
import { GroupKind } from "../../../../generated/prisma";

/**
 * Class groups: the cohorts that attend classes.
 *
 * Membership is edited either by picking people or by pasting a column of
 * emails or PRNs out of a spreadsheet, which is how the registry actually
 * hands these lists over.
 */

/**
 * Every list is paged. Selection widgets ask for a small page and narrow it by
 * searching rather than pulling the directory down and filtering in the
 * browser — a cohort of a few thousand students has to stay usable.
 */
const pageInput = {
  query: z.string().trim().max(120).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
};

const paged = <T>(
  rows: T[],
  total: number,
  page: number,
  pageSize: number,
) => ({
  rows,
  total,
  page,
  pageSize,
  pageCount: Math.max(1, Math.ceil(total / pageSize)),
  hasMore: page * pageSize < total,
});

const displayName = (f: {
  shortName: string | null;
  user: { name: string | null };
}) => f.shortName ?? f.user.name ?? "Unnamed";

export const groupsRouter = createTRPCRouter({
  list: permissionProcedure(PermissionFlags.ViewGroups)
    .input(
      z
        .object({
          ...pageInput,
          programmeId: z.string().cuid().optional(),
          semesterId: z.string().cuid().optional(),
          batchId: z.string().cuid().optional(),
          kind: z.nativeEnum(GroupKind).optional(),
          /** Keeps chosen options visible even when a search excludes them. */
          includeIds: z.array(z.string().cuid()).max(100).optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        orgId: ctx.orgId,
        ...(input.programmeId ? { programmeId: input.programmeId } : {}),
        ...(input.semesterId ? { semesterId: input.semesterId } : {}),
        ...(input.batchId ? { batchId: input.batchId } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.query
          ? {
              OR: [
                {
                  name: {
                    contains: input.query,
                    mode: "insensitive" as const,
                  },
                },
                {
                  label: {
                    contains: input.query,
                    mode: "insensitive" as const,
                  },
                },
                {
                  programme: {
                    code: {
                      contains: input.query,
                      mode: "insensitive" as const,
                    },
                  },
                },
                {
                  batch: {
                    name: {
                      contains: input.query,
                      mode: "insensitive" as const,
                    },
                  },
                },
              ],
            }
          : {}),
      };

      const include = {
        programme: { select: { id: true, code: true, name: true } },
        semester: { select: { id: true, name: true } },
        batch: { select: { id: true, name: true } },
        _count: { select: { students: true, events: true, faculty: true } },
        faculty: {
          include: {
            faculty: {
              select: {
                id: true,
                shortName: true,
                user: { select: { name: true } },
              },
            },
          },
        },
      } as const;
      const orderBy = [
        { programme: { code: "asc" as const } },
        { name: "asc" as const },
      ];

      const [page, total, pinned] = await Promise.all([
        ctx.db.group.findMany({
          where,
          include,
          orderBy,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        ctx.db.group.count({ where }),
        input.includeIds?.length
          ? ctx.db.group.findMany({
              where: { orgId: ctx.orgId, id: { in: input.includeIds } },
              include,
              orderBy,
            })
          : Promise.resolve([]),
      ]);

      const seen = new Set(page.map((g) => g.id));
      const groups = [...page, ...pinned.filter((g) => !seen.has(g.id))];

      return paged(
        groups.map((g) => ({
          id: g.id,
          name: g.name,
          label: g.label ?? g.name,
          kind: g.kind,
          programmeId: g.programme.id,
          courseCode: g.programme.code,
          courseName: g.programme.name,
          semesterId: g.semester?.id ?? null,
          termName: g.semester?.name ?? null,
          batchId: g.batch?.id ?? null,
          batchName: g.batch?.name ?? null,
          studentCount: g._count.students,
          eventCount: g._count.events,
          facultyCount: g._count.faculty,
          faculty: g.faculty.map((a) => ({
            id: a.faculty.id,
            name: displayName(a.faculty),
          })),
        })),
        total,
        input.page,
        input.pageSize,
      );
    }),

  byId: permissionProcedure(PermissionFlags.ViewGroups)
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const group = await ctx.db.group.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        include: {
          programme: { select: { id: true, code: true, name: true } },
          semester: { select: { id: true, name: true } },
          _count: { select: { events: true } },
          students: {
            include: {
              student: {
                select: {
                  id: true,
                  prn: true,
                  user: { select: { id: true, name: true, email: true } },
                },
              },
            },
            orderBy: { student: { prn: "asc" } },
          },
          faculty: {
            include: {
              faculty: {
                select: {
                  id: true,
                  shortName: true,
                  department: true,
                  user: { select: { name: true, email: true } },
                },
              },
            },
          },
        },
      });
      if (!group) return null;

      return {
        id: group.id,
        name: group.name,
        label: group.label ?? group.name,
        programme: group.programme,
        semester: group.semester,
        eventCount: group._count.events,
        students: group.students.map((m) => ({
          id: m.student.id,
          userId: m.student.user.id,
          name: m.student.user.name,
          /** null for a student the college has sent no address for. */
          email: contactAddress(m.student.user.email),
          prn: m.student.prn,
          addedAt: m.addedAt,
        })),
        faculty: group.faculty.map((a) => ({
          id: a.faculty.id,
          name: displayName(a.faculty),
          email: contactAddress(a.faculty.user.email),
          department: a.faculty.department,
        })),
      };
    }),

  create: permissionProcedure(PermissionFlags.ManageGroups)
    .input(
      z.object({
        name: z.string().trim().min(1).max(60),
        label: z.string().trim().max(120).optional(),
        programmeId: z.string().cuid(),
        semesterId: z.string().cuid().optional(),
        batchId: z.string().cuid().optional(),
        kind: z.nativeEnum(GroupKind).default(GroupKind.DIVISION),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.db.programme.findFirst({
        where: { id: input.programmeId, orgId: ctx.orgId },
        select: { id: true },
      });
      if (!course) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unknown course.",
        });
      }

      const clash = await ctx.db.group.findFirst({
        where: {
          programmeId: input.programmeId,
          semesterId: input.semesterId ?? null,
          name: input.name,
        },
        select: { id: true },
      });
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `That course already has a group called "${input.name}" this term.`,
        });
      }

      return ctx.db.group.create({
        data: {
          orgId: ctx.orgId,
          name: input.name,
          label: input.label ?? input.name,
          programmeId: input.programmeId,
          semesterId: input.semesterId,
          batchId: input.batchId,
          kind: input.kind,
        },
      });
    }),

  update: permissionProcedure(PermissionFlags.ManageGroups)
    .input(
      z.object({
        id: z.string().cuid(),
        name: z.string().trim().min(1).max(60).optional(),
        label: z.string().trim().max(120).nullish(),
        semesterId: z.string().cuid().nullish(),
        batchId: z.string().cuid().nullish(),
        kind: z.nativeEnum(GroupKind).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.group.updateMany({
        where: { id: input.id, orgId: ctx.orgId },
        data: {
          name: input.name,
          label: input.label,
          semesterId: input.semesterId,
          batchId: input.batchId,
          kind: input.kind,
        },
      });
      if (count === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.group.findUniqueOrThrow({ where: { id: input.id } });
    }),

  /**
   * Adds students by pasted email or PRN. Returns what happened to every
   * identifier so the UI can show which lines of the paste did not land.
   */
  addMembers: permissionProcedure(PermissionFlags.ManageGroups)
    .input(
      z.object({
        groupId: z.string().cuid(),
        identifiers: z.array(z.string().trim()).min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const group = await ctx.db.group.findFirst({
        where: { id: input.groupId, orgId: ctx.orgId },
        select: { id: true },
      });
      if (!group) throw new TRPCError({ code: "NOT_FOUND" });

      const cleaned = [...new Set(input.identifiers.filter(Boolean))];
      // A placeholder address identifies nobody: it is never shown, so it can
      // never have been copied off a screen into this box, and a student who
      // has one is added by their PRN like everyone else.
      const emails = contactAddresses(cleaned.filter((v) => v.includes("@")));
      const prns = cleaned.filter((v) => !v.includes("@"));

      const profiles = await ctx.db.studentProfile.findMany({
        where: {
          orgId: ctx.orgId,
          OR: [{ prn: { in: prns } }, { user: { email: { in: emails } } }],
        },
        include: {
          user: { select: { email: true, name: true } },
          memberships: {
            where: { groupId: input.groupId },
            select: { groupId: true },
          },
        },
      });

      const matchedKeys = new Set<string>();
      for (const p of profiles) {
        matchedKeys.add(p.prn);
        matchedKeys.add(p.user.email.toLowerCase());
      }

      const toAdd = profiles.filter((p) => p.memberships.length === 0);
      if (toAdd.length) {
        await ctx.db.studentGroupMembership.createMany({
          data: toAdd.map((p) => ({
            studentId: p.id,
            groupId: input.groupId,
            addedById: ctx.actor.id,
          })),
          skipDuplicates: true,
        });
      }

      return {
        added: toAdd.map((p) => ({
          id: p.id,
          prn: p.prn,
          name: p.user.name,
        })),
        alreadyMembers: profiles.length - toAdd.length,
        notFound: cleaned.filter(
          (v) => !matchedKeys.has(v.includes("@") ? v.toLowerCase() : v),
        ),
      };
    }),

  removeMembers: permissionProcedure(PermissionFlags.ManageGroups)
    .input(
      z.object({
        groupId: z.string().cuid(),
        studentIds: z.array(z.string().cuid()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const group = await ctx.db.group.findFirst({
        where: { id: input.groupId, orgId: ctx.orgId },
        select: { id: true },
      });
      if (!group) throw new TRPCError({ code: "NOT_FOUND" });

      const { count } = await ctx.db.studentGroupMembership.deleteMany({
        where: { groupId: input.groupId, studentId: { in: input.studentIds } },
      });
      return { removed: count };
    }),

  setFaculty: permissionProcedure(PermissionFlags.ManageGroups)
    .input(
      z.object({
        groupId: z.string().cuid(),
        facultyIds: z.array(z.string().cuid()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const group = await ctx.db.group.findFirst({
        where: { id: input.groupId, orgId: ctx.orgId },
        select: { id: true },
      });
      if (!group) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.$transaction([
        ctx.db.facultyGroupAssignment.deleteMany({
          where: { groupId: input.groupId },
        }),
        ctx.db.facultyGroupAssignment.createMany({
          data: input.facultyIds.map((facultyId) => ({
            facultyId,
            groupId: input.groupId,
          })),
          skipDuplicates: true,
        }),
      ]);
      return { assigned: input.facultyIds.length };
    }),

  /** What deleting this group would take with it. */
  deleteImpact: permissionProcedure(PermissionFlags.ManageGroups)
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const [group, upcoming] = await Promise.all([
        ctx.db.group.findFirst({
          where: { id: input.id, orgId: ctx.orgId },
          select: {
            name: true,
            label: true,
            _count: { select: { students: true, events: true, faculty: true } },
          },
        }),
        ctx.db.eventOccurrence.count({
          where: {
            groupId: input.id,
            start: { gte: new Date() },
            status: { in: ["CONFIRMED", "PENDING"] },
          },
        }),
      ]);
      return {
        name: group?.label ?? group?.name ?? null,
        studentCount: group?._count.students ?? 0,
        eventCount: group?._count.events ?? 0,
        upcomingOccurrences: upcoming,
      };
    }),

  delete: permissionProcedure(PermissionFlags.ManageGroups)
    .input(
      z.object({
        id: z.string().cuid(),
        /** Required when the group still has classes scheduled. */
        confirmCascade: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const group = await tx.group.findFirst({
          where: { id: input.id, orgId: ctx.orgId },
          select: { id: true, name: true },
        });
        if (!group) throw new TRPCError({ code: "NOT_FOUND" });

        const eventCount = await tx.event.count({
          where: { groupId: group.id },
        });
        if (eventCount > 0 && !input.confirmCascade) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${group.name} has ${eventCount} scheduled ${eventCount === 1 ? "class" : "classes"}. Deleting it removes them too.`,
          });
        }
        // Occurrences cascade from their events.
        if (eventCount > 0) {
          // Before the delete, while there is still a record of who was in
          // these rooms — afterwards nobody could be told the classes are off.
          const doomed = await tx.event.findMany({
            where: { groupId: group.id },
            select: { id: true },
          });
          await enqueueForEvents(
            tx,
            doomed.map((e) => e.id),
          );
          await tx.event.deleteMany({ where: { groupId: group.id } });
        }
        await tx.group.delete({ where: { id: group.id } });
        return { deleted: true, deletedEvents: eventCount };
      });
    }),

  facultyList: protectedProcedure
    .input(
      z
        .object({
          ...pageInput,
          includeIds: z.array(z.string().cuid()).max(100).optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        orgId: ctx.orgId,
        ...(input.query
          ? {
              OR: [
                {
                  shortName: {
                    contains: input.query,
                    mode: "insensitive" as const,
                  },
                },
                {
                  department: {
                    contains: input.query,
                    mode: "insensitive" as const,
                  },
                },
                {
                  user: {
                    name: {
                      contains: input.query,
                      mode: "insensitive" as const,
                    },
                  },
                },
              ],
            }
          : {}),
      };
      const include = {
        user: { select: { id: true, name: true, email: true, isActive: true } },
        _count: { select: { assignments: true } },
      } as const;
      const orderBy = { shortName: "asc" as const };

      const [page, total, pinned] = await Promise.all([
        ctx.db.facultyProfile.findMany({
          where,
          include,
          orderBy,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        ctx.db.facultyProfile.count({ where }),
        input.includeIds?.length
          ? ctx.db.facultyProfile.findMany({
              where: { orgId: ctx.orgId, id: { in: input.includeIds } },
              include,
              orderBy,
            })
          : Promise.resolve([]),
      ]);

      const seen = new Set(page.map((f) => f.id));
      const faculty = [...page, ...pinned.filter((f) => !seen.has(f.id))];

      return paged(
        faculty.map((f) => ({
          id: f.id,
          name: displayName(f),
          fullName: f.user.name,
          email: contactAddress(f.user.email),
          department: f.department,
          isActive: f.user.isActive,
          groupCount: f._count.assignments,
        })),
        total,
        input.page,
        input.pageSize,
      );
    }),

  /**
   * The intakes, newest first, with what each has been divided into. Small
   * enough to send whole — an institution has tens of these, not thousands.
   */
  batchList: permissionProcedure(PermissionFlags.ViewGroups)
    .input(
      z
        .object({
          query: z.string().trim().max(120).optional(),
          programmeId: z.string().cuid().optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const batches = await ctx.db.batch.findMany({
        where: {
          orgId: ctx.orgId,
          ...(input.programmeId ? { programmeId: input.programmeId } : {}),
          ...(input.query
            ? {
                OR: [
                  {
                    name: {
                      contains: input.query,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    programme: {
                      code: {
                        contains: input.query,
                        mode: "insensitive" as const,
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        include: {
          programme: { select: { id: true, code: true, name: true } },
          groups: {
            select: {
              id: true,
              name: true,
              label: true,
              kind: true,
              _count: { select: { students: true, events: true } },
            },
            orderBy: [{ kind: "asc" }, { name: "asc" }],
          },
        },
        orderBy: [{ startYear: "desc" }, { name: "asc" }],
      });

      return batches.map((batch) => ({
        id: batch.id,
        name: batch.name,
        startYear: batch.startYear,
        endYear: batch.endYear,
        programmeId: batch.programme.id,
        courseCode: batch.programme.code,
        courseName: batch.programme.name,
        groups: batch.groups.map((g) => ({
          id: g.id,
          name: g.name,
          label: g.label ?? g.name,
          kind: g.kind,
          studentCount: g._count.students,
          eventCount: g._count.events,
        })),
        // Divisions partition the intake, so their sum is the intake's size;
        // majors, minors and electives draw from the same people again.
        studentCount: batch.groups
          .filter((g) => g.kind === GroupKind.DIVISION)
          .reduce((total, g) => total + g._count.students, 0),
      }));
    }),

  /**
   * A group's scheduled lectures, newest window first.
   *
   * Reads occurrences rather than events, so a weekly class appears as the
   * dates it actually sits — which is what a register is taken against. Picks up
   * combined lectures through the join as well as the group's own.
   */
  lectures: permissionProcedure(PermissionFlags.ViewGroups)
    .input(
      z.object({
        groupId: z.string().cuid(),
        from: z.date().optional(),
        to: z.date().optional(),
        limit: z.number().int().min(1).max(200).default(60),
      }),
    )
    .query(async ({ ctx, input }) => {
      const occurrences = await ctx.db.eventOccurrence.findMany({
        where: {
          orgId: ctx.orgId,
          status: { in: [...OCCUPYING_STATUSES] },
          ...(input.from ? { start: { gte: input.from } } : {}),
          ...(input.to ? { end: { lte: input.to } } : {}),
          OR: [
            { groupId: input.groupId },
            { event: { groups: { some: { groupId: input.groupId } } } },
          ],
        },
        select: {
          id: true,
          start: true,
          end: true,
          kind: true,
          eventId: true,
          room: { select: { code: true } },
          event: {
            select: {
              title: true,
              rrule: true,
              groups: {
                select: { group: { select: { id: true, name: true } } },
              },
            },
          },
          faculty: {
            select: { shortName: true, user: { select: { name: true } } },
          },
          attendance: {
            where: { groupId: input.groupId },
            select: {
              markedAt: true,
              records: { select: { status: true } },
            },
          },
        },
        orderBy: { start: "asc" },
        take: input.limit,
      });

      return occurrences.map((o) => {
        const register = o.attendance[0];
        return {
          occurrenceId: o.id,
          eventId: o.eventId,
          title: o.event.title,
          kind: o.kind,
          start: o.start,
          end: o.end,
          roomCode: o.room.code,
          facultyName: o.faculty?.shortName ?? o.faculty?.user.name ?? null,
          isRecurring: o.event.rrule !== null,
          /** Other groups in the room for the same lecture. */
          sharedWith: o.event.groups
            .map((g) => g.group)
            .filter((g) => g.id !== input.groupId)
            .map((g) => g.name),
          attendance: register
            ? {
                markedAt: register.markedAt,
                total: register.records.length,
                present: register.records.filter((r) => r.status === "PRESENT")
                  .length,
              }
            : null,
        };
      });
    }),

  createBatch: permissionProcedure(PermissionFlags.ManageGroups)
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        programmeId: z.string().cuid(),
        startYear: z.number().int().min(1900).max(2200),
        endYear: z.number().int().min(1900).max(2200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.endYear < input.startYear) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A batch cannot finish before it starts.",
        });
      }
      const course = await ctx.db.programme.findFirst({
        where: { id: input.programmeId, orgId: ctx.orgId },
        select: { id: true },
      });
      if (!course) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unknown course.",
        });
      }
      const clash = await ctx.db.batch.findFirst({
        where: { orgId: ctx.orgId, name: input.name },
        select: { id: true },
      });
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `There is already a batch called "${input.name}".`,
        });
      }
      return ctx.db.batch.create({
        data: { ...input, orgId: ctx.orgId },
      });
    }),

  updateBatch: permissionProcedure(PermissionFlags.ManageGroups)
    .input(
      z.object({
        id: z.string().cuid(),
        name: z.string().trim().min(1).max(80).optional(),
        programmeId: z.string().cuid().optional(),
        startYear: z.number().int().min(1900).max(2200).optional(),
        endYear: z.number().int().min(1900).max(2200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      const { count } = await ctx.db.batch.updateMany({
        where: { id, orgId: ctx.orgId },
        data: patch,
      });
      if (count === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.batch.findUniqueOrThrow({ where: { id } });
    }),

  /**
   * Removes the intake itself. Its groups survive — they hold the timetable and
   * the membership — and simply stop belonging to a batch.
   */
  deleteBatch: permissionProcedure(PermissionFlags.ManageGroups)
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const batch = await ctx.db.batch.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: { id: true, _count: { select: { groups: true } } },
      });
      if (!batch) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.batch.delete({ where: { id: batch.id } });
      return { deleted: true, orphanedGroups: batch._count.groups };
    }),

  programmeList: protectedProcedure
    .input(
      z
        .object({
          ...pageInput,
          includeIds: z.array(z.string().cuid()).max(100).optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        orgId: ctx.orgId,
        ...(input.query
          ? {
              OR: [
                {
                  code: { contains: input.query, mode: "insensitive" as const },
                },
                {
                  name: { contains: input.query, mode: "insensitive" as const },
                },
              ],
            }
          : {}),
      };
      const select = {
        id: true,
        code: true,
        name: true,
        _count: { select: { groups: true, batches: true } },
      } as const;

      const [page, total, pinned] = await Promise.all([
        ctx.db.programme.findMany({
          where,
          select,
          orderBy: { code: "asc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        ctx.db.programme.count({ where }),
        input.includeIds?.length
          ? ctx.db.programme.findMany({
              where: { orgId: ctx.orgId, id: { in: input.includeIds } },
              select,
              orderBy: { code: "asc" },
            })
          : Promise.resolve([]),
      ]);

      const seen = new Set(page.map((c) => c.id));
      const rows = [...page, ...pinned.filter((c) => !seen.has(c.id))];

      return paged(
        rows.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          groupCount: c._count.groups,
          batchCount: c._count.batches,
        })),
        total,
        input.page,
        input.pageSize,
      );
    }),

  /**
   * The broadest way an institution divides its students: a programme like
   * "BCA". Everything else hangs off one — an intake belongs to a course, and
   * so does every group under it — which is why a course cannot be deleted
   * while anything still refers to it.
   */
  createCourse: permissionProcedure(PermissionFlags.ManageProgrammes)
    .input(
      z.object({
        code: z.string().trim().min(1).max(32),
        name: z.string().trim().min(1).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const clash = await ctx.db.programme.findFirst({
        where: {
          orgId: ctx.orgId,
          code: { equals: input.code, mode: "insensitive" },
        },
        select: { code: true },
      });
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `There is already a course coded "${clash.code}".`,
        });
      }
      return ctx.db.programme.create({
        data: { orgId: ctx.orgId, code: input.code, name: input.name },
      });
    }),

  updateCourse: permissionProcedure(PermissionFlags.ManageProgrammes)
    .input(
      z.object({
        id: z.string().cuid(),
        code: z.string().trim().min(1).max(32).optional(),
        name: z.string().trim().min(1).max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      if (patch.code) {
        const clash = await ctx.db.programme.findFirst({
          where: {
            orgId: ctx.orgId,
            id: { not: id },
            code: { equals: patch.code, mode: "insensitive" },
          },
          select: { code: true },
        });
        if (clash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `There is already a course coded "${clash.code}".`,
          });
        }
      }
      const { count } = await ctx.db.programme.updateMany({
        where: { id, orgId: ctx.orgId },
        data: patch,
      });
      if (count === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.programme.findUniqueOrThrow({ where: { id } });
    }),

  /** What still points at this course, so the UI can say why it is stuck. */
  programmeDeleteImpact: permissionProcedure(PermissionFlags.ManageProgrammes)
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const course = await ctx.db.programme.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: {
          code: true,
          name: true,
          _count: { select: { groups: true, batches: true } },
        },
      });
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        code: course.code,
        name: course.name,
        groupCount: course._count.groups,
        batchCount: course._count.batches,
      };
    }),

  /**
   * Only ever removes an empty course.
   *
   * Cascading would take the groups with it, and a group owns its student
   * membership and its place on the timetable — far too much to lose behind a
   * single confirm. Move or delete those first.
   */
  deleteCourse: permissionProcedure(PermissionFlags.ManageProgrammes)
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.db.programme.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: {
          id: true,
          code: true,
          _count: { select: { groups: true, batches: true } },
        },
      });
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });

      const { groups, batches } = course._count;
      if (groups > 0 || batches > 0) {
        const blockers = [
          groups > 0 && `${groups} ${groups === 1 ? "group" : "groups"}`,
          batches > 0 && `${batches} ${batches === 1 ? "batch" : "batches"}`,
        ].filter(Boolean);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${course.code} still has ${blockers.join(" and ")}. Move or delete them before deleting the course.`,
        });
      }

      await ctx.db.programme.delete({ where: { id: course.id } });
      return { deleted: true };
    }),

  termList: protectedProcedure
    .input(
      z
        .object({
          ...pageInput,
          includeIds: z.array(z.string().cuid()).max(100).optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        orgId: ctx.orgId,
        ...(input.query
          ? { name: { contains: input.query, mode: "insensitive" as const } }
          : {}),
      };
      const select = {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
      } as const;

      const [page, total, pinned] = await Promise.all([
        ctx.db.semester.findMany({
          where,
          select,
          orderBy: { startDate: "desc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        ctx.db.semester.count({ where }),
        input.includeIds?.length
          ? ctx.db.semester.findMany({
              where: { orgId: ctx.orgId, id: { in: input.includeIds } },
              select,
              orderBy: { startDate: "desc" },
            })
          : Promise.resolve([]),
      ]);

      const seen = new Set(page.map((t) => t.id));
      const rows = [...page, ...pinned.filter((t) => !seen.has(t.id))];
      // Decided here rather than in the browser: the dates are @db.Date, which
      // a client would read in its own timezone and get wrong at the edges.
      const today = new Date();

      return paged(
        rows.map((t) => ({
          id: t.id,
          name: t.name,
          startDate: t.startDate,
          endDate: t.endDate,
          isCurrent: t.startDate <= today && today <= t.endDate,
        })),
        total,
        input.page,
        input.pageSize,
      );
    }),

  /** The faculty profile of the signed-in user, if they have one. */
  me: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.facultyProfile.findUnique({
      where: { userId: ctx.actor.id },
      select: { id: true, shortName: true },
    });
  }),
});
