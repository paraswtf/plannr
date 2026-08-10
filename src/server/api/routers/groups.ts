import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { PermissionFlags } from "~/lib/permissions";
import {
  createTRPCRouter,
  permissionProcedure,
  protectedProcedure,
} from "~/server/api/trpc";

/**
 * Class groups: the cohorts that attend classes.
 *
 * Membership is edited either by picking people or by pasting a column of
 * emails or PRNs out of a spreadsheet, which is how the registry actually
 * hands these lists over.
 */

const displayName = (f: {
  shortName: string | null;
  user: { name: string | null };
}) => f.shortName ?? f.user.name ?? "Unnamed";

export const groupsRouter = createTRPCRouter({
  list: permissionProcedure(PermissionFlags.ViewGroups)
    .input(
      z
        .object({
          query: z.string().trim().max(120).optional(),
          courseId: z.string().cuid().optional(),
          termId: z.string().cuid().optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const groups = await ctx.db.group.findMany({
        where: {
          orgId: ctx.orgId,
          ...(input.courseId ? { courseId: input.courseId } : {}),
          ...(input.termId ? { termId: input.termId } : {}),
          ...(input.query
            ? {
                OR: [
                  { name: { contains: input.query, mode: "insensitive" } },
                  { label: { contains: input.query, mode: "insensitive" } },
                  {
                    course: {
                      code: { contains: input.query, mode: "insensitive" },
                    },
                  },
                ],
              }
            : {}),
        },
        include: {
          course: { select: { id: true, code: true, name: true } },
          term: { select: { id: true, name: true } },
          _count: { select: { students: true, events: true } },
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
        },
        orderBy: [{ course: { code: "asc" } }, { name: "asc" }],
      });

      return groups.map((g) => ({
        id: g.id,
        name: g.name,
        label: g.label ?? g.name,
        courseId: g.course.id,
        courseCode: g.course.code,
        termId: g.term?.id ?? null,
        termName: g.term?.name ?? null,
        studentCount: g._count.students,
        eventCount: g._count.events,
        faculty: g.faculty.map((a) => ({
          id: a.faculty.id,
          name: displayName(a.faculty),
        })),
      }));
    }),

  byId: permissionProcedure(PermissionFlags.ViewGroups)
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const group = await ctx.db.group.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        include: {
          course: { select: { id: true, code: true, name: true } },
          term: { select: { id: true, name: true } },
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
        course: group.course,
        term: group.term,
        eventCount: group._count.events,
        students: group.students.map((m) => ({
          id: m.student.id,
          userId: m.student.user.id,
          name: m.student.user.name,
          email: m.student.user.email,
          prn: m.student.prn,
          addedAt: m.addedAt,
        })),
        faculty: group.faculty.map((a) => ({
          id: a.faculty.id,
          name: displayName(a.faculty),
          email: a.faculty.user.email,
          department: a.faculty.department,
        })),
      };
    }),

  create: permissionProcedure(PermissionFlags.ManageGroups)
    .input(
      z.object({
        name: z.string().trim().min(1).max(60),
        label: z.string().trim().max(120).optional(),
        courseId: z.string().cuid(),
        termId: z.string().cuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.db.course.findFirst({
        where: { id: input.courseId, orgId: ctx.orgId },
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
          courseId: input.courseId,
          termId: input.termId ?? null,
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
          courseId: input.courseId,
          termId: input.termId,
        },
      });
    }),

  update: permissionProcedure(PermissionFlags.ManageGroups)
    .input(
      z.object({
        id: z.string().cuid(),
        name: z.string().trim().min(1).max(60).optional(),
        label: z.string().trim().max(120).nullish(),
        termId: z.string().cuid().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { count } = await ctx.db.group.updateMany({
        where: { id: input.id, orgId: ctx.orgId },
        data: { name: input.name, label: input.label, termId: input.termId },
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
      const emails = cleaned
        .filter((v) => v.includes("@"))
        .map((v) => v.toLowerCase());
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
            _count: { select: { students: true, events: true } },
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
          await tx.event.deleteMany({ where: { groupId: group.id } });
        }
        await tx.group.delete({ where: { id: group.id } });
        return { deleted: true, deletedEvents: eventCount };
      });
    }),

  facultyList: protectedProcedure.query(async ({ ctx }) => {
    const faculty = await ctx.db.facultyProfile.findMany({
      where: { orgId: ctx.orgId },
      include: { user: { select: { name: true } } },
      orderBy: { shortName: "asc" },
    });
    return faculty.map((f) => ({
      id: f.id,
      name: displayName(f),
      department: f.department,
    }));
  }),

  courseList: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.course.findMany({
      where: { orgId: ctx.orgId },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    });
  }),

  termList: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.term.findMany({
      where: { orgId: ctx.orgId },
      select: { id: true, name: true, startDate: true, endDate: true },
      orderBy: { startDate: "desc" },
    });
  }),

  /** The faculty profile of the signed-in user, if they have one. */
  me: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.facultyProfile.findUnique({
      where: { userId: ctx.actor.id },
      select: { id: true, shortName: true },
    });
  }),
});
