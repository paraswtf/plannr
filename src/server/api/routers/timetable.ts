import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { AssignmentType } from "~/lib/assignments";
import { DEFAULT_TIMEZONE, endOfLocalDay, startOfLocalDay } from "~/lib/dates";
import { addressSearch, contactAddress, personName } from "~/lib/people";
import { spanWindow, SPANS } from "~/lib/schedule-spans";
import {
  detailFor,
  PERSPECTIVE_LABELS,
  PERSPECTIVES,
  perspectivesFor,
  resolvePerspective,
  type Perspective,
  type PerspectiveDetail,
} from "~/lib/schedule-views";
import { PermissionFlags } from "~/lib/permissions";
import { pageArgs, pageInput, toPage } from "~/server/api/pagination";
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
      // The subject being taught, which the screens colour by. Nullable in the
      // schema and null in practice for anything the sync added, so every
      // reader has to have an answer for a class with no course.
      course: { select: { title: true } },
      // Every group in the room, so a combined lecture says so on the grid.
      groups: { select: { group: { select: { id: true, name: true } } } },
    },
  },
  // What the recurrence rule produced, before any exception moved it — the key
  // an edit to a single occurrence is filed under.
  exception: { select: { originalStart: true } },
  // What a test or presentation slot is pinned to; see `heldIn`.
  exceptionId: true,
  room: { select: { code: true, buildingId: true } },
  group: { select: { id: true, name: true, label: true } },
  faculty: {
    select: {
      id: true,
      shortName: true,
      user: { select: { name: true } },
    },
  },
  // Whether a register has been taken, as a count rather than the rows: the
  // detail panel only ever asks the yes/no question, and one correlated count
  // on a query that already runs is cheaper than the panel fetching for itself
  // every time somebody opens a block. A combined lecture has one session per
  // cohort — `AttendanceSession` is unique on `[occurrenceId, groupId]` — so
  // "more than none" is "at least one cohort's register is in", which is what
  // the sentence in the panel claims.
  _count: { select: { attendance: true } },
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
    course: { title: string } | null;
    groups: Array<{ group: { id: string; name: string } }>;
  };
  exception: { originalStart: Date } | null;
  exceptionId: string | null;
  room: { code: string; buildingId: string };
  group: { id: string; name: string; label: string | null } | null;
  faculty: {
    id: string;
    shortName: string | null;
    user: { name: string | null };
  } | null;
  _count: { attendance: number };
};

/**
 * @param readsAttendance Whether this viewer may be told that a register has
 *   been taken. Withheld as `null` rather than `false` from everybody else,
 *   because "no" and "you may not ask" are different answers and a screen that
 *   confused them would draw "not yet taken" over a lecture that was.
 */
/** Tests and presentations held in a sitting, as a block shows them. */
export interface HeldAssignment {
  id: string;
  type: AssignmentType;
  title: string;
  /** Presentations: the teams presenting in this sitting, in order. */
  teams: string[];
  /**
   * Whether the viewer can open it: they manage it or are in its group. The
   * teacher of the class it is held in is told it is there without being
   * able to open somebody else's test.
   */
  canOpen: boolean;
}

type Held = Map<string, HeldAssignment[]>;

/**
 * Who is looking, for deciding which tests and presentations a block may name.
 * Always the person signed in, never the person whose day is on screen: being
 * allowed to read somebody's timetable is not being allowed to read the tests
 * set for their groups.
 */
interface Viewer {
  userId: string;
  /** Holds ManageAllAssignments: sees every test. */
  managesAll: boolean;
  /** Holds ManageOwnAssignments: sees the tests they set. */
  setsOwn: boolean;
  /** The groups they study in: they see their groups' tests. */
  groupIds: Set<string>;
  /** Their faculty profile: they see what is held in the classes they teach. */
  facultyId: string | null;
}

