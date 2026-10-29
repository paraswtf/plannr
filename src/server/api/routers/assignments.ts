import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  ASSIGNMENT_TYPE_META,
  ASSIGNMENT_TYPES,
  answerWindow,
  type AssignmentType,
} from "~/lib/assignments";
import {
  DEFAULT_TIMEZONE,
  formatDayLabel,
  formatHourLabel,
  toWallTime,
} from "~/lib/dates";
import { personName } from "~/lib/people";
import { isRunning } from "~/lib/semester-dates";
import { pageArgs, pageInput, toPage } from "~/server/api/pagination";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  assignmentForRead,
  assignmentForWrite,
  facultyProfileOf,
  managesAll,
  maySetAssignments,
  studentProfileOf,
  type AccessContext,
} from "~/server/services/assignments/access";
import {
  classesScheduledFor,
  pinSitting,
  refreshAssignmentTimes,
  scheduleClassForAssignment,
  sittingStates,
  teaches,
  teachingPairs,
  withdrawIdleClasses,
  type SittingState,
} from "~/server/services/assignments/sittings";
import { studentStatus } from "~/server/services/assignments/status";
import { notify } from "~/server/services/notifications/notify";
import { regenerateOccurrences, type Db } from "~/server/services/occurrences";
import { EventKind, EventStatus } from "../../../../generated/prisma";

/**
 * Tests and presentations: setting them, pinning them to classes, forming
 * presentation teams, and reading them back for whoever they concern.
 *
 * Every access decision goes through `access.ts`: a teacher manages what they
 * set, `ManageAllAssignments` manages everybody's, and a student reads their
 * own groups'. A teacher sets work only in classes they are timetabled to
 * teach, which the timetable decides (`teaches`), not the course register.
 */

const id = z.string().cuid();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Give the day as YYYY-MM-DD.");

/** Either one of the group's own sittings, or a new class scheduled for this. */
const sittingInput = z.union([
  z.object({ eventId: id, originalStart: z.date() }),
  z.object({
    newClass: z.object({
      roomId: id,
      startTime: z.date(),
      endTime: z.date(),
    }),
  }),
]);
type SittingInput = z.infer<typeof sittingInput>;

/** How bad a sitting's state is, for showing an assignment's worst. */
const SEVERITY: Record<SittingState, number> = {
  ok: 0,
  pending: 1,
  cancelled: 2,
  lost: 3,
};

async function orgTimezone(db: Db, orgId: string) {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true },
  });
  return org?.timezone ?? DEFAULT_TIMEZONE;
}

/** The semester new work belongs to: the active one, else the one running today. */
async function currentSemesterId(db: Db, orgId: string, timeZone: string) {
  const settings = await db.orgSettings.findUnique({
    where: { orgId },
    select: { activeSemesterId: true },
  });
  if (settings?.activeSemesterId) return settings.activeSemesterId;
  const semesters = await db.semester.findMany({
    where: { orgId },
    select: { id: true, startDate: true, endDate: true },
  });
  return semesters.find((s) => isRunning(s, new Date(), timeZone))?.id ?? null;
}

/** "Tue 4 Nov, 10am" in the institution's time. */
const when = (instant: Date, timeZone: string) =>
  `${formatDayLabel(instant, timeZone)}, ${formatHourLabel(instant, timeZone)}`;

/** A calendar day (YYYY-MM-DD) as a `@db.Date` value: midnight UTC of that day. */
const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** The calendar day an instant falls on in `timeZone`, as a `@db.Date` value. */
function localDate(instant: Date, timeZone: string): Date {
  const wall = toWallTime(instant, timeZone);
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
}

