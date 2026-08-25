import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { DEFAULT_TIMEZONE, endOfLocalDay, startOfLocalDay } from "~/lib/dates";
import { addressSearch, contactAddress, personName } from "~/lib/people";
import {
  detailFor,
  PERSPECTIVES,
  perspectivesFor,
  resolvePerspective,
  type PerspectiveDetail,
} from "~/lib/schedule-views";
import { PermissionFlags } from "~/lib/permissions";
import {
  createTRPCRouter,
  permissionProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { OCCUPYING_STATUSES } from "~/server/services/conflicts";
import type { Db } from "~/server/services/occurrences";

/**
 * Read models for the timetable screens.
 *
 * Every query here is a single indexed range scan over `EventOccurrence` —
 * recurrence was resolved at write time, so nothing expands rules on read.
 */

/**
 * What a cohort is, for the screens that need to say who is in the room.
 *
 * The size is counted rather than stored, which is the same source the room
 * capacity warnings read, so the two can never drift apart.
 */
const selectCohort = {
  id: true,
  name: true,
  label: true,
  kind: true,
  batch: { select: { name: true } },
  programme: { select: { code: true, name: true } },
  _count: { select: { students: true } },
} as const;

/** Shape the grid and list views consume. */
const selectOccurrence = {
  id: true,
  eventId: true,
  start: true,
  end: true,
  roomId: true,
  kind: true,
  status: true,
  event: {
    select: {
      title: true,
      rrule: true,
      notes: true,
      createdById: true,
      // Every group in the room, so a combined lecture says so on the grid.
      groups: { select: { group: { select: { id: true, name: true } } } },
    },
  },
  // What the recurrence rule produced, before any exception moved it — the key
  // an edit to a single occurrence is filed under.
  exception: { select: { originalStart: true } },
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
  event: {
    title: string;
    rrule: string | null;
    notes: string | null;
    createdById: string | null;
    groups: Array<{ group: { id: string; name: string } }>;
  };
  exception: { originalStart: Date } | null;
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
    /** Where the rule put this occurrence; an edit to just this one is keyed on it. */
    originalStart: row.exception?.originalStart ?? row.start,
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
    createdById: row.event.createdById,
    /** Every group attending, primary first. */
    groupNames: [
      ...new Set(
        [row.group?.name, ...row.event.groups.map((g) => g.group.name)].filter(
          (name): name is string => Boolean(name),
        ),
      ),
    ],
    isRecurring: row.event.rrule !== null,
  };
}

export type OccurrenceDto = ReturnType<typeof toDto>;

/** One sitting on the schedule, with the context each perspective may want. */
const selectSchedule = {
  ...selectOccurrence,
  group: { select: selectCohort },
  event: {
    select: {
      ...selectOccurrence.event.select,
      groups: { select: { group: { select: selectCohort } } },
    },
  },
} as const;

/** A cohort as the schedule screens need it: who they are and how many. */
type Cohort = {
  id: string;
  name: string;
  label: string | null;
  kind: string;
  batch: { name: string } | null;
  programme: { code: string; name: string } | null;
  _count: { students: number };
};

type ScheduleRow = Omit<OccurrenceRow, "group" | "event"> & {
  group: Cohort | null;
  event: Omit<OccurrenceRow["event"], "groups"> & {
    groups: Array<{ group: Cohort }>;
  };
};

function cohortDto(group: Cohort) {
  return {
    id: group.id,
    name: group.label ?? group.name,
    kind: group.kind,
    batch: group.batch?.name ?? null,
    programme: group.programme
      ? `${group.programme.code} · ${group.programme.name}`
      : null,
    size: group._count.students,
  };
}

export type CohortDto = ReturnType<typeof cohortDto>;

function toScheduleDto(row: ScheduleRow) {
  // The occurrence carries the primary cohort and the join carries the rest; a
  // combined lecture needs all of them, and each of them once.
  const seen = new Map<string, Cohort>();
  for (const group of [row.group, ...row.event.groups.map((g) => g.group)]) {
    if (group) seen.set(group.id, group);
  }
  const cohorts = [...seen.values()].map(cohortDto);

  return {
    ...toDto(row),
    cohorts,
    /** Everyone expected in the room, across every cohort attending. */
    headcount: cohorts.reduce((total, cohort) => total + cohort.size, 0),
    programme: cohorts.find((c) => c.programme)?.programme ?? null,
  };
}

export type ScheduleDto = ReturnType<typeof toScheduleDto>;

