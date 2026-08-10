import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

/** Groups and faculty, as far as the booking form needs them. */
export const groupsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const groups = await ctx.db.group.findMany({
      where: { orgId: ctx.orgId },
      include: {
        course: { select: { code: true } },
        _count: { select: { students: true } },
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
      orderBy: { name: "asc" },
    });

    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      label: g.label ?? g.name,
      courseCode: g.course.code,
      studentCount: g._count.students,
      faculty: g.faculty.map((a) => ({
        id: a.faculty.id,
        name: a.faculty.shortName ?? a.faculty.user.name ?? "Unnamed",
      })),
    }));
  }),

  facultyList: protectedProcedure.query(async ({ ctx }) => {
    const faculty = await ctx.db.facultyProfile.findMany({
      where: { orgId: ctx.orgId },
      include: { user: { select: { name: true } } },
      orderBy: { shortName: "asc" },
    });
    return faculty.map((f) => ({
      id: f.id,
      name: f.shortName ?? f.user.name ?? "Unnamed",
      department: f.department,
    }));
  }),

  /** The faculty profile of the signed-in user, if they have one. */
  me: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.facultyProfile.findUnique({
      where: { userId: ctx.actor.id },
      select: { id: true, shortName: true },
    });
  }),
});