/** The users behind a group's students, for telling them something. */
async function studentsOfGroup(db: Db, groupId: string) {
  const users = await db.user.findMany({
    where: { studentProfile: { memberships: { some: { groupId } } } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** The caller's faculty profile, required unless they manage everybody's work. */
async function teacherOrManager(ctx: AccessContext) {
  if (managesAll(ctx)) {
    return (await facultyProfileOf(ctx.db, ctx.actor.id)) ?? null;
  }
  const faculty = await facultyProfileOf(ctx.db, ctx.actor.id);
  if (!faculty) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only teachers can set tests and presentations.",
    });
  }
  return faculty;
}

/**
 * Pins a test or a team's slot to a sitting, after checking the sitting is one
 * of the group's classes and, for a teacher, one they teach; or schedules a new
 * class for it. Returns the AssignmentSitting made and the pin's state.
 */
async function placeSitting(
  tx: Db,
  ctx: AccessContext,
  assignment: {
    id: string;
    type: AssignmentType;
    title: string;
    groupId: string;
    courseId: string | null;
    semesterId: string | null;
  },
  sitting: SittingInput,
  slot: { teamId: string | null } = { teamId: null },
) {
  if ("newClass" in sitting) {
    const pinned = await scheduleClassForAssignment(tx, {
      orgId: ctx.orgId,
      actor: { id: ctx.actor.id, bits: ctx.bits },
      groupId: assignment.groupId,
      courseId: assignment.courseId,
      semesterId: assignment.semesterId,
      roomId: sitting.newClass.roomId,
      startTime: sitting.newClass.startTime,
      endTime: sitting.newClass.endTime,
      title: `${ASSIGNMENT_TYPE_META[assignment.type].label}: ${assignment.title}`,
    });
    const row = await tx.assignmentSitting.create({
      data: {
        assignmentId: assignment.id,
        exceptionId: pinned.exceptionId,
        originalStart: pinned.originalStart,
        startsAt: pinned.startsAt,
        endsAt: pinned.endsAt,
        scheduledForIt: true,
        teamId: slot.teamId,
      },
    });
    return { row, state: pinned.state };
  }

  const occurrence = await tx.eventOccurrence.findFirst({
    where: {
      eventId: sitting.eventId,
      orgId: ctx.orgId,
      OR: [
        { exception: { originalStart: sitting.originalStart } },
        { exceptionId: null, start: sitting.originalStart },
      ],
    },
    select: {
      facultyId: true,
      groupId: true,
      kind: true,
      event: {
        select: { groupId: true, groups: { select: { groupId: true } } },
      },
    },
  });
  if (occurrence?.kind !== EventKind.CLASS) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That class is not on the timetable.",
    });
  }
  const attending = [
    occurrence.groupId,
    occurrence.event.groupId,
    ...occurrence.event.groups.map((g) => g.groupId),
  ];
  if (!attending.includes(assignment.groupId)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That class is not one of this group's. Pick one of theirs.",
    });
  }
  if (!managesAll(ctx)) {
    const faculty = await facultyProfileOf(tx, ctx.actor.id);
    if (occurrence.facultyId !== faculty?.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can set a test only in a class you teach.",
      });
    }
  }

  const pinned = await pinSitting(tx, {
    orgId: ctx.orgId,
    eventId: sitting.eventId,
    originalStart: sitting.originalStart,
  });
  const row = await tx.assignmentSitting.create({
    data: {
      assignmentId: assignment.id,
      exceptionId: pinned.exceptionId,
      originalStart: pinned.originalStart,
      startsAt: pinned.startsAt,
      endsAt: pinned.endsAt,
      scheduledForIt: false,
      teamId: slot.teamId,
    },
  });
  return { row, state: pinned.state };
}

/** Where a sitting is held, for a sentence: "Tue 4 Nov, 10am in A-101". */
async function sittingWords(
  db: Db,
  sitting: { exceptionId: string | null; startsAt: Date },
  timeZone: string,
) {
  const occurrence = sitting.exceptionId
    ? await db.eventOccurrence.findFirst({
        where: { exceptionId: sitting.exceptionId },
        select: { room: { select: { code: true } } },
      })
    : null;
  const at = when(sitting.startsAt, timeZone);
  return occurrence ? `${at} in ${occurrence.room.code}` : at;
}

/**
 * Whether a presentation slot falls inside the assignment's window, read as
 * calendar days in the institution's timezone.
 */
async function startOfSitting(tx: Db, sitting: SittingInput) {
  if ("newClass" in sitting) return sitting.newClass.startTime;
  const occurrence = await tx.eventOccurrence.findFirst({
    where: {
      eventId: sitting.eventId,
      OR: [
        { exception: { originalStart: sitting.originalStart } },
        { exceptionId: null, start: sitting.originalStart },
      ],
    },
    select: { start: true },
  });
  return occurrence?.start ?? sitting.originalStart;
}

/**
 * Refuses a presentation window that would leave booked slots outside it,
 * naming the teams, so the teacher rebooks them (or keeps the days) rather
 * than the presentation going on past the days it says it has.
 */
async function refuseSlotsOutside(
  tx: Db,
  orgId: string,
  assignmentId: string,
  window: { start: Date; end: Date },
) {
  const timeZone = await orgTimezone(tx, orgId);
  const slots = await tx.assignmentSitting.findMany({
    where: { assignmentId, teamId: { not: null } },
    select: { startsAt: true, team: { select: { name: true } } },
    orderBy: { startsAt: "asc" },
  });
  const outside = slots.filter((slot) => {
    const date = localDate(slot.startsAt, timeZone);
    return date < window.start || date > window.end;
  });
  if (outside.length === 0) return;
  const names = [...new Set(outside.map((slot) => slot.team?.name ?? ""))];
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `${names.join(", ")} ${names.length === 1 ? "is" : "are"} booked outside those days. Move or clear ${names.length === 1 ? "that slot" : "those slots"} first, or keep days that include them.`,
  });
}

const windowInput = z
  .object({ start: day, end: day })
  .refine((w) => w.end >= w.start, {
    message: "The last day must be on or after the first.",
  })
  .refine(
    (w) =>
      (asDate(w.end).getTime() - asDate(w.start).getTime()) / 86_400_000 <= 120,
    { message: "A presentation window can be at most 120 days." },
  );