/** What somebody is, for the purposes of having a day: enrolled, teaching, or both. */
async function profilesOf(db: Db, userId: string) {
  const [student, faculty] = await Promise.all([
    db.studentProfile.findUnique({
      where: { userId },
      select: { memberships: { select: { groupId: true } } },
    }),
    db.facultyProfile.findUnique({ where: { userId }, select: { id: true } }),
  ]);
  return { student, faculty };
}

/**
 * Whether a sitting is the viewer's own: a class one of their cohorts attends,
 * or one they teach.
 *
 * Deliberately the same rule the schedule screen and the calendar sync apply —
 * the occurrence's own `groupId`, which for a combined lecture is the primary
 * section only — so the timetable, `/schedule` and somebody's Google Calendar
 * can never disagree about what "my classes" means. If that rule is ever
 * widened to the `EventGroup` join, widening it here in step is what keeps the
 * three honest.
 *
 * Both halves are tested rather than one taking precedence, because being
 * enrolled and teaching are not exclusive: a research assistant who takes a lab
 * and sits in on a lecture owns both of those blocks.
 */
function ownershipTest(profiles: Awaited<ReturnType<typeof profilesOf>>) {
  const groupIds = new Set(
    profiles.student?.memberships.map((m) => m.groupId) ?? [],
  );
  const facultyId = profiles.faculty?.id ?? null;
  return (occurrence: { groupId: string | null; facultyId: string | null }) =>
    (occurrence.groupId !== null && groupIds.has(occurrence.groupId)) ||
    (facultyId !== null && occurrence.facultyId === facultyId);
}

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

      const [rooms, occurrences, settings, buildings, profiles] =
        await Promise.all([
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
          // Every building with a room in it, whatever is being filtered to.
          // The filter's own choices cannot come out of the filtered result, or
          // choosing one building is the last choice anybody gets to make.
          ctx.db.building.findMany({
            where: { orgId: ctx.orgId, rooms: { some: { isActive: true } } },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          // Who the viewer is on this grid, so their own classes can be picked
          // out of the whole campus's day. In with the rest rather than awaited
          // first: it depends on nothing here, and the screen is a single round
          // of queries.
          profilesOf(ctx.db, ctx.actor.id),
        ]);

      const isMine = ownershipTest(profiles);

      return {
        timeZone,
        from,
        to,
        rooms,
        buildings,
        occurrences: (occurrences as OccurrenceRow[]).map((row) => {
          const dto = toDto(row);
          /** Drawn in gold on the grid — see `ownershipTest`. */
          return { ...dto, isMine: isMine(dto) };
        }),
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

  /**
   * Everyone whose schedule can be looked at: anyone who attends or teaches.
   *
   * Coordinating the timetable means answering questions about other people's
   * days — where a lecturer is at two o'clock, whether a student can be pulled
   * out of a class — so the people list is filtered to those who actually have
   * a day of their own. Being able to see all events is not enough on its own:
   * browsing named individuals needs the people permission as well, which a
   * lecturer does not hold.
   */
  /**
   * The people the "view as" picker offers.
   *
   * Open to anybody with a session, unlike `peopleWithSchedules` below it.
   * Choosing whose day to look at belongs to the schedule screen, which every
   * signed-in person can reach, so gating the *names* behind ViewUsers would
   * put a control on screen that most people could never fill in.
   *
   * It answers with the four fields the picker draws and nothing else — no
   * address, no roles, no permission bits, no account state. Matching is on
   * name and PRN only; an address is neither returned nor searchable here, so
   * this cannot be used to test whether a given address has an account.
   *
   * Being allowed to *name* somebody is not being allowed to see their day:
   * `mySchedule` decides that separately and still refuses another person's
   * schedule without ViewAllEvents and ViewUsers.
   */
  searchPeople: protectedProcedure
    .input(
      z.object({ query: z.string().trim().max(120).optional() }).default({}),
    )
    .query(async ({ ctx, input }) => {
      const people = await ctx.db.user.findMany({
        where: {
          orgId: ctx.orgId,
          AND: [
            {
              OR: [
                { studentProfile: { isNot: null } },
                { facultyProfile: { isNot: null } },
              ],
            },
            ...(input.query
              ? [
                  {
                    OR: [
                      {
                        name: {
                          contains: input.query,
                          mode: "insensitive" as const,
                        },
                      },
                      { studentProfile: { prn: { contains: input.query } } },
                    ],
                  },
                ]
              : []),
          ],
        },
        // `email` is read so `personName` has its fallback for somebody who
        // never set a name. It is not returned.
        select: {
          id: true,
          name: true,
          email: true,
          studentProfile: { select: { prn: true } },
          facultyProfile: { select: { department: true } },
        },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        take: 30,
      });

      return people.map((person) => ({
        id: person.id,
        name: personName(person),
        kind: person.facultyProfile
          ? ("faculty" as const)
          : ("student" as const),
        detail:
          person.facultyProfile?.department ??
          person.studentProfile?.prn ??
          null,
      }));
    }),

  peopleWithSchedules: permissionProcedure(
    PermissionFlags.ViewAllEvents,
    PermissionFlags.ViewUsers,
  )
    .input(
      z.object({ query: z.string().trim().max(120).optional() }).default({}),
    )
    .query(async ({ ctx, input }) => {
      const search = input.query
        ? {
            OR: [
              { name: { contains: input.query, mode: "insensitive" as const } },
              addressSearch(input.query),
              { studentProfile: { prn: { contains: input.query } } },
            ],
          }
        : {};

      const people = await ctx.db.user.findMany({
        where: {
          orgId: ctx.orgId,
          // Two separate conditions, both required: it must be somebody with a
          // day of their own, and it must match what was typed.
          AND: [
            {
              OR: [
                { studentProfile: { isNot: null } },
                { facultyProfile: { isNot: null } },
              ],
            },
            ...(search.OR ? [search] : []),
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          studentProfile: { select: { prn: true } },
          facultyProfile: { select: { department: true } },
        },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        take: 30,
      });

      return people.map((person) => ({
        id: person.id,
        name: personName(person),
        email: contactAddress(person.email),
        kind: person.facultyProfile
          ? ("faculty" as const)
          : ("student" as const),
        detail:
          person.facultyProfile?.department ??
          person.studentProfile?.prn ??
          null,
      }));
    }),

  /**
   * One day of somebody's schedule, seen from a chosen perspective.
   *
   * The perspective decides two things at once: which classes are yours — the
   * ones you attend, the ones you take, or both — and how much is said about
   * each. Whichever is asked for, only the perspectives this person is entitled
   * to are honoured, so the dropdown cannot be used to see somebody else's day.
   */
  mySchedule: protectedProcedure
    .input(
      z.object({
        /**
         * The day to show. Left out, the server answers with the day the next
         * class falls on, which is what the screen opens on — the question
         * somebody arriving at their schedule is actually asking is "where do I
         * have to be next", and on a Friday evening the answer is not Friday.
         *
         * A class you are in the middle of, or one that ended less than
         * `GRACE_AFTER_CLASS_MS` ago, is the next class for this purpose; see
         * `nextClassMoment`.
         *
         * Deciding it here rather than in the browser is what keeps it to one
         * round trip: the page is rendered on the server, and a client that had
         * to ask for the day first would render today, then jump.
         */
        date: z.date().optional(),
        viewAs: z.enum(PERSPECTIVES).optional(),
        /** Somebody else's day, for whoever is entitled to look at it. */
        asUserId: z.string().cuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const timeZone = await orgTimezone(ctx.db, ctx.orgId);

      // Anybody who can open the schedule may look at anybody else's day. A
      // timetable says where a class is and who teaches it — the same thing the
      // college posts on a noticeboard — so gating it behind ViewUsers only
      // stopped students answering "where is my lecturer right now?".
      //
      // It opens whose day may be *read*, and nothing else: `perspectives`
      // below still decides how much is said about each class, and every
      // screen that edits or marks attendance keeps its own permission.
      const other =
        input.asUserId && input.asUserId !== ctx.actor.id
          ? input.asUserId
          : null;

      const mine = await profilesOf(ctx.db, ctx.actor.id);
      // The chooser always offers the viewer their own angles, whoever's day is
      // on screen — otherwise there would be no way back to it.
      const views = perspectivesFor({
        hasStudentProfile: mine.student !== null,
        hasFacultyProfile: mine.faculty !== null,
        permissions: ctx.actor.permissions,
      });

      const subject = other
        ? await ctx.db.user.findFirst({
            where: { id: other, orgId: ctx.orgId },
            select: { id: true, name: true, email: true },
          })
        : null;
      if (other && !subject) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No such person." });
      }

      const profiles = other ? await profilesOf(ctx.db, other) : mine;
      const viewAs = other ? null : resolvePerspective(views, input.viewAs);

      // Somebody else's day is described by what they are, not by what the
      // person looking at it happens to be; the powers over what is found stay
      // with the viewer.
      const detail: PerspectiveDetail | null = other
        ? {
            cohort: profiles.faculty !== null,
            teaching: profiles.student !== null,
            scope:
              profiles.student && profiles.faculty
                ? "both"
                : profiles.faculty
                  ? "teaching"
                  : "attending",
            modify: ctx.bits.has(PermissionFlags.ManageAllEvents),
          }
        : viewAs
          ? detailFor(viewAs)
          : null;

      const viewingAs = subject
        ? {
            id: subject.id,
            name: personName(subject),
            isStudent: profiles.student !== null,
            isFaculty: profiles.faculty !== null,
          }
        : null;

      // Which occurrences count as this person's, whichever day is shown. Built
      // before the day is settled, because with no date asked for the day is
      // worked out *from* these — there is no "my next class" without knowing
      // first which classes are mine.
      const belongs: object[] = [];
      if (detail) {
        const groupIds =
          profiles.student?.memberships.map((m) => m.groupId) ?? [];
        if (detail.scope !== "teaching" && groupIds.length > 0) {
          belongs.push({ groupId: { in: groupIds } });
        }
        if (detail.scope !== "attending" && profiles.faculty) {
          belongs.push({ facultyId: profiles.faculty.id });
        }
      }

      const anchor =
        input.date ?? (await nextClassMoment(ctx.db, ctx.orgId, belongs));
      const from = startOfLocalDay(anchor, timeZone);
      const to = endOfLocalDay(anchor, timeZone);

      const base = { timeZone, from, to, views, viewAs, viewingAs, detail };
      // No detail means no perspective, which means nothing is theirs to see.
      if (belongs.length === 0)
        return { ...base, occurrences: [] as ScheduleDto[] };

      const occurrences = await ctx.db.eventOccurrence.findMany({
        where: {
          orgId: ctx.orgId,
          status: { in: [...OCCUPYING_STATUSES] },
          start: { lt: to },
          end: { gt: from },
          OR: belongs,
        },
        select: selectSchedule,
        orderBy: { start: "asc" },
      });

      return {
        ...base,
        occurrences: (occurrences as ScheduleRow[]).map(toScheduleDto),
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

/**
 * How long a class goes on counting as the class you are at after it has ended.
 *
 * Walking out of a room is not the moment a lecture stops being the thing you
 * are dealing with: attendance is taken on the way out, and "what was that,
 * and where is the next one" is asked in the corridor afterwards. Moving the
 * screen to Monday the second a Friday afternoon class finishes would take the
 * day away mid-sentence, so the last sitting holds the day for half an hour
 * before the next one claims it.
 *
 * Half an hour is the length of the gap between two back-to-back classes plus
 * room to walk: long enough to cover the moment you would still ask about the
 * one that just ended, short enough that an evening is never spent looking at
 * a day that is over.
 */
const GRACE_AFTER_CLASS_MS = 30 * 60_000;

/**
 * When the next class this person is involved in happens, or now if there is none.
 *
 * "Next" is measured by the end rather than the start, so a lecture already
 * running still counts as the one you are going to. Anchoring on the start
 * would send somebody sitting in a Tuesday afternoon lecture to Wednesday.
 *
 * The end is then given `GRACE_AFTER_CLASS_MS` of slack, so a sitting that has
 * just finished still answers the question — which is what keeps the screen on
 * today for the half hour after the last class of the day instead of jumping
 * to tomorrow the instant it ends.
 *
 * Ordered by start, though: among everything not yet finished, the next one is
 * the one that begins soonest, which is not the same as the one that ends
 * soonest once a long sitting overlaps a short one.
 *
 * Returns a moment rather than a day because the caller knows the timezone the
 * day should be cut on, and doing that arithmetic twice is how the two disagree.
 * One consequence of that division is worth naming: the grace is measured in
 * elapsed time, not in days, so a class ending at 23:50 holds *its* day until
 * 00:20 — the screen opens on yesterday for those twenty minutes, which is the
 * day of the class the reader was actually at.
 */
async function nextClassMoment(
  db: Db,
  orgId: string,
  belongs: object[],
): Promise<Date> {
  const now = new Date();
  if (belongs.length === 0) return now;

  const next = await db.eventOccurrence.findFirst({
    where: {
      orgId,
      status: { in: [...OCCUPYING_STATUSES] },
      end: { gt: new Date(now.getTime() - GRACE_AFTER_CLASS_MS) },
      OR: belongs,
    },
    select: { start: true },
    orderBy: { start: "asc" },
  });
  return next?.start ?? now;
}

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
