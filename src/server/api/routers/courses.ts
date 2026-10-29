import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { contactAddress } from "~/lib/people";
import { PermissionFlags } from "~/lib/permissions";
import { todayAsDate } from "~/lib/semester-dates";
import { pageArgs, pageInput, toPage } from "~/server/api/pagination";
import { createTRPCRouter, permissionProcedure } from "~/server/api/trpc";
import type { db as Database } from "~/server/db";
import type { Prisma } from "../../../../generated/prisma";

/**
 * Courses: the subjects taught in a semester.
 *
 * A course belongs to a semester rather than to the college in perpetuity,
 * because the people who teach it and the groups that sit for it change every
 * time it runs. Last semester's Deep Learning is a different row from this
 * one's, which is what keeps an old register readable.
 *
 * Nothing here decides who is enrolled: a student's courses are the courses of
 * the groups they belong to, so the enrolment question is answered by adding
 * them to a group.
 */

const courseSummary = {
  id: true,
  code: true,
  title: true,
  programme: { select: { id: true, code: true, name: true } },
  semester: { select: { id: true, name: true } },
  _count: { select: { events: true, faculty: true, groups: true } },
} as const;

/**
 * A catalogue row, named so the empty page can be typed as one.
 *
 * Without it the "no semester yet" branch hands back `never[]` and the two
 * branches of `list` are two different types, which every caller then has to
 * take apart before it can so much as map the rows.
 */
type CourseRow = Prisma.CourseGetPayload<{ select: typeof courseSummary }>;

/** The semester everything defaults to: the one running now, else the newest. */
async function currentSemester(db: typeof Database, orgId: string) {
  // Start and end are calendar dates, so compare against today's date in the
  // institution's timezone rather than the instant, which would end the
  // semester a day early.
  const today = todayAsDate();
  const running = await db.semester.findFirst({
    where: { orgId, startDate: { lte: today }, endDate: { gte: today } },
    orderBy: { startDate: "desc" },
  });
  return (
    running ??
    (await db.semester.findFirst({
      where: { orgId },
      orderBy: { startDate: "desc" },
    }))
  );
}