export const assignmentsRouter = createTRPCRouter({
  /**
   * The (group, course) pairs the caller can set work for this semester, for
   * the create form: the ones they teach, or every pair for somebody who
   * manages everybody's work.
   */
  teaching: protectedProcedure.query(async ({ ctx }) => {
    if (!maySetAssignments(ctx)) return [];
    const timeZone = await orgTimezone(ctx.db, ctx.orgId);
    const semesterId = await currentSemesterId(ctx.db, ctx.orgId, timeZone);

    if (managesAll(ctx)) {
      const links = await ctx.db.groupCourse.findMany({
        where: {
          group: { orgId: ctx.orgId },
          ...(semesterId ? { course: { semesterId } } : {}),
        },
        select: {
          group: { select: { id: true, name: true, label: true } },
          course: { select: { id: true, title: true } },
        },
      });
      return links
        .map((l) => ({
          groupId: l.group.id,
          groupLabel: l.group.label ?? l.group.name,
          courseId: l.course.id,
          courseTitle: l.course.title,
        }))
        .sort(
          (a, b) =>
            a.groupLabel.localeCompare(b.groupLabel) ||
            a.courseTitle.localeCompare(b.courseTitle),
        );
    }

    const faculty = await facultyProfileOf(ctx.db, ctx.actor.id);
    if (!faculty) return [];
    return teachingPairs(ctx.db, {
      orgId: ctx.orgId,
      facultyId: faculty.id,
      semesterId,
    });
  }),

  /**
   * The group's coming sittings a test can be set in: classes the caller
   * teaches (all of them for somebody who manages everybody's work), with
   * what is already pinned there.
   */
  sittingsFor: protectedProcedure
    .input(
      z.object({
        groupId: id,
        courseId: id.optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        ...pageInput({ defaultSize: 200, maxSize: 500 }),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!maySetAssignments(ctx)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only teachers can set tests and presentations.",
        });
      }
      const faculty = managesAll(ctx)
        ? null
        : await facultyProfileOf(ctx.db, ctx.actor.id);
      if (!managesAll(ctx) && !faculty) return toPage([], 0, input);

      const from = input.from ?? new Date();
      const to = input.to ?? new Date(from.getTime() + 60 * 86_400_000);
      const where = {
        orgId: ctx.orgId,
        kind: EventKind.CLASS,
        status: { in: [EventStatus.CONFIRMED, EventStatus.PENDING] },
        start: { gte: from, lt: to },
        OR: [
          { groupId: input.groupId },
          { event: { groups: { some: { groupId: input.groupId } } } },
        ],
        ...(input.courseId ? { event: { courseId: input.courseId } } : {}),
        ...(faculty ? { facultyId: faculty.id } : {}),
      };
      const [rows, total] = await Promise.all([
        ctx.db.eventOccurrence.findMany({
          where,
          select: {
            eventId: true,
            start: true,
            end: true,
            exceptionId: true,
            exception: { select: { originalStart: true } },
            room: { select: { code: true } },
            event: {
              select: {
                title: true,
                status: true,
                course: { select: { title: true } },
              },
            },
          },
          orderBy: [{ start: "asc" }, { id: "asc" }],
          ...pageArgs(input),
        }),
        ctx.db.eventOccurrence.count({ where }),
      ]);

      const exceptionIds = rows
        .map((r) => r.exceptionId)
        .filter((x): x is string => !!x);
      const pins = exceptionIds.length
        ? await ctx.db.assignmentSitting.findMany({
            where: { exceptionId: { in: exceptionIds } },
            select: {
              exceptionId: true,
              assignment: { select: { id: true, title: true } },
            },
          })
        : [];

      return toPage(
        rows.map((r) => ({
          eventId: r.eventId,
          originalStart: r.exception?.originalStart ?? r.start,
          start: r.start,
          end: r.end,
          roomCode: r.room.code,
          title: r.event.title,
          courseTitle: r.event.course?.title ?? null,
          /** The class itself still waits for approval. */
          pending: r.event.status === EventStatus.PENDING,
          pinned: pins
            .filter((p) => p.exceptionId === r.exceptionId)
            .map((p) => ({
              assignmentId: p.assignment.id,
              title: p.assignment.title,
            })),
        })),
        total,
        input,
      );
    }),

  /**
   * Upcoming or past assignments: what the caller set (everybody's, for
   * somebody who manages all), and, for a student, their groups'. Upcoming is
   * soonest first; past is the most recent first.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          when: z.enum(["upcoming", "past"]).default("upcoming"),
          ...pageInput({ defaultSize: 50, maxSize: 200 }),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const student = await studentProfileOf(ctx.db, ctx.actor.id);
      const groupIds = student?.memberships.map((m) => m.groupId) ?? [];

      const mine = managesAll(ctx)
        ? [{}]
        : [
            ...(maySetAssignments(ctx) ? [{ createdById: ctx.actor.id }] : []),
            ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
          ];
      if (mine.length === 0) return toPage([], 0, input);

      const where = {
        orgId: ctx.orgId,
        AND: [
          { OR: mine },
          input.when === "upcoming"
            ? { OR: [{ endsAt: { gte: now } }, { endsAt: null }] }
            : { endsAt: { lt: now } },
        ],
      };
      const [rows, total] = await Promise.all([
        ctx.db.assignment.findMany({
          where,
          select: {
            id: true,
            type: true,
            title: true,
            createdById: true,
            groupId: true,
            startsAt: true,
            endsAt: true,
            durationMinutes: true,
            marksPublishedAt: true,
            group: {
              select: {
                id: true,
                name: true,
                label: true,
                _count: { select: { students: true } },
              },
            },
            course: { select: { id: true, title: true } },
            sittings: { select: { id: true } },
            paper: {
              select: {
                releasedAt: true,
                closedAt: true,
                answersCloseAt: true,
              },
            },
          },
          orderBy:
            input.when === "upcoming"
              ? [{ startsAt: { sort: "asc", nulls: "last" } }, { id: "asc" }]
              : [{ endsAt: "desc" }, { id: "asc" }],
          ...pageArgs(input),
        }),
        ctx.db.assignment.count({ where }),
      ]);

      const ids = rows.map((r) => r.id);
      const [states, counts, own] = await Promise.all([
        sittingStates(
          ctx.db,
          rows.flatMap((r) => r.sittings.map((s) => s.id)),
        ),
        ctx.db.submission.groupBy({
          by: ["assignmentId"],
          where: { assignmentId: { in: ids }, status: "SUBMITTED" },
          _count: { _all: true },
        }),
        student
          ? ctx.db.submission.findMany({
              where: { assignmentId: { in: ids }, studentId: student.id },
              select: { assignmentId: true, status: true },
            })
          : Promise.resolve([]),
      ]);
      const submitted = new Map(
        counts.map((c) => [c.assignmentId, c._count._all]),
      );
      const mineOf = new Map(own.map((s) => [s.assignmentId, s.status]));

      return toPage(
        rows.map((r) => {
          const manager =
            managesAll(ctx) ||
            (r.createdById === ctx.actor.id && maySetAssignments(ctx));
          const worst = r.sittings
            .map((s) => states.get(s.id) ?? "lost")
            .reduce<SittingState | "none">(
              (w, s) => (w === "none" || SEVERITY[s] > SEVERITY[w] ? s : w),
              "none",
            );
          const window = answerWindow({
            releasedAt: r.paper?.releasedAt ?? null,
            closedAt: r.paper?.closedAt ?? null,
            answersCloseAt: r.paper?.answersCloseAt ?? null,
            sittingEndsAt: r.endsAt,
            durationMinutes: r.durationMinutes,
          });
          const paper = !r.paper
            ? ("none" as const)
            : !window
              ? ("locked" as const)
              : now <= window.closesAt
                ? ("open" as const)
                : ("closed" as const);
          const status = mineOf.get(r.id);
          return {
            id: r.id,
            type: r.type,
            title: r.title,
            group: { id: r.group.id, label: r.group.label ?? r.group.name },
            course: r.course,
            startsAt: r.startsAt,
            endsAt: r.endsAt,
            role: manager ? ("manager" as const) : ("student" as const),
            state: worst,
            paper,
            ...(manager
              ? {
                  submissions: {
                    submitted: submitted.get(r.id) ?? 0,
                    total: r.group._count.students,
                  },
                }
              : {
                  mine: studentStatus(status, window, now),
                  marksPublished: r.marksPublishedAt !== null,
                }),
          };
        }),
        total,
        input,
      );
    }),

  /** Everything the detail screen needs, for the caller's part in it. */
  byId: protectedProcedure
    .input(z.object({ id }))
    .query(async ({ ctx, input }) => {
      const { assignment, role, studentId } = await assignmentForRead(
        ctx,
        input.id,
      );
      const [full, students, submittedCount] = await Promise.all([
        ctx.db.assignment.findUniqueOrThrow({
          where: { id: assignment.id },
          select: {
            group: { select: { id: true, name: true, label: true } },
            course: { select: { id: true, title: true } },
            createdBy: { select: { id: true, name: true, email: true } },
            sittings: {
              select: {
                id: true,
                exceptionId: true,
                originalStart: true,
                startsAt: true,
                endsAt: true,
                scheduledForIt: true,
                teamId: true,
                position: true,
                exception: {
                  select: {
                    eventId: true,
                    occurrence: {
                      select: { room: { select: { code: true } } },
                    },
                  },
                },
              },
              orderBy: [{ startsAt: "asc" }, { position: "asc" }],
            },
            teams: {
              select: {
                id: true,
                name: true,
                topic: true,
                position: true,
                members: {
                  select: {
                    studentId: true,
                    student: {
                      select: {
                        prn: true,
                        user: { select: { name: true, email: true } },
                      },
                    },
                  },
                },
              },
              orderBy: [{ position: "asc" }, { name: "asc" }],
            },
            paper: {
              select: {
                source: true,
                ownerId: true,
                fileName: true,
                pageCount: true,
                totalMarks: true,
                releasedAt: true,
                closedAt: true,
                answersCloseAt: true,
              },
            },
          },
        }),
        ctx.db.studentGroupMembership.count({
          where: { groupId: assignment.groupId },
        }),
        role === "manager"
          ? ctx.db.submission.count({
              where: { assignmentId: assignment.id, status: "SUBMITTED" },
            })
          : Promise.resolve(0),
      ]);
      const states = await sittingStates(
        ctx.db,
        full.sittings.map((s) => s.id),
      );

      const myTeamId =
        role === "student"
          ? (full.teams.find((t) =>
              t.members.some((m) => m.studentId === studentId),
            )?.id ?? null)
          : null;

      return {
        id: assignment.id,
        type: assignment.type,
        title: assignment.title,
        instructions: assignment.instructions,
        role,
        group: {
          id: full.group.id,
          label: full.group.label ?? full.group.name,
        },
        course: full.course,
        setBy: full.createdBy
          ? { id: full.createdBy.id, name: personName(full.createdBy) }
          : null,
        isMine: assignment.createdById === ctx.actor.id,
        durationMinutes: assignment.durationMinutes,
        window:
          assignment.windowStart && assignment.windowEnd
            ? {
                start: assignment.windowStart.toISOString().slice(0, 10),
                end: assignment.windowEnd.toISOString().slice(0, 10),
              }
            : null,
        minutesPerTeam: assignment.minutesPerTeam,
        startsAt: assignment.startsAt,
        endsAt: assignment.endsAt,
        marksPublishedAt: assignment.marksPublishedAt,
        sittings: full.sittings.map((s) => ({
          id: s.id,
          /** The pinned class sitting; what reorderSlots addresses a shared class by. */
          exceptionId: s.exceptionId,
          state: states.get(s.id) ?? "lost",
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          originalStart: s.originalStart,
          eventId: s.exception?.eventId ?? null,
          roomCode: s.exception?.occurrence?.room.code ?? null,
          scheduledForIt: s.scheduledForIt,
          teamId: s.teamId,
          position: s.position,
        })),
        teams: full.teams.map((t) => ({
          id: t.id,
          name: t.name,
          topic: t.topic,
          position: t.position,
          mine: t.id === myTeamId,
          // A student sees who is in their own team, and only the names of
          // the others.
          members:
            role === "manager" || t.id === myTeamId
              ? t.members.map((m) => ({
                  studentId: m.studentId,
                  name: personName(m.student.user, m.student.prn),
                  prn: m.student.prn,
                }))
              : [],
        })),
        paper: !full.paper
          ? null
          : role === "manager"
            ? {
                source: full.paper.source,
                isOwner: full.paper.ownerId === ctx.actor.id,
                fileName: full.paper.fileName,
                pageCount: full.paper.pageCount,
                totalMarks: full.paper.totalMarks,
                releasedAt: full.paper.releasedAt,
                closedAt: full.paper.closedAt,
              }
            : {
                releasedAt: full.paper.releasedAt,
                closedAt: full.paper.closedAt,
                window: answerWindow({
                  releasedAt: full.paper.releasedAt,
                  closedAt: full.paper.closedAt,
                  answersCloseAt: full.paper.answersCloseAt,
                  sittingEndsAt: assignment.endsAt,
                  durationMinutes: assignment.durationMinutes,
                }),
              },
        counts: { students, submitted: submittedCount },
      };
    }),

  /**
   * Sets a test (with its sitting) or a presentation (with its window), and
   * tells the group's students.
   */
  create: protectedProcedure
    .input(
      z.object({
        type: z.enum(ASSIGNMENT_TYPES),
        title: z.string().trim().min(1).max(160),
        instructions: z.string().trim().max(4000).optional(),
        groupId: id,
        courseId: id.optional(),
        durationMinutes: z.number().int().min(5).max(600).optional(),
        sitting: sittingInput.optional(),
        window: windowInput.optional(),
        minutesPerTeam: z.number().int().min(1).max(240).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!maySetAssignments(ctx)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only teachers can set tests and presentations.",
        });
      }
      const meta = ASSIGNMENT_TYPE_META[input.type];
      const [group, course, timeZone] = await Promise.all([
        ctx.db.group.findFirst({
          where: { id: input.groupId, orgId: ctx.orgId },
          select: { id: true, semesterId: true, name: true, label: true },
        }),
        input.courseId
          ? ctx.db.course.findFirst({
              where: { id: input.courseId, orgId: ctx.orgId },
              select: { id: true, semesterId: true, title: true },
            })
          : Promise.resolve(null),
        orgTimezone(ctx.db, ctx.orgId),
      ]);
      if (!group) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That group does not exist.",
        });
      }
      if (input.courseId && !course) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That course does not exist.",
        });
      }

      if (!managesAll(ctx)) {
        const faculty = await teacherOrManager(ctx);
        const allowed = await teaches(ctx.db, {
          orgId: ctx.orgId,
          facultyId: faculty!.id,
          groupId: group.id,
          courseId: input.courseId ?? null,
        });
        if (!allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "You can set work only for a group you teach, in a course you teach them.",
          });
        }
      }

      if (meta.isTest && !input.sitting) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "A test needs a class to happen in. Pick one, or schedule one.",
        });
      }
      if (!meta.isTest && !input.window) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A presentation needs the days it runs over.",
        });
      }

      return ctx.db.$transaction(async (tx) => {
        const assignment = await tx.assignment.create({
          data: {
            orgId: ctx.orgId,
            type: input.type,
            title: input.title,
            instructions: (input.instructions ?? "") || null,
            groupId: group.id,
            courseId: course?.id ?? null,
            semesterId: group.semesterId ?? course?.semesterId ?? null,
            createdById: ctx.actor.id,
            durationMinutes: meta.answeredInApp
              ? (input.durationMinutes ?? null)
              : null,
            windowStart: input.window ? asDate(input.window.start) : null,
            windowEnd: input.window ? asDate(input.window.end) : null,
            minutesPerTeam: meta.isTest ? null : (input.minutesPerTeam ?? null),
          },
        });

        let pending = false;
        let where: string | null = null;
        if (meta.isTest && input.sitting) {
          const placed = await placeSitting(
            tx,
            { ...ctx, db: tx },
            assignment,
            input.sitting,
          );
          pending = placed.state === "pending";
          where = await sittingWords(tx, placed.row, timeZone);
        }
        await refreshAssignmentTimes(tx, [assignment.id]);

        const what = [meta.label, course?.title].filter(Boolean).join(", ");
        await notify(tx, await studentsOfGroup(tx, group.id), {
          orgId: ctx.orgId,
          category: "ASSIGNMENTS",
          title: `${meta.label} set: ${assignment.title}`,
          body: where
            ? `${what}. ${where}.${pending ? " The class is waiting for approval." : ""}`
            : `${what}. ${input.window!.start} to ${input.window!.end}.`,
          url: `/assignments/${assignment.id}`,
          sourceKey: `assignment-set:${assignment.id}`,
        });
        return { id: assignment.id, pending };
      });
    }),

  /** Changes what an assignment says and, for a presentation, its window. */
  update: protectedProcedure
    .input(
      z.object({
        id,
        title: z.string().trim().min(1).max(160).optional(),
        instructions: z.string().trim().max(4000).nullable().optional(),
        durationMinutes: z.number().int().min(5).max(600).nullable().optional(),
        window: windowInput.optional(),
        minutesPerTeam: z.number().int().min(1).max(240).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const assignment = await assignmentForWrite(ctx, input.id);
      const meta = ASSIGNMENT_TYPE_META[assignment.type];
      return ctx.db.$transaction(async (tx) => {
        if (input.window && !meta.isTest) {
          await refuseSlotsOutside(tx, ctx.orgId, assignment.id, {
            start: asDate(input.window.start),
            end: asDate(input.window.end),
          });
        }
        await tx.assignment.update({
          where: { id: assignment.id },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.instructions !== undefined
              ? { instructions: (input.instructions ?? "") || null }
              : {}),
            ...(input.durationMinutes !== undefined && meta.answeredInApp
              ? { durationMinutes: input.durationMinutes }
              : {}),
            ...(input.window && !meta.isTest
              ? {
                  windowStart: asDate(input.window.start),
                  windowEnd: asDate(input.window.end),
                }
              : {}),
            ...(input.minutesPerTeam !== undefined && !meta.isTest
              ? { minutesPerTeam: input.minutesPerTeam }
              : {}),
          },
        });
        if (input.window) await refreshAssignmentTimes(tx, [assignment.id]);
        return { ok: true as const };
      });
    }),

  /** Moves a test to another sitting, or a new class, and tells the students. */
  setSitting: protectedProcedure
    .input(z.object({ id, sitting: sittingInput }))
    .mutation(async ({ ctx, input }) => {
      const assignment = await assignmentForWrite(ctx, input.id);
      if (!ASSIGNMENT_TYPE_META[assignment.type].isTest) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A presentation is booked team by team. Use its slots.",
        });
      }
      const timeZone = await orgTimezone(ctx.db, ctx.orgId);
      return ctx.db.$transaction(async (tx) => {
        // The old pin goes; the class it was in stays on the timetable,
        // which is somebody else's to cancel if it was only for this. An
        // extra class still waiting for approval is the exception: nobody has
        // it yet, and approving it now would only put an empty class on the
        // group's timetable.
        const before = await classesScheduledFor(tx, {
          assignmentId: assignment.id,
          teamId: null,
        });
        await tx.assignmentSitting.deleteMany({
          where: { assignmentId: assignment.id, teamId: null },
        });
        const placed = await placeSitting(
          tx,
          { ...ctx, db: tx },
          assignment,
          input.sitting,
        );
        await withdrawIdleClasses(tx, before);
        await refreshAssignmentTimes(tx, [assignment.id]);
        const where = await sittingWords(tx, placed.row, timeZone);
        await notify(tx, await studentsOfGroup(tx, assignment.groupId), {
          orgId: ctx.orgId,
          category: "ASSIGNMENTS",
          title: `${ASSIGNMENT_TYPE_META[assignment.type].label} moved: ${assignment.title}`,
          body: `Now ${where}.`,
          url: `/assignments/${assignment.id}`,
          // The new pin's id: fresh on every move, so moving a test back to a
          // time it had before is news again rather than a duplicate.
          sourceKey: `assignment-moved:${assignment.id}:${placed.row.id}`,
        });
        return { pending: placed.state === "pending" };
      });
    }),

  /**
   * Deletes an assignment and tells the students it concerned. Its answers and
   * marks go with it, so once anybody has answered, the caller has to say they
   * mean it. Classes scheduled only for it can be cancelled in the same step;
   * one of those still waiting for approval is withdrawn whatever the caller
   * says, since nobody has it yet and approving it would put an empty class
   * on the group's timetable.
   */
  remove: protectedProcedure
    .input(
      z.object({
        id,
        cancelScheduledClasses: z.boolean().default(false),
        confirmAnswers: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const assignment = await assignmentForWrite(ctx, input.id);
      const answered = await ctx.db.submission.count({
        where: { assignmentId: assignment.id },
      });
      if (answered > 0 && !input.confirmAnswers) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${answered} ${answered === 1 ? "student has" : "students have"} answered this. Deleting it deletes their answers and marks.`,
        });
      }
      return ctx.db.$transaction(async (tx) => {
        const own = await classesScheduledFor(tx, {
          assignmentId: assignment.id,
        });
        let cancelled = 0;
        if (input.cancelScheduledClasses) {
          for (const eventId of new Set(own)) {
            const others = await tx.assignmentSitting.count({
              where: {
                assignmentId: { not: assignment.id },
                exception: { eventId },
              },
            });
            if (others > 0) continue;
            await tx.event.update({
              where: { id: eventId },
              data: { status: EventStatus.CANCELLED },
            });
            await regenerateOccurrences(tx, eventId);
            cancelled += 1;
          }
        }
        await tx.assignment.delete({ where: { id: assignment.id } });
        cancelled += await withdrawIdleClasses(tx, own);

        // They were told it was set, so they are told it is not. Not for one
        // that is over: that would be news of nothing to do.
        if (!assignment.endsAt || assignment.endsAt >= new Date()) {
          const label = ASSIGNMENT_TYPE_META[assignment.type].label;
          await notify(tx, await studentsOfGroup(tx, assignment.groupId), {
            orgId: ctx.orgId,
            category: "ASSIGNMENTS",
            title: `${label} withdrawn: ${assignment.title}`,
            body: "It has been taken off, so there is nothing to prepare for it.",
            // The list, not the assignment: that link would find nothing now.
            url: "/assignments",
            sourceKey: `assignment-removed:${assignment.id}`,
          });
        }
        return { removed: true as const, cancelledClasses: cancelled };
      });
    }),

  /** The group's students, for forming presentation teams. */
  groupStudents: protectedProcedure
    .input(z.object({ id }))
    .query(async ({ ctx, input }) => {
      const assignment = await assignmentForWrite(ctx, input.id);
      const students = await ctx.db.studentProfile.findMany({
        where: { memberships: { some: { groupId: assignment.groupId } } },
        select: {
          id: true,
          prn: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { prn: "asc" },
      });
      return students.map((s) => ({
        studentId: s.id,
        userId: s.user.id,
        name: personName(s.user, s.prn),
        prn: s.prn,
      }));
    }),

  /**
   * Replaces a presentation's teams. Teams keep their ids, and so their slots,
   * where the caller passes them; teams left out are deleted with their slots.
   * Everybody named must be a student of the group, and in one team only.
   */
  saveTeams: protectedProcedure
    .input(
      z.object({
        id,
        teams: z
          .array(
            z.object({
              id: id.optional(),
              name: z.string().trim().min(1).max(80),
              topic: z.string().trim().max(200).optional(),
              studentIds: z.array(id).max(50),
            }),
          )
          .max(60),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const assignment = await assignmentForWrite(ctx, input.id);
      if (assignment.type !== "PRESENTATION") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only a presentation has teams.",
        });
      }

      const named = input.teams.flatMap((t) => t.studentIds);
      const seen = new Set<string>();
      const twice = named.find((s) => (seen.has(s) ? true : !seen.add(s)));
      if (twice) {
        const student = await ctx.db.studentProfile.findUnique({
          where: { id: twice },
          select: { prn: true, user: { select: { name: true, email: true } } },
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${student ? personName(student.user, student.prn) : "A student"} is in two teams. Put each student in one.`,
        });
      }
      const members = await ctx.db.studentGroupMembership.count({
        where: { groupId: assignment.groupId, studentId: { in: [...seen] } },
      });
      if (members !== seen.size) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Some of those students are not in this group.",
        });
      }

      return ctx.db.$transaction(async (tx) => {
        const existing = await tx.presentationTeam.findMany({
          where: { assignmentId: assignment.id },
          select: { id: true },
        });
        const kept = new Set(
          input.teams.map((t) => t.id).filter((x): x is string => !!x),
        );
        for (const keptId of kept) {
          if (!existing.some((e) => e.id === keptId)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "One of those teams is not part of this presentation.",
            });
          }
        }
        await tx.presentationTeam.deleteMany({
          where: {
            assignmentId: assignment.id,
            id: { notIn: [...kept] },
          },
        });
        await tx.presentationTeamMember.deleteMany({
          where: { assignmentId: assignment.id },
        });

        const saved = [];
        for (const [position, team] of input.teams.entries()) {
          const row = team.id
            ? await tx.presentationTeam.update({
                where: { id: team.id },
                data: {
                  name: team.name,
                  topic: (team.topic ?? "") || null,
                  position,
                },
              })
            : await tx.presentationTeam.create({
                data: {
                  assignmentId: assignment.id,
                  name: team.name,
                  topic: (team.topic ?? "") || null,
                  position,
                },
              });
          if (team.studentIds.length) {
            await tx.presentationTeamMember.createMany({
              data: team.studentIds.map((studentId) => ({
                teamId: row.id,
                studentId,
                assignmentId: assignment.id,
              })),
            });
          }
          saved.push({ id: row.id, name: row.name });
        }
        await refreshAssignmentTimes(tx, [assignment.id]);
        return { teams: saved };
      });
    }),

  /**
   * Books a team's presentation slot in one of the group's sittings inside the
   * window, or in a new class. Teams sharing a sitting present in the order
   * they were booked, which `reorderSlots` changes.
   */
  setSlot: protectedProcedure
    .input(z.object({ id, teamId: id, sitting: sittingInput }))
    .mutation(async ({ ctx, input }) => {
      const assignment = await assignmentForWrite(ctx, input.id);
      if (assignment.type !== "PRESENTATION") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only a presentation has slots.",
        });
      }
      const team = await ctx.db.presentationTeam.findFirst({
        where: { id: input.teamId, assignmentId: assignment.id },
        select: {
          id: true,
          name: true,
          members: { select: { student: { select: { userId: true } } } },
        },
      });
      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That team is not part of this presentation.",
        });
      }
      const timeZone = await orgTimezone(ctx.db, ctx.orgId);

      return ctx.db.$transaction(async (tx) => {
        const starts = await startOfSitting(tx, input.sitting);
        const date = localDate(starts, timeZone);
        if (
          !assignment.windowStart ||
          !assignment.windowEnd ||
          date < assignment.windowStart ||
          date > assignment.windowEnd
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "That class is outside the presentation's days. Pick one inside them.",
          });
        }

        const before = await classesScheduledFor(tx, {
          assignmentId: assignment.id,
          teamId: team.id,
        });
        await tx.assignmentSitting.deleteMany({
          where: { assignmentId: assignment.id, teamId: team.id },
        });
        const placed = await placeSitting(
          tx,
          { ...ctx, db: tx },
          assignment,
          input.sitting,
          { teamId: team.id },
        );
        await withdrawIdleClasses(tx, before);
        const sharing = await tx.assignmentSitting.count({
          where: {
            exceptionId: placed.row.exceptionId,
            teamId: { not: null },
            id: { not: placed.row.id },
          },
        });
        await tx.assignmentSitting.update({
          where: { id: placed.row.id },
          data: { position: sharing },
        });
        await refreshAssignmentTimes(tx, [assignment.id]);

        const where = await sittingWords(tx, placed.row, timeZone);
        await notify(
          tx,
          team.members.map((m) => m.student.userId),
          {
            orgId: ctx.orgId,
            category: "ASSIGNMENTS",
            title: `Your presentation: ${assignment.title}`,
            body: `${team.name} presents ${where}.`,
            url: `/assignments/${assignment.id}`,
            sourceKey: `slot:${team.id}:${placed.row.id}`,
          },
        );
        return { pending: placed.state === "pending" };
      });
    }),

  /**
   * Takes a team's slot away. The class it was in stays on the timetable,
   * unless it is an extra class asked for the slot and still waiting for
   * approval with nothing else in it.
   */
  clearSlot: protectedProcedure
    .input(z.object({ id, teamId: id }))
    .mutation(async ({ ctx, input }) => {
      const assignment = await assignmentForWrite(ctx, input.id);
      return ctx.db.$transaction(async (tx) => {
        const before = await classesScheduledFor(tx, {
          assignmentId: assignment.id,
          teamId: input.teamId,
        });
        await tx.assignmentSitting.deleteMany({
          where: { assignmentId: assignment.id, teamId: input.teamId },
        });
        await withdrawIdleClasses(tx, before);
        await refreshAssignmentTimes(tx, [assignment.id]);
        return { ok: true as const };
      });
    }),

  /** The order teams present in, within one shared sitting. */
  reorderSlots: protectedProcedure
    .input(
      z.object({
        id,
        exceptionId: id,
        teamIds: z.array(id).min(1).max(60),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const assignment = await assignmentForWrite(ctx, input.id);
      return ctx.db.$transaction(async (tx) => {
        for (const [position, teamId] of input.teamIds.entries()) {
          await tx.assignmentSitting.updateMany({
            where: {
              assignmentId: assignment.id,
              exceptionId: input.exceptionId,
              teamId,
            },
            data: { position },
          });
        }
        return { ok: true as const };
      });
    }),
});