function viewerOf(
  ctx: { actor: { id: string }; bits: { has: (flag: bigint) => boolean } },
  own: Awaited<ReturnType<typeof profilesOf>>,
): Viewer {
  return {
    userId: ctx.actor.id,
    managesAll: ctx.bits.has(PermissionFlags.ManageAllAssignments),
    setsOwn: ctx.bits.has(PermissionFlags.ManageOwnAssignments),
    groupIds: new Set(own.student?.memberships.map((m) => m.groupId) ?? []),
    facultyId: own.faculty?.id ?? null,
  };
}

/**
 * The tests and presentation slots pinned to these sittings, in one query for
 * the whole page of rows. A slot is pinned through its sitting's exception, so
 * rows with none hold nothing and are not asked about.
 *
 * Only what this viewer may know of is kept. A test is pinned to one sitting,
 * but a combined lecture is attended by several groups and the campus grid is
 * open to everybody; naming the test there would tell every other group, and
 * anybody browsing, the titles and teams of tests they cannot open. So an
 * entry stays for whoever could open it (`assignmentForRead`: its manager, or
 * a student of its group) and for the teacher taking the class it is held in,
 * and is left out for everybody else.
 */
async function heldIn(
  db: Db,
  rows: Array<{ exceptionId: string | null; faculty: { id: string } | null }>,
  viewer: Viewer,
): Promise<Held> {
  const teacherOf = new Map(
    rows.flatMap((r) =>
      r.exceptionId ? [[r.exceptionId, r.faculty?.id]] : [],
    ),
  );
  const ids = [...teacherOf.keys()];
  const held: Held = new Map();
  if (ids.length === 0) return held;
  const sittings = await db.assignmentSitting.findMany({
    where: { exceptionId: { in: ids } },
    select: {
      exceptionId: true,
      assignment: {
        select: {
          id: true,
          type: true,
          title: true,
          groupId: true,
          createdById: true,
        },
      },
      team: { select: { name: true } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  for (const sitting of sittings) {
    const { groupId, createdById, ...assignment } = sitting.assignment;
    const canOpen =
      viewer.managesAll ||
      (viewer.setsOwn && createdById === viewer.userId) ||
      viewer.groupIds.has(groupId);
    const teaches =
      viewer.facultyId !== null &&
      teacherOf.get(sitting.exceptionId!) === viewer.facultyId;
    if (!canOpen && !teaches) continue;

    const list = held.get(sitting.exceptionId!) ?? [];
    let entry = list.find((a) => a.id === assignment.id);
    if (!entry) {
      entry = { ...assignment, teams: [], canOpen };
      list.push(entry);
    }
    if (sitting.team) entry.teams.push(sitting.team.name);
    held.set(sitting.exceptionId!, list);
  }
  return held;
}

function toDto(row: OccurrenceRow, readsAttendance: boolean, held: Held) {
  return {
    /** Tests and presentations held in this sitting. */
    assignments: row.exceptionId ? (held.get(row.exceptionId) ?? []) : [],
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
    /*
     * The subject, for the colour every screen draws this in.
     *
     * Deliberately not called `course`: `describeClass` already reads
     * `event.course` and pushes it as a line under every block on the schedule,
     * and the schedule DTO supplies `programme` instead — so that branch has
     * never fired. Naming this `course` would switch on a line nobody asked
     * for, under every block, changing the height of all three calendars as a
     * side effect of adding a colour.
     *
     * Null for a room booking, a block, or — on this deployment — any class the
     * sync added, which is most of them. `course-colour.ts` owns what that
     * looks like.
     */
    courseTitle: row.event.course?.title ?? null,
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
    /**
     * Whether anybody's register has been taken for this sitting, or null for a
     * viewer who is not entitled to know.
     *
     * The timetable is open to every signed-in member now, and this is the one
     * field on it that is not noticeboard information: everywhere else the app
     * puts reading a register behind ViewAttendance, and a whole term of "was
     * this class registered" over the campus grid is a different thing from a
     * student reading where their own lecture is. So it costs the permission it
     * costs elsewhere — which MarkAttendance implies, so the lecturer who is
     * about to take the register still sees it.
     */
    attendanceMarked: readsAttendance ? row._count.attendance > 0 : null,
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

function toScheduleDto(row: ScheduleRow, readsAttendance: boolean, held: Held) {
  // The occurrence carries the primary cohort and the join carries the rest; a
  // combined lecture needs all of them, and each of them once.
  const seen = new Map<string, Cohort>();
  for (const group of [row.group, ...row.event.groups.map((g) => g.group)]) {
    if (group) seen.set(group.id, group);
  }
  const cohorts = [...seen.values()].map(cohortDto);

  return {
    ...toDto(row, readsAttendance, held),
    cohorts,
    /** Everyone expected in the room, across every cohort attending. */
    headcount: cohorts.reduce((total, cohort) => total + cohort.size, 0),
    programme: cohorts.find((c) => c.programme)?.programme ?? null,
  };
}

export type ScheduleDto = ReturnType<typeof toScheduleDto>;

/**
 * The most sittings one schedule answer will carry.
 *
 * The window is the real bound — a month grid is at most 42 days — and this is
 * the backstop under it, for the cohort whose month is genuinely enormous.
 * Deliberately not the `pageInput`/`toPage` envelope the list endpoints use:
 * paging a calendar by row count cuts a Wednesday in half, and there is no page
 * two a month grid could draw. When it bites, the screen says so.
 */
const MAX_SCHEDULE_OCCURRENCES = 500;

/** What somebody is, for the purposes of having a day: enrolled, teaching, or both. */
export async function profilesOf(db: Db, userId: string) {
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
 * A class still waiting for approval: a teacher's extra class for a test. It
 * is on its teacher's day, marked as waiting, but not yet on the students':
 * until somebody approves it nobody is to plan around it, and when it is
 * approved the students are told it is new.
 */
const AWAITING_APPROVAL = { kind: "CLASS", status: "PENDING" } as const;

/**
 * The `OR` clauses that select somebody's own sittings, for a Prisma `where`.
 *
 * Empty when there is nothing of theirs to find — a coordinator who neither
 * attends nor teaches — and callers are expected to treat that as "no
 * timetable" rather than running the query and getting the whole college.
 *
 * Shared rather than rewritten because it is the same definition of "mine"
 * that `ownershipTest` below insists must not drift: the occurrence's own
 * `groupId`, which for a combined lecture is the primary section only, or the
 * faculty who takes it. The schedule screen, the timetable's gold blocks, the
 * calendar sync and the spoken answers all have to mean one thing by it.
 */
export function ownedOccurrenceClauses(
  profiles: Awaited<ReturnType<typeof profilesOf>>,
  scope: "attending" | "teaching" | "both" = "both",
): object[] {
  const clauses: object[] = [];
  const groupIds = profiles.student?.memberships.map((m) => m.groupId) ?? [];
  if (scope !== "teaching" && groupIds.length > 0) {
    clauses.push({ groupId: { in: groupIds }, NOT: AWAITING_APPROVAL });
  }
  if (scope !== "attending" && profiles.faculty) {
    clauses.push({ facultyId: profiles.faculty.id });
  }
  return clauses;
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
  return (occurrence: {
    groupId: string | null;
    facultyId: string | null;
    kind: string;
    status: string;
  }) =>
    (occurrence.groupId !== null &&
      groupIds.has(occurrence.groupId) &&
      !(
        occurrence.kind === AWAITING_APPROVAL.kind &&
        occurrence.status === AWAITING_APPROVAL.status
      )) ||
    (facultyId !== null && occurrence.facultyId === facultyId);
}

/**
 * Whether this caller may be told that a register has been taken.
 *
 * `MarkAttendance` implies `ViewAttendance` (see PERMISSION_IMPLIES), so the
 * lecturer about to take one is covered by the same test as the coordinator
 * reading it back.
 */
function readsAttendance(bits: { has: (flag: bigint) => boolean }): boolean {
  return bits.has(PermissionFlags.ViewAttendance);
}

export async function orgTimezone(db: Db, orgId: string): Promise<string> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true },
  });
  return org?.timezone ?? DEFAULT_TIMEZONE;
}

/**
 * One entry in the "view as" favourites strip.
 *
 * `subject` is what to switch to: a perspective name for one of the viewer's
 * own angles, or a user id for somebody else. The screen does not need to know
 * which beyond choosing an icon, which is why they share a shape.
 */
export interface FavouriteDto {
  kind: "perspective" | "person";
  subject: string;
  name: string;
  /**
   * What this is, in a few words — the same line the picker writes under a name
   * in its search results.
   *
   * Added for the details a favourite can be held down to read. A strip of
   * initials is deliberately terse, and terse is right for something aimed at
   * with a thumb; but "AS" is two letters that several people in a college of
   * this size will share, and the one place that has to be resolvable is the
   * one where you decide whether to unstar them.
   */
  hint: string | null;
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
              // The same rooms the grid draws, so a sitting in an archived room
              // is neither counted nor sent without a column to sit in.
              room: {
                isActive: true,
                ...(input.buildingId ? { buildingId: input.buildingId } : {}),
              },
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
      // Asked once for the whole grid rather than per row: it is a BigInt test
      // with an implication closure behind it, and a campus day is hundreds of
      // sittings.
      const marks = readsAttendance(ctx.bits);
      const held = await heldIn(ctx.db, occurrences, viewerOf(ctx, profiles));

      return {
        timeZone,
        from,
        to,
        rooms,
        buildings,
        occurrences: (occurrences as OccurrenceRow[]).map((row) => {
          const dto = toDto(row, marks, held);
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
      const marks = readsAttendance(ctx.bits);
      const held = await heldIn(
        ctx.db,
        occurrences,
        viewerOf(ctx, await profilesOf(ctx.db, ctx.actor.id)),
      );
      return (occurrences as OccurrenceRow[]).map((row) =>
        toDto(row, marks, held),
      );
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
            ? { groupId: { in: scope.groupIds }, NOT: AWAITING_APPROVAL }
            : { facultyId: scope.facultyId }),
        },
        select: selectOccurrence,
        orderBy: { start: "asc" },
      });

      const held = await heldIn(
        ctx.db,
        occurrences,
        viewerOf(ctx, await profilesOf(ctx.db, ctx.actor.id)),
      );
      return {
        timeZone,
        from,
        to,
        scope,
        occurrences: (occurrences as OccurrenceRow[]).map((row) =>
          toDto(row, readsAttendance(ctx.bits), held),
        ),
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
      z
        .object({
          query: z.string().trim().max(120).optional(),
          /**
           * Thirty, which is what this answered before the envelope existed
           * and is the right number for what it is. A typeahead is not a list
           * anybody reads to the end — it is narrowed by typing, and a picker
           * that offered every one of two thousand names would be no easier to
           * find a colleague in than a picker offering thirty. Nothing renders
           * this whole, so nothing is truncated by starting here, and `total`
           * now says out loud how many matched, which is a thing the picker
           * could not find out at all before.
           *
           * Two hundred for anyone who genuinely wants to walk the list; the
           * directory below is the endpoint built for that.
           */
          ...pageInput({ defaultSize: 30, maxSize: 200 }),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        orgId: ctx.orgId,
        // An API key's machine identity is a `User` row and has no business
        // in a picker of colleagues. Belt and braces: it also holds neither
        // profile, so the clause below would exclude it anyway — but this one
        // says why, and survives somebody relaxing that clause.
        isServiceAccount: false,
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
                    {
                      studentProfile: {
                        prn: {
                          contains: input.query,
                          mode: "insensitive" as const,
                        },
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      };

      const [people, total] = await Promise.all([
        ctx.db.user.findMany({
          where,
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
          ...pageArgs(input),
        }),
        ctx.db.user.count({ where }),
      ]);

      return toPage(
        people.map((person) => ({
          id: person.id,
          name: personName(person),
          kind: person.facultyProfile
            ? ("faculty" as const)
            : ("student" as const),
          detail:
            person.facultyProfile?.department ??
            person.studentProfile?.prn ??
            null,
        })),
        total,
        input,
      );
    }),

  peopleWithSchedules: permissionProcedure(
    PermissionFlags.ViewAllEvents,
    PermissionFlags.ViewUsers,
  )
    .input(
      z
        .object({
          query: z.string().trim().max(120).optional(),
          /**
           * Far larger than the typeahead's thirty, because this is not a
           * typeahead. It is the coordinator's directory of everybody with a
           * day of their own, and with no `query` it is meant to be read: a
           * whole department at once, or a whole cohort. Five hundred holds
           * either with room to spare.
           *
           * The full population of a college runs to thousands and does not
           * fit in one answer at any sensible size, which is what `total` and
           * `pageCount` are now for — and it is a caller who asked for the
           * whole institution who finds out, rather than one who asked for a
           * department and quietly got most of it.
           */
          ...pageInput({ defaultSize: 500, maxSize: 2000 }),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const search = input.query
        ? {
            OR: [
              { name: { contains: input.query, mode: "insensitive" as const } },
              addressSearch(input.query),
              {
                studentProfile: {
                  prn: { contains: input.query, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {};

      const where = {
        orgId: ctx.orgId,
        // A machine has no day. See `searchPeople` above.
        isServiceAccount: false,
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
      };

      const [people, total] = await Promise.all([
        ctx.db.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            email: true,
            studentProfile: { select: { prn: true } },
            facultyProfile: { select: { department: true } },
          },
          orderBy: [{ name: "asc" }, { email: "asc" }],
          ...pageArgs(input),
        }),
        ctx.db.user.count({ where }),
      ]);

      return toPage(
        people.map((person) => ({
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
        })),
        total,
        input,
      );
    }),

  /**
   * One day of somebody's schedule, seen from a chosen perspective.
   *
   * The perspective decides two things at once: which classes are yours — the
   * ones you attend, the ones you take, or both — and how much is said about
   * each. Whichever is asked for, only the perspectives this person is entitled
   * to are honoured, so the dropdown cannot be used to see somebody else's day.
   */
  /**
   * The schedules this person keeps one tap away, resolved for drawing.
   *
   * Perspectives and people in one list, in the order they were starred,
   * because to whoever made it they are one kind of thing: a way of getting to
   * a schedule that is not the one on screen.
   *
   * A favourite naming somebody who has since left, or a perspective this
   * person is no longer entitled to take, is dropped here rather than returned
   * for the screen to filter. Two reasons: a stale avatar that logs somebody
   * out of their own view when tapped is worse than one that quietly went
   * away, and the entitlement is the same `perspectivesFor` the chooser itself
   * runs, so there is one answer to "may I look through those eyes" rather
   * than two that can disagree.
   */
  favourites: protectedProcedure.query(async ({ ctx }) => {
    const [rows, mine] = await Promise.all([
      ctx.db.scheduleFavourite.findMany({
        where: { userId: ctx.actor.id, orgId: ctx.orgId },
        orderBy: { createdAt: "asc" },
        select: {
          kind: true,
          subject: true,
          person: {
            select: {
              id: true,
              name: true,
              email: true,
              isServiceAccount: true,
              // Whether they have a timetable at all, which is the same half of
              // the test `searchPeople` applies. Selected rather than filtered
              // in the query, because a `where` on this relation would throw
              // away the perspective rows too — they have no person.
              //
              // The second field on each is what the hint is written from, and
              // is exactly what `searchPeople` selects for the same purpose.
              studentProfile: { select: { userId: true, prn: true } },
              facultyProfile: { select: { userId: true, department: true } },
            },
          },
        },
      }),
      profilesOf(ctx.db, ctx.actor.id),
    ]);

    const allowed = new Set(
      perspectivesFor({
        hasStudentProfile: mine.student !== null,
        hasFacultyProfile: mine.faculty !== null,
        permissions: ctx.actor.permissions,
      }),
    );

    // Annotated, because the two branches below return arrays of different
    // literal types and the inference would otherwise settle on a union of
    // arrays rather than an array of the union.
    return rows.flatMap<FavouriteDto>((row) => {
      if (row.kind === "PERSPECTIVE") {
        return allowed.has(row.subject as Perspective)
          ? [
              {
                kind: "perspective" as const,
                subject: row.subject,
                name: PERSPECTIVE_LABELS[row.subject as Perspective],
                // Nothing, deliberately. The picker already writes "you" under
                // every perspective, and a second wording supplied from here
                // would reword the identical row as a side effect of starring
                // it. Presentation copy is the screen's to choose.
                hint: null,
              },
            ]
          : [];
      }
      const person = row.person;
      /*
       * Exactly the population `searchPeople` offers: not a machine, and
       * somebody with a timetable of their own.
       *
       * Deliberately *not* `isActive`, which was the first guess and was wrong
       * about what the flag means. It is false on every imported record —
       * `import-sicsr.ts` says so where it sets it: nobody signs in as one
       * until they first arrive through Google and are linked to it. Two thirds
       * of the college is active and a third is not, so filtering on it here
       * meant the picker cheerfully offered somebody, the star wrote a row, and
       * the read silently threw it away. The write already used this rule; the
       * two have to agree or starring appears to do nothing at all.
       */
      const hasTimetable =
        person !== null &&
        (person.studentProfile !== null || person.facultyProfile !== null);
      if (!person || !hasTimetable || person.isServiceAccount) return [];
      return [
        {
          kind: "person" as const,
          subject: person.id,
          name: personName(person),
          hint:
            [
              person.facultyProfile ? "Faculty" : "Student",
              person.facultyProfile?.department ?? person.studentProfile?.prn,
            ]
              .filter(Boolean)
              .join(" · ") || null,
        },
      ];
    });
  }),

  /**
   * Stars a schedule, or unstars it. Idempotent in both directions.
   *
   * A person is checked before being stored, against the same population
   * `searchPeople` offers — somebody who attends or teaches and is not a
   * machine — so a favourite can never be a handle on a row the picker would
   * not have shown in the first place. A perspective is checked against the
   * ones this person may actually take.
   */
  toggleFavourite: protectedProcedure
    .input(
      z.object({
        kind: z.enum(["perspective", "person"]),
        subject: z.string().min(1).max(64),
        /** True to star, false to unstar. */
        on: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const kind = input.kind === "person" ? "PERSON" : "PERSPECTIVE";

      if (!input.on) {
        await ctx.db.scheduleFavourite.deleteMany({
          where: {
            userId: ctx.actor.id,
            orgId: ctx.orgId,
            kind,
            subject: input.subject,
          },
        });
        return { on: false as const };
      }

      if (input.kind === "perspective") {
        const mine = await profilesOf(ctx.db, ctx.actor.id);
        const allowed = perspectivesFor({
          hasStudentProfile: mine.student !== null,
          hasFacultyProfile: mine.faculty !== null,
          permissions: ctx.actor.permissions,
        });
        if (!allowed.includes(input.subject as Perspective)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "That is not one of your own perspectives.",
          });
        }
      } else {
        const person = await ctx.db.user.findFirst({
          where: {
            id: input.subject,
            orgId: ctx.orgId,
            isServiceAccount: false,
            OR: [
              { studentProfile: { isNot: null } },
              { facultyProfile: { isNot: null } },
            ],
          },
          select: { id: true },
        });
        if (!person) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No such person.",
          });
        }
      }

      // Upsert rather than create, so a double tap on a slow connection is the
      // same as a single one.
      await ctx.db.scheduleFavourite.upsert({
        where: {
          userId_kind_subject: {
            userId: ctx.actor.id,
            kind,
            subject: input.subject,
          },
        },
        update: {},
        create: {
          orgId: ctx.orgId,
          userId: ctx.actor.id,
          kind,
          subject: input.subject,
          personId: input.kind === "person" ? input.subject : null,
        },
      });
      return { on: true as const };
    }),

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
        /**
         * How much of the calendar to answer with.
         *
         * The caller states a span and an anchor day, never a window of its
         * own, so the widest thing this procedure can be asked for is one
         * month grid — 42 days. There is no input that reaches a term. It
         * defaults to a day, so every existing caller keeps working untouched.
         */
        span: z.enum(SPANS).default("day"),
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
            // Naming somebody puts their name on screen as "viewing X's day".
            // A principal is not a somebody, so an id pointing at one answers
            // "No such person." rather than rendering a bot's empty week.
            where: { id: other, orgId: ctx.orgId, isServiceAccount: false },
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
      const belongs = detail
        ? ownedOccurrenceClauses(profiles, detail.scope)
        : [];

      /**
       * The moment the window is cut around, and the day the client selects.
       *
       * `nextClassMoment` is asked the same question whatever the span, and the
       * span decides how much of the calendar around its answer to return — so
       * on a Friday evening the day opens on Monday, the week opens on next
       * week, and the month opens on the month that Monday falls in. One
       * pleasant consequence of `belongs` being the *subject's*: "view as Dr
       * Rao" plus Week opens on the week of Dr Rao's next class, not yours.
       */
      const moment =
        input.date ?? (await nextClassMoment(ctx.db, ctx.orgId, belongs));
      const anchor = startOfLocalDay(moment, timeZone);
      const { from, to } = spanWindow(moment, input.span, timeZone);

      const base = {
        timeZone,
        span: input.span,
        /** The day on screen. For a week or a month, the one inside the window. */
        anchor,
        from,
        to,
        views,
        viewAs,
        viewingAs,
        detail,
      };
      // No detail means no perspective, which means nothing is theirs to see.
      if (belongs.length === 0) {
        return { ...base, truncated: false, occurrences: [] as ScheduleDto[] };
      }

      const rows = await ctx.db.eventOccurrence.findMany({
        where: {
          orgId: ctx.orgId,
          status: { in: [...OCCUPYING_STATUSES] },
          start: { lt: to },
          end: { gt: from },
          OR: belongs,
        },
        select: selectSchedule,
        // A total order, not tidiness: without the tie-break, *which* rows a
        // truncation drops is undetermined and the same month would draw
        // differently on two loads.
        orderBy: [{ start: "asc" }, { id: "asc" }],
        take: MAX_SCHEDULE_OCCURRENCES + 1,
      });

      const truncated = rows.length > MAX_SCHEDULE_OCCURRENCES;
      const marks = readsAttendance(ctx.bits);
      const shown = (rows as ScheduleRow[]).slice(0, MAX_SCHEDULE_OCCURRENCES);
      const held = await heldIn(ctx.db, shown, viewerOf(ctx, mine));

      return {
        ...base,
        truncated,
        occurrences: shown.map((row) => toScheduleDto(row, marks, held)),
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
            ? { groupId: { in: scope.groupIds }, NOT: AWAITING_APPROVAL }
            : { facultyId: scope.facultyId }),
        },
        select: selectOccurrence,
        orderBy: { start: "asc" },
      });
      const marks = readsAttendance(ctx.bits);
      const held = await heldIn(
        ctx.db,
        occurrences,
        viewerOf(ctx, await profilesOf(ctx.db, ctx.actor.id)),
      );
      return (occurrences as OccurrenceRow[]).map((row) =>
        toDto(row, marks, held),
      );
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
