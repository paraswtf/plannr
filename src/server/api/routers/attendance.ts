import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { personName } from "~/lib/people";
import { PermissionFlags } from "~/lib/permissions";
import {
  createTRPCRouter,
  permissionProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import type { db as Database } from "~/server/db";
import { AttendanceStatus } from "../../../../generated/prisma";

/**
 * Registers.
 *
 * Attendance belongs to an occurrence and a group, not to an event: it is taken
 * per sitting, and a lecture given to two groups is two registers. Marking is
 * idempotent — the same sitting can be corrected all week — so every write
 * replaces the register rather than appending to it.
 */

/**
 * Who may take this register: the person timetabled to give the lecture, and
 * nobody else.
 *
 * Deliberately narrow. A register is a statement that a named teacher saw these
 * people in a room, so it is not something a coordinator can supply from an
 * office — if the wrong person is on the lecture, the lecture is what needs
 * correcting.
 */
async function assertMayMark(
  ctx: {
    db: typeof Database;
    bits: {
      has: (flag: bigint) => boolean;
      hasAny: (...f: bigint[]) => boolean;
    };
    actor: { id: string };
    orgId: string;
  },
  occurrenceId: string,
) {
  const occurrence = await ctx.db.eventOccurrence.findFirst({
    where: { id: occurrenceId, orgId: ctx.orgId },
    select: { facultyId: true, event: { select: { createdById: true } } },
  });
  if (!occurrence) throw new TRPCError({ code: "NOT_FOUND" });

  if (!occurrence.facultyId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "This lecture has no teacher on it, so there is nobody who can take its register. Assign one first.",
    });
  }

  const profile = await ctx.db.facultyProfile.findUnique({
    where: { userId: ctx.actor.id },
    select: { id: true },
  });
  if (profile?.id === occurrence.facultyId) return occurrence;

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Only the teacher this lecture is timetabled to can take its register.",
  });
}

/**
 * The attendance rule the college applies.
 *
 * Present and late both mean the student was there. An excused absence is
 * neither attended nor conducted — it drops out of both sides, so being ill
 * with permission neither helps nor hurts the percentage.
 */
const ATTENDED = ["PRESENT", "LATE"] as const;
const THRESHOLD = 75;