export const coursesRouter = createTRPCRouter({
  /**
   * Every course of a semester, for the catalogue screen.
   *
   * The page is the courses and the semester travels beside it, rather than the
   * envelope being buried under a `courses` key: `GET /courses` is a list of
   * courses, so it reads like every other list — `rows`, `total`, `pageCount` —
   * and the one extra field is context about the answer, which a client can
   * ignore without losing the ability to page.
   */
  list: permissionProcedure(PermissionFlags.ViewGroups)
    .input(
      z
        .object({
          semesterId: z.string().cuid().optional(),
          programmeId: z.string().cuid().optional(),
          search: z.string().trim().max(120).optional(),
          /**
           * Big enough to hold a semester whole, because the catalogue screen
           * reads the lot and then searches and filters it in the browser — it
           * matches a paper code and a programme code, neither of which the
           * title-only search here reaches. A default sized for a screen rather
           * than for a semester would take courses out of that filter without
           * anybody being told. A college teaches a few hundred subjects in a
           * term; a thousand is comfortably past that and still a response
           * worth serialising.
           */
          ...pageInput({ defaultSize: 1000, maxSize: 2000 }),
        })
        // `.default({})` rather than `.optional()`: a GET with no query string
        // arrives as undefined, and only a default turns that into the object
        // the page fields can then fill.
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const semester = input.semesterId
        ? { id: input.semesterId }
        : await currentSemester(ctx.db, ctx.orgId);
      // A college nobody has set up yet. It answers with an empty page rather
      // than a shape of its own, so one piece of client code reads both.
      if (!semester) {
        return { ...toPage<CourseRow>([], 0, input), semester: null };
      }

      const where = {
        orgId: ctx.orgId,
        semesterId: semester.id,
        ...(input.programmeId ? { programmeId: input.programmeId } : {}),
        ...(input.search
          ? { title: { contains: input.search, mode: "insensitive" as const } }
          : {}),
      };

      const [courses, total, full] = await Promise.all([
        ctx.db.course.findMany({
          where,
          select: courseSummary,
          orderBy: [{ programme: { code: "asc" } }, { title: "asc" }],
          ...pageArgs(input),
        }),
        ctx.db.course.count({ where }),
        ctx.db.semester.findUnique({
          where: { id: semester.id },
          select: { id: true, name: true, startDate: true, endDate: true },
        }),
      ]);

      return { ...toPage(courses, total, input), semester: full };
    }),

  /** One course: who may teach it, who sits for it, and when it meets. */
  byId: permissionProcedure(PermissionFlags.ViewGroups)
    .input(z.object({ courseId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const course = await ctx.db.course.findFirst({
        where: { id: input.courseId, orgId: ctx.orgId },
        select: {
          ...courseSummary,
          faculty: {
            select: {
              faculty: {
                select: {
                  id: true,
                  shortName: true,
                  user: { select: { name: true, email: true } },
                },
              },
            },
          },
          groups: {
            select: {
              group: {
                select: {
                  id: true,
                  name: true,
                  label: true,
                  kind: true,
                  _count: { select: { students: true } },
                },
              },
            },
          },
          events: {
            select: {
              id: true,
              title: true,
              startTime: true,
              endTime: true,
              rrule: true,
              room: { select: { code: true } },
              faculty: {
                select: { id: true, user: { select: { name: true } } },
              },
              group: { select: { id: true, name: true, label: true } },
              _count: { select: { occurrences: true } },
            },
            orderBy: { startTime: "asc" },
          },
        },
      });
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        ...course,
        faculty: course.faculty.map((row) => ({
          id: row.faculty.id,
          name:
            row.faculty.user.name ??
            row.faculty.shortName ??
            contactAddress(row.faculty.user.email) ??
            "Unnamed",
        })),
        groups: course.groups.map((row) => ({
          id: row.group.id,
          name: row.group.label ?? row.group.name,
          kind: row.group.kind,
          students: row.group._count.students,
        })),
        /** Everyone who sits for it, across every group taking it. */
        headcount: course.groups.reduce(
          (n, row) => n + row.group._count.students,
          0,
        ),
      };
    }),

  /**
   * Replaces the list of teachers cleared to take a course.
   *
   * It is a list rather than one name because the office assigns several and
   * chooses between them when a lecture is scheduled; taking somebody off it
   * does not touch the lectures they have already given.
   */
  setFaculty: permissionProcedure(PermissionFlags.ManageGroups)
    .input(
      z.object({
        courseId: z.string().cuid(),
        facultyIds: z.array(z.string().cuid()).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.db.course.findFirst({
        where: { id: input.courseId, orgId: ctx.orgId },
        select: { id: true },
      });
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.$transaction([
        ctx.db.courseFaculty.deleteMany({ where: { courseId: course.id } }),
        ctx.db.courseFaculty.createMany({
          data: input.facultyIds.map((facultyId) => ({
            courseId: course.id,
            facultyId,
          })),
          skipDuplicates: true,
        }),
      ]);
      return { facultyIds: input.facultyIds };
    }),

  /** Replaces the groups taking a course, which is what enrols their students. */
  setGroups: permissionProcedure(PermissionFlags.ManageGroups)
    .input(
      z.object({
        courseId: z.string().cuid(),
        groupIds: z.array(z.string().cuid()).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const course = await ctx.db.course.findFirst({
        where: { id: input.courseId, orgId: ctx.orgId },
        select: { id: true },
      });
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.$transaction([
        ctx.db.groupCourse.deleteMany({ where: { courseId: course.id } }),
        ctx.db.groupCourse.createMany({
          data: input.groupIds.map((groupId) => ({
            courseId: course.id,
            groupId,
          })),
          skipDuplicates: true,
        }),
      ]);
      return { groupIds: input.groupIds };
    }),

  /**
   * The shape of the institution, for the setup screen.
   *
   * One query rather than five, because the point of that screen is the chain —
   * programmes hold batches, a batch sits at a semester number, groups take
   * courses, courses are taught as lectures — and a number is only meaningful
   * next to the one before it.
   */
  structure: permissionProcedure(PermissionFlags.ViewGroups).query(
    async ({ ctx }) => {
      const semester = await currentSemester(ctx.db, ctx.orgId);
      if (!semester) return null;

      const [full, programmes, groups, lectures, registers] = await Promise.all(
        [
          ctx.db.semester.findUnique({
            where: { id: semester.id },
            select: { id: true, name: true, startDate: true, endDate: true },
          }),
          ctx.db.programme.findMany({
            where: { orgId: ctx.orgId },
            select: {
              id: true,
              code: true,
              name: true,
              _count: { select: { batches: true, courses: true } },
              batches: {
                select: {
                  id: true,
                  name: true,
                  // Only this semester's groups, like every other count here: the
                  // intake's older groups stay behind when a semester is carried
                  // forward, and the diagram's own total does not count them.
                  _count: {
                    select: { groups: { where: { semesterId: semester.id } } },
                  },
                  semesters: {
                    where: { semesterId: semester.id },
                    select: { number: true },
                  },
                },
                orderBy: { startYear: "asc" },
              },
            },
            orderBy: { code: "asc" },
          }),
          ctx.db.group.count({
            where: { orgId: ctx.orgId, semesterId: semester.id },
          }),
          // Every count on this screen sits under the semester's own heading, so
          // each one has to be scoped to it — an all-time total printed beneath
          // "Autumn 2026" is not a smaller truth, it is a wrong one.
          ctx.db.event.count({
            where: { orgId: ctx.orgId, kind: "CLASS", semesterId: semester.id },
          }),
          ctx.db.attendanceSession.count({
            where: {
              orgId: ctx.orgId,
              occurrence: { event: { semesterId: semester.id } },
            },
          }),
        ],
      );

      const courses = await ctx.db.course.count({
        where: { orgId: ctx.orgId, semesterId: semester.id },
      });
      const unstaffed = await ctx.db.course.count({
        where: {
          orgId: ctx.orgId,
          semesterId: semester.id,
          faculty: { none: {} },
        },
      });
      const untaught = await ctx.db.event.count({
        where: {
          orgId: ctx.orgId,
          kind: "CLASS",
          semesterId: semester.id,
          courseId: null,
        },
      });

      return {
        semester: full,
        programmes: programmes.map((programme) => ({
          id: programme.id,
          code: programme.code,
          name: programme.name,
          courses: programme._count.courses,
          batches: programme.batches.map((batch) => ({
            id: batch.id,
            name: batch.name,
            groups: batch._count.groups,
            /** Which semester this intake is in right now; empty if not stated. */
            number: batch.semesters[0]?.number ?? "",
          })),
        })),
        totals: { courses, groups, lectures, registers },
        /** Things a coordinator should see and fix, rather than discover later. */
        gaps: {
          coursesWithoutFaculty: unstaffed,
          lecturesWithoutCourse: untaught,
        },
      };
    },
  ),
});