export const attendanceRouter = createTRPCRouter({
  /**
   * Everything the marking screen needs: the lecture, its groups, each group's
   * roster, and whatever was marked last time.
   */
  forOccurrence: permissionProcedure(PermissionFlags.ViewAttendance)
    .input(z.object({ occurrenceId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const occurrence = await ctx.db.eventOccurrence.findFirst({
        where: { id: input.occurrenceId, orgId: ctx.orgId },
        include: {
          room: { select: { id: true, code: true } },
          faculty: {
            select: {
              id: true,
              shortName: true,
              user: { select: { name: true } },
            },
          },
          event: {
            select: {
              id: true,
              title: true,
              kind: true,
              groupId: true,
              groups: { select: { groupId: true } },
            },
          },
        },
      });
      if (!occurrence) return null;

      // The occurrence's own group plus any other group the lecture is shared
      // with; a combined lecture is one sitting and several registers.
      const groupIds = [
        ...new Set(
          [
            occurrence.groupId,
            occurrence.event.groupId,
            ...occurrence.event.groups.map((g) => g.groupId),
          ].filter((id): id is string => Boolean(id)),
        ),
      ];

      const [groups, sessions] = await Promise.all([
        ctx.db.group.findMany({
          where: { id: { in: groupIds }, orgId: ctx.orgId },
          select: {
            id: true,
            name: true,
            label: true,
            students: {
              select: {
                student: {
                  select: {
                    id: true,
                    prn: true,
                    user: { select: { name: true, email: true } },
                  },
                },
              },
              orderBy: { student: { prn: "asc" } },
            },
          },
          orderBy: { name: "asc" },
        }),
        ctx.db.attendanceSession.findMany({
          where: { occurrenceId: input.occurrenceId },
          include: {
            records: { select: { studentId: true, status: true } },
            markedBy: { select: { name: true, email: true } },
          },
        }),
      ]);

      const byGroup = new Map(sessions.map((s) => [s.groupId, s]));

      return {
        occurrenceId: occurrence.id,
        eventId: occurrence.event.id,
        title: occurrence.event.title,
        kind: occurrence.event.kind,
        start: occurrence.start,
        end: occurrence.end,
        status: occurrence.status,
        room: occurrence.room,
        facultyName:
          occurrence.faculty?.shortName ??
          occurrence.faculty?.user.name ??
          null,
        groups: groups.map((group) => {
          const session = byGroup.get(group.id);
          const marks = new Map(
            session?.records.map((r) => [r.studentId, r.status]) ?? [],
          );
          return {
            id: group.id,
            name: group.name,
            label: group.label ?? group.name,
            markedAt: session?.markedAt ?? null,
            markedBy: session?.markedBy ? personName(session.markedBy) : null,
            students: group.students.map(({ student }) => ({
              id: student.id,
              // The register prints the PRN beside this, so a student with
              // neither a name nor an address is still identifiable.
              name: personName(student.user),
              prn: student.prn,
              // Unmarked reads as present: a register is a list of who was
              // missing, and starting from all-present is how it is taken.
              status: marks.get(student.id) ?? AttendanceStatus.PRESENT,
              marked: marks.has(student.id),
            })),
          };
        }),
      };
    }),

  /** Replaces one group's register for one sitting. */
  mark: permissionProcedure(PermissionFlags.MarkAttendance)
    .input(
      z.object({
        occurrenceId: z.string().cuid(),
        groupId: z.string().cuid(),
        notes: z.string().max(500).optional(),
        records: z
          .array(
            z.object({
              studentId: z.string().cuid(),
              status: z.nativeEnum(AttendanceStatus),
              note: z.string().max(200).optional(),
            }),
          )
          .max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertMayMark(ctx, input.occurrenceId);

      return ctx.db.$transaction(async (tx) => {
        const session = await tx.attendanceSession.upsert({
          where: {
            occurrenceId_groupId: {
              occurrenceId: input.occurrenceId,
              groupId: input.groupId,
            },
          },
          update: {
            markedById: ctx.actor.id,
            markedAt: new Date(),
            notes: input.notes,
          },
          create: {
            orgId: ctx.orgId,
            occurrenceId: input.occurrenceId,
            groupId: input.groupId,
            markedById: ctx.actor.id,
            notes: input.notes,
          },
        });

        // Replaced wholesale: a correction that removes someone from the list
        // must not leave their old mark behind.
        await tx.attendanceRecord.deleteMany({
          where: { sessionId: session.id },
        });
        if (input.records.length > 0) {
          await tx.attendanceRecord.createMany({
            data: input.records.map((record) => ({
              sessionId: session.id,
              studentId: record.studentId,
              status: record.status,
              note: record.note,
            })),
          });
        }

        const present = input.records.filter(
          (r) => r.status === AttendanceStatus.PRESENT,
        ).length;
        return {
          sessionId: session.id,
          marked: input.records.length,
          present,
        };
      });
    }),

  /** A group's registers over a window, for the lectures list to badge. */
  forGroup: permissionProcedure(PermissionFlags.ViewAttendance)
    .input(
      z.object({
        groupId: z.string().cuid(),
        from: z.date().optional(),
        to: z.date().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sessions = await ctx.db.attendanceSession.findMany({
        where: {
          orgId: ctx.orgId,
          groupId: input.groupId,
          ...(input.from || input.to
            ? {
                occurrence: {
                  ...(input.from ? { start: { gte: input.from } } : {}),
                  ...(input.to ? { end: { lte: input.to } } : {}),
                },
              }
            : {}),
        },
        select: {
          occurrenceId: true,
          markedAt: true,
          records: { select: { status: true } },
        },
      });

      return sessions.map((session) => ({
        occurrenceId: session.occurrenceId,
        markedAt: session.markedAt,
        total: session.records.length,
        present: session.records.filter(
          (r) => r.status === AttendanceStatus.PRESENT,
        ).length,
      }));
    }),

  /** Whether this user may take the register here, for the UI to route on. */
  canMark: protectedProcedure
    .input(z.object({ occurrenceId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.bits.has(PermissionFlags.MarkAttendance)) return false;
      try {
        await assertMayMark(ctx, input.occurrenceId);
        return true;
      } catch {
        return false;
      }
    }),
  /**
   * A student's own attendance, course by course.
   *
   * Three numbers per course, and they answer different questions. *Attended*
   * over *conducted* is the percentage the college cares about, counted only
   * over registers that were actually taken — a lecture nobody marked cannot
   * count against anybody. *Scheduled* is the whole semester's sittings, so a
   * student can see how much of the course is still ahead of them.
   */
  mine: protectedProcedure.query(async ({ ctx }) => {
    const student = await ctx.db.studentProfile.findUnique({
      where: { userId: ctx.actor.id },
      select: { id: true, memberships: { select: { groupId: true } } },
    });
    if (!student) return { threshold: THRESHOLD, courses: [] };

    const groupIds = student.memberships.map((m) => m.groupId);
    if (groupIds.length === 0) return { threshold: THRESHOLD, courses: [] };

    // Every sitting of every course this student's groups take.
    const occurrences = await ctx.db.eventOccurrence.findMany({
      where: {
        orgId: ctx.orgId,
        groupId: { in: groupIds },
        status: { not: "CANCELLED" },
        event: { courseId: { not: null } },
      },
      select: {
        id: true,
        start: true,
        end: true,
        room: { select: { code: true } },
        faculty: { select: { user: { select: { name: true } } } },
        event: {
          select: {
            courseId: true,
            course: { select: { id: true, code: true, title: true } },
          },
        },
        attendance: {
          where: { groupId: { in: groupIds } },
          select: {
            records: {
              where: { studentId: student.id },
              select: { status: true },
            },
          },
        },
      },
      orderBy: { start: "desc" },
    });

    const byCourse = new Map<
      string,
      {
        id: string;
        code: string | null;
        title: string;
        attended: number;
        conducted: number;
        scheduled: number;
        register: Array<{
          occurrenceId: string;
          start: Date;
          end: Date;
          room: string | null;
          faculty: string | null;
          status: string | null;
        }>;
      }
    >();

    for (const occurrence of occurrences) {
      const course = occurrence.event.course;
      if (!course) continue;
      const entry = byCourse.get(course.id) ?? {
        id: course.id,
        code: course.code,
        title: course.title,
        attended: 0,
        conducted: 0,
        scheduled: 0,
        register: [],
      };

      entry.scheduled++;
      // A combined lecture carries a register per group and a student can sit in
      // more than one of them — a division and an elective set, say. Their mark
      // is on whichever register actually lists them, which is not reliably the
      // first one the query returns, so take the first that names them.
      const status =
        occurrence.attendance.flatMap((session) => session.records)[0]?.status ??
        null;
      // An excused absence counts on neither side: it neither helps the
      // percentage nor punishes somebody who was away with permission.
      if (status && status !== "EXCUSED") {
        entry.conducted++;
        if ((ATTENDED as readonly string[]).includes(status)) entry.attended++;
      }
      entry.register.push({
        occurrenceId: occurrence.id,
        start: occurrence.start,
        end: occurrence.end,
        room: occurrence.room?.code ?? null,
        faculty: occurrence.faculty?.user.name ?? null,
        status,
      });
      byCourse.set(course.id, entry);
    }

    const courses = [...byCourse.values()]
      .map((course) => {
        // Sittings that can still gain a mark, which is what any advice about
        // catching up has to be counted over. Not `scheduled - conducted`: that
        // also sweeps in the excused ones, which are already settled and will
        // never add to either side of the fraction.
        const remaining = course.register.filter(
          (sitting) => sitting.status === null,
        ).length;
        return {
          ...course,
          remaining,
          percentage:
            course.conducted === 0
              ? null
              : Math.round((course.attended / course.conducted) * 100),
          /** How many of those they must be present at to reach the threshold. */
          needed: shortfall(course.attended, course.conducted, remaining),
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));

    return { threshold: THRESHOLD, courses };
  }),

  /**
   * The courses this teacher's registers belong to.
   *
   * Being cleared to take a course is not enough — the office clears several
   * people per course and picks one per lecture. What puts a course on this list
   * is being the name on at least one of its sittings, which is also the only
   * thing that lets you mark anything.
   */
  myCourses: protectedProcedure.query(async ({ ctx }) => {
    const faculty = await ctx.db.facultyProfile.findUnique({
      where: { userId: ctx.actor.id },
      select: { id: true },
    });
    if (!faculty) return [];

    return ctx.db.course.findMany({
      where: {
        orgId: ctx.orgId,
        events: {
          some: {
            occurrences: {
              some: { facultyId: faculty.id, status: { not: "CANCELLED" } },
            },
          },
        },
      },
      select: { id: true, code: true, title: true },
      orderBy: [{ code: "asc" }, { title: "asc" }],
    });
  }),

  /**
   * A course's attendance for everyone taking it, for the teacher.
   *
   * Sorted by who is worst off, because the reason to open this screen is to
   * find the people in trouble rather than to admire the people who are fine.
   */
  forCourse: permissionProcedure(PermissionFlags.ViewAttendance)
    .input(z.object({ courseId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const course = await ctx.db.course.findFirst({
        where: { id: input.courseId, orgId: ctx.orgId },
        select: {
          id: true,
          code: true,
          title: true,
          groups: { select: { groupId: true } },
        },
      });
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });

      const groupIds = course.groups.map((g) => g.groupId);
      const [students, occurrences] = await Promise.all([
        ctx.db.studentGroupMembership.findMany({
          where: { groupId: { in: groupIds } },
          select: {
            group: { select: { name: true } },
            student: {
              select: { id: true, prn: true, user: { select: { name: true } } },
            },
          },
          orderBy: { student: { prn: "asc" } },
        }),
        ctx.db.eventOccurrence.findMany({
          where: {
            orgId: ctx.orgId,
            status: { not: "CANCELLED" },
            event: { courseId: course.id },
          },
          select: {
            groupId: true,
            attendance: {
              select: { records: { select: { studentId: true, status: true } } },
            },
          },
        }),
      ]);

      const tally = new Map<string, { attended: number; conducted: number }>();
      for (const occurrence of occurrences) {
        for (const session of occurrence.attendance) {
          for (const record of session.records) {
            if (record.status === "EXCUSED") continue;
            const entry = tally.get(record.studentId) ?? { attended: 0, conducted: 0 };
            entry.conducted++;
            if ((ATTENDED as readonly string[]).includes(record.status)) entry.attended++;
            tally.set(record.studentId, entry);
          }
        }
      }

      // The course may be taught to several divisions, and every one of them
      // sits its own set of lectures. Totalling them would put a number next to
      // each student that no student's attendance could ever be measured
      // against, so report the load one group actually carries.
      const perGroup = new Map<string, number>();
      for (const occurrence of occurrences) {
        if (!occurrence.groupId) continue;
        perGroup.set(
          occurrence.groupId,
          (perGroup.get(occurrence.groupId) ?? 0) + 1,
        );
      }
      const scheduled = Math.max(0, ...perGroup.values());

      // One row per student, not one per membership: an elective set and a
      // division can both take the same course, and somebody in both would
      // otherwise be listed twice under the same key.
      const byStudent = new Map<string, { name: string; prn: string; groups: string[] }>();
      for (const { student, group } of students) {
        const row = byStudent.get(student.id) ?? {
          name: personName(student.user, student.prn),
          prn: student.prn,
          groups: [],
        };
        if (!row.groups.includes(group.name)) row.groups.push(group.name);
        byStudent.set(student.id, row);
      }

      const rows = [...byStudent].map(([studentId, row]) => {
        const counts = tally.get(studentId) ?? { attended: 0, conducted: 0 };
        return {
          studentId,
          prn: row.prn,
          name: row.name,
          // Which division they sit with: the roster merges every group taking
          // the course, and a teacher chasing somebody needs to know where.
          groups: row.groups,
          ...counts,
          percentage:
            counts.conducted === 0 ? null : Math.round((counts.attended / counts.conducted) * 100),
        };
      });
      rows.sort((a, b) => (a.percentage ?? 101) - (b.percentage ?? 101));

      return {
        course: { id: course.id, code: course.code, title: course.title },
        threshold: THRESHOLD,
        scheduled,
        conducted: Math.max(0, ...rows.map((r) => r.conducted)),
        below: rows.filter((r) => r.percentage !== null && r.percentage < THRESHOLD).length,
        students: rows,
      };
    }),
});

/**
 * How many of the sittings still to be marked a student must be present at to
 * reach the threshold — or null when they are already there, or when it is out
 * of reach. The two nulls are opposite answers, so a caller has to read the
 * percentage before it can say anything about this number.
 */
function shortfall(
  attended: number,
  conducted: number,
  remaining: number,
): number | null {
  if (conducted > 0 && attended / conducted >= THRESHOLD / 100) return null;
  for (let extra = 1; extra <= remaining; extra++) {
    if ((attended + extra) / (conducted + extra) >= THRESHOLD / 100) return extra;
  }
  return null;
}
