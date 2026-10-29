import { TRPCError } from "@trpc/server";
import Papa from "papaparse";
import { z } from "zod";

import { ROOM_FEATURES } from "~/components/app/booking/room-fit";
import { startOfLocalDay } from "~/lib/dates";
import { addressSearch, contactAddress, personName } from "~/lib/people";
import {
  expandPermissions,
  PermissionBitField,
  PermissionFlags,
} from "~/lib/permissions";
import {
  isApplicable,
  isEditable,
  isShared,
  ROOM_TYPES,
  type PlanStatusName,
} from "~/lib/schedule-plan";
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
  applyPlan,
  previewApply,
} from "~/server/services/schedule-builder/apply";
import {
  DEMAND_COLUMNS,
  matchDemandColumn,
  resolveDemand,
  type DemandColumn,
} from "~/server/services/schedule-builder/demand-csv";
import {
  loadLiveWeek,
  mondayOf,
} from "~/server/services/schedule-builder/live-week";
import {
  checkPlacement,
  solve,
  type BusyBlock,
  type SolverRequirement,
} from "~/server/services/schedule-builder/solve";
import type { Db } from "~/server/services/occurrences";
import { withNote } from "~/server/services/notifications/audience";
import { notify } from "~/server/services/notifications/notify";
import { PlanStatus } from "../../../../generated/prisma";

/**
 * The schedule builder.
 *
 * Everything here operates on a draft. Nothing in this router touches the live
 * timetable except `apply`, which is gated on the plan having been approved by
 * every person it was shared with — that gate is the whole point of the
 * feature, so it is enforced here rather than in the UI.
 *
 * Three access rules run through the file, applied by `loadPlan`:
 *   · a DRAFT is visible to whoever created it, and to nobody else
 *   · a shared plan is visible to anyone with planner access
 *   · only the creator edits it, and only while it is still being drafted
 */

const planId = z.string().cuid();

const featureEnum = z.enum(ROOM_FEATURES);
const roomTypeEnum = z.enum(ROOM_TYPES);

const requirementInput = z.object({
  groupId: z.string().cuid(),
  subject: z.string().trim().min(1).max(160),
  sessionsPerWeek: z.number().int().min(1).max(40),
  durationMinutes: z.number().int().min(5).max(720),
  facultyIds: z.array(z.string().cuid()).max(8).default([]),
  requiredFeatures: z.array(featureEnum).max(8).default([]),
  roomType: roomTypeEnum.nullish(),
  minCapacity: z.number().int().min(1).max(2000).nullish(),
  preferredRoomId: z.string().cuid().nullish(),
  notes: z.string().max(500).nullish(),
});

// ─── Loading and access ─────────────────────────────────────────────────────

type Ctx = {
  db: Db;
  orgId: string;
  actor: { id: string };
  bits: PermissionBitField;
};

interface LoadedPlan {
  id: string;
  orgId: string;
  name: string;
  status: PlanStatusName;
  createdById: string | null;
  weekStart: Date;
  repeatUntil: Date | null;
  semesterId: string | null;
  slotMinutes: number;
  dayStartMinutes: number;
  dayEndMinutes: number;
  workingDays: number[];
  maxPerDay: number;
  spreadAcrossDays: boolean;
  respectLiveTimetable: boolean;
}

/**
 * Fetches a plan and decides whether this person may see or change it.
 *
 * A DRAFT belongs to its author alone — deliberately not overridable by an
 * administrator, because "nobody sees this until I share it" is the promise the
 * feature makes, and a promise with an exception is not one.
 */
async function loadPlan(
  ctx: Ctx,
  id: string,
  mode: "read" | "write" = "read",
): Promise<LoadedPlan> {
  const plan = await ctx.db.schedulePlan.findFirst({
    where: { id, orgId: ctx.orgId },
    select: {
      id: true,
      orgId: true,
      name: true,
      status: true,
      createdById: true,
      weekStart: true,
      repeatUntil: true,
      semesterId: true,
      slotMinutes: true,
      dayStartMinutes: true,
      dayEndMinutes: true,
      workingDays: true,
      maxPerDay: true,
      spreadAcrossDays: true,
      respectLiveTimetable: true,
    },
  });
  if (!plan)
    throw new TRPCError({ code: "NOT_FOUND", message: "No such plan." });

  const isMine = plan.createdById === ctx.actor.id;
  const status = plan.status;

  if (!isShared(status) && !isMine) {
    // Indistinguishable from "does not exist", on purpose.
    throw new TRPCError({ code: "NOT_FOUND", message: "No such plan." });
  }
  if (!isMine && !ctx.bits.has(PermissionFlags.ViewSchedulePlans)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have planner access.",
    });
  }

  if (mode === "write") {
    if (!ctx.bits.has(PermissionFlags.ManageSchedulePlans)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have permission to build schedule plans.",
      });
    }
    if (!isMine) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Only the person who created a plan can change it. Take a copy to work from.",
      });
    }
    if (!isEditable(status)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          status === "IN_REVIEW"
            ? "This plan is out for review. Withdraw it, or revise it into a new draft."
            : `A plan that is ${status.toLowerCase().replace("_", " ")} can no longer be edited. Revise it into a new draft.`,
      });
    }
  }

  return { ...plan, status };
}

async function orgTimezone(db: Db, orgId: string): Promise<string> {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true },
  });
  return org?.timezone ?? "Asia/Kolkata";
}

/** Faculty names for a set of ids, so a plan can render who teaches what. */
async function facultyNames(
  db: Db,
  orgId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.facultyProfile.findMany({
    where: { orgId, id: { in: [...new Set(ids)] } },
    select: { id: true, shortName: true, user: { select: { name: true } } },
  });
  return new Map(
    rows.map((f) => [f.id, f.shortName ?? f.user.name ?? "Unnamed"] as const),
  );
}

/** Recomputes a shared plan's status from where its reviewers have got to. */
function statusFromReviews(
  reviews: Array<{ decision: string }>,
): PlanStatusName {
  if (reviews.some((r) => r.decision === "CHANGES_REQUESTED")) {
    return "CHANGES_REQUESTED";
  }
  if (reviews.length > 0 && reviews.every((r) => r.decision === "APPROVED")) {
    return "APPROVED";
  }
  return "IN_REVIEW";
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const plansRouter = createTRPCRouter({
  /**
   * The plans this person can open: their own drafts, plus everything that has
   * been shared. Filtering happens in the query rather than after it, so a
   * draft never leaves the database in the first place.
   */
  list: permissionProcedure(PermissionFlags.ViewSchedulePlans)
    .input(
      z
        .object({
          scope: z.enum(["all", "mine", "shared", "review"]).default("all"),
          query: z.string().trim().max(120).optional(),
          /**
           * The twenty this endpoint has always answered with, kept rather
           * than widened — the same exception `users.list` is, and for the
           * same reason. `plans-view.tsx` has paged since it was written and
           * names the page it wants on every request, so nothing renders this
           * list whole and nobody loses rows to the default. Read
           * `pageInput`'s doc comment before copying the number anywhere else.
           */
          ...pageInput({ defaultSize: 20, maxSize: 100 }),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const visible = {
        OR: [
          { createdById: ctx.actor.id },
          { status: { not: PlanStatus.DRAFT } },
        ],
      };
      const scoped =
        input.scope === "mine"
          ? { createdById: ctx.actor.id }
          : input.scope === "shared"
            ? { status: { not: PlanStatus.DRAFT } }
            : input.scope === "review"
              ? {
                  status: PlanStatus.IN_REVIEW,
                  reviewers: {
                    some: {
                      userId: ctx.actor.id,
                      decision: "PENDING" as const,
                    },
                  },
                }
              : {};

      const where = {
        orgId: ctx.orgId,
        AND: [
          visible,
          scoped,
          ...(input.query
            ? [
                {
                  name: { contains: input.query, mode: "insensitive" as const },
                },
              ]
            : []),
        ],
      };

      const [rows, total] = await Promise.all([
        ctx.db.schedulePlan.findMany({
          where,
          orderBy: [{ updatedAt: "desc" }],
          ...pageArgs(input),
          select: {
            id: true,
            name: true,
            status: true,
            version: true,
            weekStart: true,
            repeatUntil: true,
            createdById: true,
            createdAt: true,
            updatedAt: true,
            generatedAt: true,
            appliedAt: true,
            createdBy: { select: { name: true, email: true } },
            semester: { select: { id: true, name: true } },
            reviewers: {
              select: {
                userId: true,
                decision: true,
                user: { select: { name: true, email: true } },
              },
            },
            _count: {
              select: { requirements: true, sessions: true, comments: true },
            },
          },
        }),
        ctx.db.schedulePlan.count({ where }),
      ]);

      return toPage(
        rows.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          version: p.version,
          weekStart: p.weekStart,
          repeatUntil: p.repeatUntil,
          termName: p.semester?.name ?? null,
          isMine: p.createdById === ctx.actor.id,
          authorName: personName(p.createdBy, "Someone"),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          generatedAt: p.generatedAt,
          appliedAt: p.appliedAt,
          requirementCount: p._count.requirements,
          sessionCount: p._count.sessions,
          commentCount: p._count.comments,
          reviewerCount: p.reviewers.length,
          approvedCount: p.reviewers.filter((r) => r.decision === "APPROVED")
            .length,
          /** Set when this person still owes the plan an answer. */
          awaitingMe: p.reviewers.some(
            (r) => r.userId === ctx.actor.id && r.decision === "PENDING",
          ),
        })),
        total,
        input,
      );
    }),

  /** Everything one plan's workspace needs, in a single round trip. */
  byId: protectedProcedure
    .input(z.object({ id: planId }))
    .query(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx, input.id);

      const [full, requirements, sessions, reviewers, comments, timeZone] =
        await Promise.all([
          ctx.db.schedulePlan.findUniqueOrThrow({
            where: { id: plan.id },
            select: {
              id: true,
              name: true,
              notes: true,
              status: true,
              version: true,
              rootId: true,
              parentId: true,
              weekStart: true,
              repeatUntil: true,
              slotMinutes: true,
              dayStartMinutes: true,
              dayEndMinutes: true,
              workingDays: true,
              maxPerDay: true,
              spreadAcrossDays: true,
              respectLiveTimetable: true,
              createdById: true,
              createdAt: true,
              updatedAt: true,
              sharedAt: true,
              generatedAt: true,
              appliedAt: true,
              createdBy: { select: { name: true, email: true } },
              semester: {
                select: {
                  id: true,
                  name: true,
                  startDate: true,
                  endDate: true,
                },
              },
            },
          }),
          ctx.db.schedulePlanRequirement.findMany({
            where: { planId: plan.id },
            orderBy: [{ position: "asc" }, { subject: "asc" }],
            include: {
              group: {
                select: {
                  id: true,
                  name: true,
                  label: true,
                  _count: { select: { students: true } },
                },
              },
              preferredRoom: { select: { id: true, code: true } },
            },
          }),
          ctx.db.schedulePlanSession.findMany({
            where: { planId: plan.id },
            orderBy: [
              { dayOfWeek: "asc" },
              { startMinutes: "asc" },
              { title: "asc" },
            ],
            include: {
              group: { select: { id: true, name: true, label: true } },
              room: { select: { id: true, code: true, capacity: true } },
            },
          }),
          ctx.db.schedulePlanReviewer.findMany({
            where: { planId: plan.id },
            orderBy: { invitedAt: "asc" },
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          }),
          ctx.db.schedulePlanComment.findMany({
            where: { planId: plan.id },
            orderBy: { createdAt: "asc" },
            include: {
              author: { select: { id: true, name: true, email: true } },
            },
          }),
          orgTimezone(ctx.db, ctx.orgId),
        ]);

      const names = await facultyNames(ctx.db, ctx.orgId, [
        ...requirements.flatMap((r) => r.facultyIds),
        ...sessions.flatMap((s) => s.facultyIds),
      ]);
      /** An id that no longer resolves is shown, not swallowed. */
      const nameOf = (id: string) => names.get(id) ?? "Removed from staff";

      const isMine = full.createdById === ctx.actor.id;
      const myReview = reviewers.find((r) => r.user.id === ctx.actor.id);

      return {
        id: full.id,
        name: full.name,
        notes: full.notes,
        status: full.status,
        version: full.version,
        rootId: full.rootId,
        parentId: full.parentId,
        weekStart: full.weekStart,
        repeatUntil: full.repeatUntil,
        settings: {
          slotMinutes: full.slotMinutes,
          dayStartMinutes: full.dayStartMinutes,
          dayEndMinutes: full.dayEndMinutes,
          workingDays: full.workingDays,
          maxPerDay: full.maxPerDay,
          spreadAcrossDays: full.spreadAcrossDays,
          respectLiveTimetable: full.respectLiveTimetable,
        },
        semester: full.semester,
        timeZone,
        author: {
          id: full.createdById,
          name: personName(full.createdBy, "Someone"),
        },
        createdAt: full.createdAt,
        updatedAt: full.updatedAt,
        sharedAt: full.sharedAt,
        generatedAt: full.generatedAt,
        appliedAt: full.appliedAt,

        /** What this viewer is allowed to do, so the UI never offers a dead button. */
        can: {
          edit:
            isMine &&
            ctx.bits.has(PermissionFlags.ManageSchedulePlans) &&
            isEditable(full.status),
          share: isMine && ctx.bits.has(PermissionFlags.ManageSchedulePlans),
          review:
            !!myReview &&
            ctx.bits.has(PermissionFlags.ApproveSchedulePlans) &&
            full.status === PlanStatus.IN_REVIEW,
          comment: true,
          revise: isMine && ctx.bits.has(PermissionFlags.ManageSchedulePlans),
          apply:
            isMine &&
            ctx.bits.hasAll(
              PermissionFlags.ManageSchedulePlans,
              PermissionFlags.ManageAllEvents,
            ) &&
            isApplicable(full.status),
        },
        myDecision: myReview?.decision ?? null,

        requirements: requirements.map((r) => ({
          id: r.id,
          groupId: r.groupId,
          groupLabel: r.group.label ?? r.group.name,
          groupSize: r.group._count.students,
          subject: r.subject,
          sessionsPerWeek: r.sessionsPerWeek,
          durationMinutes: r.durationMinutes,
          facultyIds: r.facultyIds,
          facultyNames: r.facultyIds.map(nameOf),
          requiredFeatures: r.requiredFeatures,
          roomType: r.roomType,
          minCapacity: r.minCapacity,
          preferredRoomId: r.preferredRoomId,
          preferredRoomCode: r.preferredRoom?.code ?? null,
          notes: r.notes,
          sourceLine: r.sourceLine,
          position: r.position,
        })),

        sessions: sessions.map((s) => ({
          id: s.id,
          requirementId: s.requirementId,
          title: s.title,
          groupId: s.groupId,
          groupLabel: s.group.label ?? s.group.name,
          facultyIds: s.facultyIds,
          facultyNames: s.facultyIds.map(nameOf),
          dayOfWeek: s.dayOfWeek,
          startMinutes: s.startMinutes,
          durationMinutes: s.durationMinutes,
          roomId: s.roomId,
          roomCode: s.room?.code ?? null,
          reason: s.reason,
          pinned: s.pinned,
          appliedEventId: s.appliedEventId,
          commentCount: comments.filter((c) => c.sessionId === s.id).length,
        })),

        reviewers: reviewers.map((r) => ({
          userId: r.user.id,
          name: personName(r.user),
          email: contactAddress(r.user.email),
          decision: r.decision,
          decidedAt: r.decidedAt,
          note: r.note,
        })),

        comments: comments.map((c) => ({
          id: c.id,
          sessionId: c.sessionId,
          body: c.body,
          createdAt: c.createdAt,
          resolvedAt: c.resolvedAt,
          authorId: c.author?.id ?? null,
          authorName: personName(c.author, "Someone"),
          isMine: c.author?.id === ctx.actor.id,
        })),
      };
    }),

  /** Every draft in this plan's revision chain, oldest first. */
  history: protectedProcedure
    .input(
      z.object({
        id: planId,
        /**
         * A chain is a handful of drafts — write one, revise it, revise it
         * again, apply it — and `review-panel.tsx` draws the whole of it as a
         * timeline with no pager anywhere near it. Two hundred is well past
         * any plan a person has genuinely reworked, so the timeline keeps
         * arriving complete for a caller that has never heard of paging.
         */
        ...pageInput({ defaultSize: 200, maxSize: 500 }),
      }),
    )
    .query(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx, input.id);
      const root = await ctx.db.schedulePlan.findUniqueOrThrow({
        where: { id: plan.id },
        select: { rootId: true },
      });
      const chainId = root.rootId ?? plan.id;

      const where = {
        orgId: ctx.orgId,
        OR: [{ id: chainId }, { rootId: chainId }],
        // The same visibility rule as everywhere else.
        AND: [
          {
            OR: [
              { createdById: ctx.actor.id },
              { status: { not: PlanStatus.DRAFT } },
            ],
          },
        ],
      };

      const [rows, total] = await Promise.all([
        ctx.db.schedulePlan.findMany({
          where,
          orderBy: { version: "asc" },
          ...pageArgs(input),
          select: {
            id: true,
            version: true,
            status: true,
            createdAt: true,
            appliedAt: true,
            _count: { select: { comments: true, reviewers: true } },
          },
        }),
        ctx.db.schedulePlan.count({ where }),
      ]);

      return toPage(
        rows.map((r) => ({
          id: r.id,
          version: r.version,
          status: r.status,
          createdAt: r.createdAt,
          appliedAt: r.appliedAt,
          commentCount: r._count.comments,
          reviewerCount: r._count.reviewers,
          isCurrent: r.id === plan.id,
        })),
        total,
        input,
      );
    }),

  /** Rooms, terms and settings a plan workspace needs. */
  workspace: permissionProcedure(PermissionFlags.ViewSchedulePlans).query(
    async ({ ctx }) => {
      const [rooms, terms, settings, timeZone] = await Promise.all([
        ctx.db.room.findMany({
          where: { orgId: ctx.orgId, isActive: true },
          orderBy: [{ capacity: "asc" }, { code: "asc" }],
          select: {
            id: true,
            code: true,
            capacity: true,
            type: true,
            features: true,
            building: { select: { name: true } },
          },
        }),
        ctx.db.semester.findMany({
          where: { orgId: ctx.orgId },
          orderBy: { startDate: "desc" },
          select: { id: true, name: true, startDate: true, endDate: true },
        }),
        ctx.db.orgSettings.findUnique({ where: { orgId: ctx.orgId } }),
        orgTimezone(ctx.db, ctx.orgId),
      ]);

      return { rooms, terms, settings, timeZone };
    },
  ),

  /**
   * Who can be asked to sign a plan off. Only people who actually hold the
   * approval permission are offered — inviting someone who cannot answer is a
   * dead end that only shows up after the plan has been shared.
   */
  reviewerCandidates: permissionProcedure(PermissionFlags.ManageSchedulePlans)
    .input(
      z.object({ query: z.string().trim().max(120).optional() }).default({}),
    )
    .query(async ({ ctx, input }) => {
      const users = await ctx.db.user.findMany({
        where: {
          orgId: ctx.orgId,
          isActive: true,
          // Signing a plan off is a judgement somebody makes. A key can hold
          // the approval bit in its scopes and call the mutation, but it can
          // never be *asked* to — offering one here would leave a plan waiting
          // on a reviewer that will never open it.
          isServiceAccount: false,
          ...(input.query
            ? {
                OR: [
                  {
                    name: {
                      contains: input.query,
                      mode: "insensitive" as const,
                    },
                  },
                  addressSearch(input.query),
                ],
              }
            : {}),
        },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
          permissions: true,
          roles: {
            select: { role: { select: { name: true, permissions: true } } },
          },
        },
      });

      // Reported whole, and the one list in this router with no `page` to ask
      // for a second one. Whether somebody can approve a plan is decided by
      // OR-ing their own permission bits with every role they hold and then
      // expanding the implications — arithmetic, not a `where` clause anything
      // can be given — so the filter can only run after the rows arrive.
      // `skip`/`take` on the query underneath would page the *directory* and
      // filter afterwards, which answers with short pages, empty pages, and a
      // `total` counting people the caller is never shown. Whole is also small:
      // what survives is the handful of people who can sign a timetable off.
      //
      // The fifty-row cap that used to sit here goes with it. It trimmed the
      // list a picker searches, which is the failure that looks exactly like
      // success — you simply never find the colleague who was row fifty-one.
      return wholeList(
        users
          .map((u) => {
            const bits = u.roles.reduce(
              (acc, r) => acc | r.role.permissions,
              u.permissions,
            );
            return {
              id: u.id,
              name: personName(u),
              email: contactAddress(u.email),
              roleNames: u.roles.map((r) => r.role.name),
              canApprove: new PermissionBitField(expandPermissions(bits)).has(
                PermissionFlags.ApproveSchedulePlans,
              ),
            };
          })
          .filter((u) => u.canApprove && u.id !== ctx.actor.id),
      );
    }),

  // ─── Drafting ─────────────────────────────────────────────────────────────

  create: permissionProcedure(PermissionFlags.ManageSchedulePlans)
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        semesterId: z.string().cuid().nullish(),
        /** Any date inside the week the pattern hangs off. */
        weekStart: z.date().optional(),
        repeatUntil: z.date().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [settings, timeZone] = await Promise.all([
        ctx.db.orgSettings.findUniqueOrThrow({ where: { orgId: ctx.orgId } }),
        orgTimezone(ctx.db, ctx.orgId),
      ]);

      const term = input.semesterId
        ? await ctx.db.semester.findFirst({
            where: { id: input.semesterId, orgId: ctx.orgId },
            select: { startDate: true, endDate: true },
          })
        : null;

      // Default the window to the term when there is one: a plan almost always
      // means "this term's timetable", and typing both dates again is friction.
      const anchor = input.weekStart ?? term?.startDate ?? new Date();
      const weekStart = mondayOf(anchor, timeZone);
      const repeatUntil =
        input.repeatUntil === undefined
          ? (term?.endDate ?? null)
          : input.repeatUntil;

      const plan = await ctx.db.schedulePlan.create({
        data: {
          orgId: ctx.orgId,
          name: input.name,
          semesterId: input.semesterId ?? null,
          createdById: ctx.actor.id,
          weekStart,
          repeatUntil,
          // Snapshotted so a settings change cannot silently move the plan.
          slotMinutes: settings.slotMinutes,
          dayStartMinutes: settings.dayStartMinutes,
          dayEndMinutes: settings.dayEndMinutes,
          workingDays: settings.workingDays,
        },
        select: { id: true },
      });
      return plan;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: planId,
        name: z.string().trim().min(1).max(120).optional(),
        notes: z.string().max(2000).nullish(),
        semesterId: z.string().cuid().nullish(),
        weekStart: z.date().optional(),
        repeatUntil: z.date().nullish(),
        maxPerDay: z.number().int().min(0).max(12).optional(),
        spreadAcrossDays: z.boolean().optional(),
        respectLiveTimetable: z.boolean().optional(),
        workingDays: z
          .array(z.number().int().min(1).max(7))
          .min(1)
          .max(7)
          .optional(),
        dayStartMinutes: z.number().int().min(0).max(1439).optional(),
        dayEndMinutes: z.number().int().min(1).max(1440).optional(),
        slotMinutes: z.number().int().min(5).max(240).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadPlan(ctx, input.id, "write");
      const timeZone = await orgTimezone(ctx.db, ctx.orgId);

      const start = input.dayStartMinutes;
      const end = input.dayEndMinutes;
      if (start !== undefined && end !== undefined && end <= start) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The working day has to end after it starts.",
        });
      }

      await ctx.db.schedulePlan.update({
        where: { id: input.id },
        data: {
          name: input.name,
          notes: input.notes,
          semesterId: input.semesterId,
          ...(input.weekStart
            ? { weekStart: mondayOf(input.weekStart, timeZone) }
            : {}),
          ...(input.repeatUntil === undefined
            ? {}
            : { repeatUntil: input.repeatUntil }),
          maxPerDay: input.maxPerDay,
          spreadAcrossDays: input.spreadAcrossDays,
          respectLiveTimetable: input.respectLiveTimetable,
          workingDays: input.workingDays,
          dayStartMinutes: input.dayStartMinutes,
          dayEndMinutes: input.dayEndMinutes,
          slotMinutes: input.slotMinutes,
        },
      });
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: planId }))
    .mutation(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx, input.id);
      if (plan.createdById !== ctx.actor.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the person who created a plan can delete it.",
        });
      }
      if (plan.status === "APPLIED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This plan is on the live timetable. Archive it instead — deleting it would erase the record of what it created.",
        });
      }
      await ctx.db.schedulePlan.delete({ where: { id: plan.id } });
      return { ok: true };
    }),

  archive: protectedProcedure
    .input(z.object({ id: planId }))
    .mutation(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx, input.id);
      if (plan.createdById !== ctx.actor.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your plan." });
      }
      await ctx.db.schedulePlan.update({
        where: { id: plan.id },
        data: { status: PlanStatus.ARCHIVED },
      });
      return { ok: true };
    }),

  // ─── Demand ───────────────────────────────────────────────────────────────

  addRequirement: protectedProcedure
    .input(z.object({ planId, requirement: requirementInput }))
    .mutation(async ({ ctx, input }) => {
      await loadPlan(ctx, input.planId, "write");
      await assertGroupInOrg(ctx, input.requirement.groupId);

      const last = await ctx.db.schedulePlanRequirement.findFirst({
        where: { planId: input.planId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      const row = await ctx.db.schedulePlanRequirement.create({
        data: {
          planId: input.planId,
          position: (last?.position ?? -1) + 1,
          groupId: input.requirement.groupId,
          subject: input.requirement.subject,
          sessionsPerWeek: input.requirement.sessionsPerWeek,
          durationMinutes: input.requirement.durationMinutes,
          facultyIds: input.requirement.facultyIds,
          requiredFeatures: input.requirement.requiredFeatures,
          roomType: input.requirement.roomType ?? null,
          minCapacity: input.requirement.minCapacity ?? null,
          preferredRoomId: input.requirement.preferredRoomId ?? null,
          notes: input.requirement.notes ?? null,
        },
        select: { id: true },
      });
      return row;
    }),

  updateRequirement: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        requirement: requirementInput.partial(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.schedulePlanRequirement.findUnique({
        where: { id: input.id },
        select: { planId: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await loadPlan(ctx, existing.planId, "write");
      if (input.requirement.groupId) {
        await assertGroupInOrg(ctx, input.requirement.groupId);
      }

      await ctx.db.schedulePlanRequirement.update({
        where: { id: input.id },
        data: {
          groupId: input.requirement.groupId,
          subject: input.requirement.subject,
          sessionsPerWeek: input.requirement.sessionsPerWeek,
          durationMinutes: input.requirement.durationMinutes,
          facultyIds: input.requirement.facultyIds,
          requiredFeatures: input.requirement.requiredFeatures,
          ...(input.requirement.roomType === undefined
            ? {}
            : { roomType: input.requirement.roomType }),
          ...(input.requirement.minCapacity === undefined
            ? {}
            : { minCapacity: input.requirement.minCapacity }),
          ...(input.requirement.preferredRoomId === undefined
            ? {}
            : { preferredRoomId: input.requirement.preferredRoomId }),
          ...(input.requirement.notes === undefined
            ? {}
            : { notes: input.requirement.notes }),
        },
      });
      return { ok: true };
    }),

  removeRequirement: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.schedulePlanRequirement.findUnique({
        where: { id: input.id },
        select: { planId: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await loadPlan(ctx, existing.planId, "write");
      // Its generated sessions cascade with it.
      await ctx.db.schedulePlanRequirement.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /** Reads a demand CSV and says what it would add, without adding anything. */
  importPreview: protectedProcedure
    .input(z.object({ planId, csv: z.string().max(2_000_000) }))
    .query(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx, input.planId, "write");
      return resolveDemandCsv(ctx, plan, input.csv);
    }),

  importCommit: protectedProcedure
    .input(
      z.object({
        planId,
        csv: z.string().max(2_000_000),
        /** Wipe the existing demand first, rather than adding to it. */
        replace: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx, input.planId, "write");
      // Re-parsed rather than trusting the preview the browser was shown.
      const resolved = await resolveDemandCsv(ctx, plan, input.csv);
      if (resolved.summary.error > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${resolved.summary.error} line(s) still have errors. Fix the file and try again.`,
        });
      }

      return ctx.db.$transaction(async (tx) => {
        if (input.replace) {
          await tx.schedulePlanRequirement.deleteMany({
            where: { planId: plan.id },
          });
        }
        const last = await tx.schedulePlanRequirement.findFirst({
          where: { planId: plan.id },
          orderBy: { position: "desc" },
          select: { position: true },
        });
        let position = (last?.position ?? -1) + 1;

        const rows = resolved.rows
          .filter((r) => r.requirement)
          .map((r) => ({
            planId: plan.id,
            position: position++,
            groupId: r.requirement!.groupId,
            subject: r.requirement!.subject,
            sessionsPerWeek: r.requirement!.sessionsPerWeek,
            durationMinutes: r.requirement!.durationMinutes,
            facultyIds: r.requirement!.facultyIds,
            requiredFeatures: r.requirement!.requiredFeatures,
            roomType: r.requirement!.roomType,
            minCapacity: r.requirement!.minCapacity,
            preferredRoomId: r.requirement!.preferredRoomId,
            notes: r.requirement!.notes,
            sourceLine: r.requirement!.sourceLine,
          }));

        if (rows.length)
          await tx.schedulePlanRequirement.createMany({ data: rows });
        return { imported: rows.length, sessions: resolved.summary.sessions };
      });
    }),

  // ─── Generating ───────────────────────────────────────────────────────────

  /**
   * Lays the demand out on the week.
   *
   * Pinned sessions survive untouched and are treated as fixed points, so
   * "regenerate but leave the Monday lab where I put it" works.
   */
  generate: protectedProcedure
    .input(z.object({ id: planId }))
    .mutation(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx, input.id, "write");
      const timeZone = await orgTimezone(ctx.db, ctx.orgId);

      const [requirements, pinnedRows, rooms] = await Promise.all([
        ctx.db.schedulePlanRequirement.findMany({
          where: { planId: plan.id },
          orderBy: { position: "asc" },
        }),
        ctx.db.schedulePlanSession.findMany({
          where: { planId: plan.id, pinned: true },
        }),
        ctx.db.room.findMany({
          where: { orgId: ctx.orgId, isActive: true },
          select: {
            id: true,
            code: true,
            capacity: true,
            type: true,
            features: true,
          },
        }),
      ]);

      if (requirements.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add some demand before generating a timetable.",
        });
      }

      const groupIds = [...new Set(requirements.map((r) => r.groupId))];
      const sizes = await ctx.db.studentGroupMembership.groupBy({
        by: ["groupId"],
        where: { groupId: { in: groupIds } },
        _count: { studentId: true },
      });
      const groupSizes: Record<string, number> = {};
      for (const row of sizes) groupSizes[row.groupId] = row._count.studentId;

      const busy: BusyBlock[] = plan.respectLiveTimetable
        ? await loadLiveWeek(ctx.db, {
            orgId: ctx.orgId,
            weekStart: plan.weekStart,
            timeZone,
          })
        : [];

      const solverRequirements: SolverRequirement[] = requirements.map((r) => ({
        id: r.id,
        groupId: r.groupId,
        subject: r.subject,
        // A pinned session already covers one of the weekly count.
        sessionsPerWeek: Math.max(
          0,
          r.sessionsPerWeek -
            pinnedRows.filter((p) => p.requirementId === r.id).length,
        ),
        durationMinutes: r.durationMinutes,
        facultyIds: r.facultyIds,
        requiredFeatures: r.requiredFeatures,
        roomType: r.roomType,
        minCapacity: r.minCapacity,
        preferredRoomId: r.preferredRoomId,
      }));

      const result = solve({
        requirements: solverRequirements,
        rooms,
        groupSizes,
        busy,
        pinned: pinnedRows
          .filter((p) => p.dayOfWeek !== null && p.startMinutes !== null)
          .map((p) => ({
            sessionId: p.id,
            requirementId: p.requirementId,
            dayOfWeek: p.dayOfWeek!,
            startMinutes: p.startMinutes!,
            durationMinutes: p.durationMinutes,
            roomId: p.roomId,
            groupId: p.groupId,
            facultyIds: p.facultyIds,
          })),
        options: {
          workingDays: plan.workingDays,
          dayStartMinutes: plan.dayStartMinutes,
          dayEndMinutes: plan.dayEndMinutes,
          slotMinutes: plan.slotMinutes,
          maxPerDay: plan.maxPerDay,
          spreadAcrossDays: plan.spreadAcrossDays,
        },
      });

      const byRequirement = new Map(requirements.map((r) => [r.id, r]));

      await ctx.db.$transaction(async (tx) => {
        await tx.schedulePlanSession.deleteMany({
          where: { planId: plan.id, pinned: false },
        });
        if (result.sessions.length) {
          await tx.schedulePlanSession.createMany({
            data: result.sessions.map((s) => {
              const requirement = byRequirement.get(s.requirementId);
              return {
                planId: plan.id,
                requirementId: s.requirementId,
                title: s.title,
                groupId: requirement?.groupId ?? s.groupId,
                facultyIds: s.facultyIds,
                dayOfWeek: s.dayOfWeek,
                startMinutes: s.startMinutes,
                durationMinutes: s.durationMinutes,
                roomId: s.roomId,
                reason: s.reason,
              };
            }),
          });
        }
        await tx.schedulePlan.update({
          where: { id: plan.id },
          data: { generatedAt: new Date() },
        });
      });

      return {
        placed: result.placed + pinnedRows.length,
        unplaced: result.unplaced,
        relocated: result.relocated,
        pinned: pinnedRows.length,
      };
    }),

  /** Hand-places one session, pinning it so a regenerate leaves it alone. */
  moveSession: protectedProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        dayOfWeek: z.number().int().min(1).max(7),
        startMinutes: z.number().int().min(0).max(1439),
        roomId: z.string().cuid().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.schedulePlanSession.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          planId: true,
          groupId: true,
          facultyIds: true,
          durationMinutes: true,
          roomId: true,
        },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const plan = await loadPlan(ctx, session.planId, "write");
      const timeZone = await orgTimezone(ctx.db, ctx.orgId);

      const roomId = input.roomId === undefined ? session.roomId : input.roomId;

      const [others, busy] = await Promise.all([
        ctx.db.schedulePlanSession.findMany({
          where: { planId: plan.id, id: { not: session.id } },
          select: {
            id: true,
            title: true,
            groupId: true,
            facultyIds: true,
            roomId: true,
            dayOfWeek: true,
            startMinutes: true,
            durationMinutes: true,
          },
        }),
        plan.respectLiveTimetable
          ? loadLiveWeek(ctx.db, {
              orgId: ctx.orgId,
              weekStart: plan.weekStart,
              timeZone,
            })
          : Promise.resolve([] as BusyBlock[]),
      ]);

      const check = checkPlacement(
        {
          sessionId: session.id,
          groupId: session.groupId,
          facultyIds: session.facultyIds,
          roomId: roomId ?? null,
          dayOfWeek: input.dayOfWeek,
          startMinutes: input.startMinutes,
          durationMinutes: session.durationMinutes,
        },
        others.map((o) => ({ sessionId: o.id, ...o })),
        busy,
        {
          workingDays: plan.workingDays,
          dayStartMinutes: plan.dayStartMinutes,
          dayEndMinutes: plan.dayEndMinutes,
        },
      );
      if (!check.ok) {
        throw new TRPCError({ code: "CONFLICT", message: check.reason! });
      }

      await ctx.db.schedulePlanSession.update({
        where: { id: session.id },
        data: {
          dayOfWeek: input.dayOfWeek,
          startMinutes: input.startMinutes,
          roomId: roomId ?? null,
          reason: null,
          pinned: true,
        },
      });
      return { ok: true };
    }),

  setSessionPinned: protectedProcedure
    .input(z.object({ id: z.string().cuid(), pinned: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.schedulePlanSession.findUnique({
        where: { id: input.id },
        select: { planId: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await loadPlan(ctx, session.planId, "write");
      await ctx.db.schedulePlanSession.update({
        where: { id: input.id },
        data: { pinned: input.pinned },
      });
      return { ok: true };
    }),

  /** Takes a session off the grid without deleting the demand behind it. */
  clearSession: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.schedulePlanSession.findUnique({
        where: { id: input.id },
        select: { planId: true },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await loadPlan(ctx, session.planId, "write");
      await ctx.db.schedulePlanSession.update({
        where: { id: input.id },
        data: {
          dayOfWeek: null,
          startMinutes: null,
          roomId: null,
          pinned: false,
          reason: "Taken off the grid by hand.",
        },
      });
      return { ok: true };
    }),

  // ─── Review ───────────────────────────────────────────────────────────────

  /**
   * Shares a draft for sign-off.
   *
   * This is the moment the plan stops being private, so it is also the moment
   * the reviewer list is fixed. Everyone named must be able to approve, or the
   * plan could never reach APPROVED.
   */
  share: protectedProcedure
    .input(
      z.object({
        id: planId,
        reviewerIds: z.array(z.string().cuid()).min(1).max(20),
        message: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx, input.id);
      if (plan.createdById !== ctx.actor.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your plan." });
      }
      if (!ctx.bits.has(PermissionFlags.ManageSchedulePlans)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No planner access.",
        });
      }
      if (plan.status === "APPLIED" || plan.status === "ARCHIVED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This plan is finished with.",
        });
      }

      const sessionCount = await ctx.db.schedulePlanSession.count({
        where: { planId: plan.id },
      });
      if (sessionCount === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Generate the timetable before sharing it — there is nothing to review yet.",
        });
      }

      await assertCanApprove(ctx, input.reviewerIds);

      return ctx.db.$transaction(async (tx) => {
        // Who was already asked, before the list is rebuilt below. A plan that
        // is still out for review and gets a name added tells only that person;
        // one that was withdrawn or sent back is being shown afresh, to all.
        const alreadyAsked =
          plan.status === "IN_REVIEW"
            ? new Set(
                (
                  await tx.schedulePlanReviewer.findMany({
                    where: { planId: plan.id },
                    select: { userId: true },
                  })
                ).map((r) => r.userId),
              )
            : new Set<string>();
        const sharedAt = new Date();

        // Re-sharing resets the answers: what a reviewer approved and what they
        // are being shown now must never be two different things.
        await tx.schedulePlanReviewer.deleteMany({
          where: { planId: plan.id },
        });
        await tx.schedulePlanReviewer.createMany({
          data: input.reviewerIds.map((userId) => ({
            planId: plan.id,
            userId,
          })),
        });
        if (input.message?.trim()) {
          await tx.schedulePlanComment.create({
            data: {
              planId: plan.id,
              authorId: ctx.actor.id,
              body: input.message.trim(),
            },
          });
        }
        await tx.schedulePlan.update({
          where: { id: plan.id },
          data: { status: PlanStatus.IN_REVIEW, sharedAt },
        });

        const author = await tx.user.findUnique({
          where: { id: ctx.actor.id },
          select: { name: true, email: true },
        });
        await notify(
          tx,
          input.reviewerIds.filter(
            (id) => id !== ctx.actor.id && !alreadyAsked.has(id),
          ),
          {
            orgId: ctx.orgId,
            category: "PLAN_REVIEWS",
            title: "Schedule plan shared for review",
            body: withNote(
              `${author?.name ?? author?.email ?? "Someone"} asks you to review ${plan.name}`,
              input.message,
            ),
            url: `/planner/${plan.id}`,
            // One key per sharing, so pressing Share twice in a moment tells
            // nobody twice, but sharing the plan again after it was withdrawn
            // is news again.
            sourceKey: `plan-shared:${plan.id}:${sharedAt.getTime()}`,
          },
        );
        return { ok: true, reviewers: input.reviewerIds.length };
      });
    }),

  /** Pulls a plan back out of review, making it private again. */
  withdraw: protectedProcedure
    .input(z.object({ id: planId }))
    .mutation(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx, input.id);
      if (plan.createdById !== ctx.actor.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your plan." });
      }
      if (plan.status === "APPLIED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This plan is already on the timetable.",
        });
      }
      await ctx.db.$transaction(async (tx) => {
        await tx.schedulePlanReviewer.updateMany({
          where: { planId: plan.id },
          data: { decision: "PENDING", decidedAt: null, note: null },
        });
        await tx.schedulePlan.update({
          where: { id: plan.id },
          data: { status: PlanStatus.DRAFT, sharedAt: null },
        });
      });
      return { ok: true };
    }),

  /** A reviewer's answer. The plan's status follows from all of them together. */
  review: permissionProcedure(PermissionFlags.ApproveSchedulePlans)
    .input(
      z.object({
        id: planId,
        decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
        note: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx, input.id);
      if (plan.status !== "IN_REVIEW") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This plan is not out for review.",
        });
      }

      const seat = await ctx.db.schedulePlanReviewer.findUnique({
        where: { planId_userId: { planId: plan.id, userId: ctx.actor.id } },
      });
      if (!seat) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This plan was not shared with you for approval.",
        });
      }

      return ctx.db.$transaction(async (tx) => {
        await tx.schedulePlanReviewer.update({
          where: { planId_userId: { planId: plan.id, userId: ctx.actor.id } },
          data: {
            decision: input.decision,
            decidedAt: new Date(),
            note: input.note?.trim() ?? null,
          },
        });
        if (input.note?.trim()) {
          await tx.schedulePlanComment.create({
            data: {
              planId: plan.id,
              authorId: ctx.actor.id,
              body: input.note.trim(),
            },
          });
        }

        // Saying the same thing again is not news, and nor is reviewing your
        // own plan. The key carries the time of
        // the answer being replaced, so two clicks that both saw the old
        // answer write one notification between them, while approving after
        // having asked for changes is a new one.
        if (
          seat.decision !== input.decision &&
          plan.createdById !== ctx.actor.id
        ) {
          const reviewer = await tx.user.findUnique({
            where: { id: ctx.actor.id },
            select: { name: true, email: true },
          });
          const who = reviewer?.name ?? reviewer?.email ?? "A reviewer";
          await notify(tx, [plan.createdById], {
            orgId: ctx.orgId,
            category: "PLAN_REVIEWS",
            title:
              input.decision === "APPROVED"
                ? "Schedule plan approved"
                : "Changes requested on a schedule plan",
            body: withNote(
              input.decision === "APPROVED"
                ? `${who} approved ${plan.name}`
                : `${who} asks for changes to ${plan.name}`,
              input.note,
            ),
            url: `/planner/${plan.id}`,
            sourceKey: `plan-review:${plan.id}:${ctx.actor.id}:${input.decision}:${seat.decidedAt?.getTime() ?? 0}`,
          });
        }

        const all = await tx.schedulePlanReviewer.findMany({
          where: { planId: plan.id },
          select: { decision: true },
        });
        const next = statusFromReviews(all);
        await tx.schedulePlan.update({
          where: { id: plan.id },
          data: { status: next },
        });
        return { status: next };
      });
    }),

  comment: protectedProcedure
    .input(
      z.object({
        planId,
        body: z.string().trim().min(1).max(2000),
        /** Pin the comment to one proposed session. */
        sessionId: z.string().cuid().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx, input.planId);
      if (input.sessionId) {
        const owned = await ctx.db.schedulePlanSession.count({
          where: { id: input.sessionId, planId: plan.id },
        });
        if (!owned) throw new TRPCError({ code: "NOT_FOUND" });
      }
      const row = await ctx.db.schedulePlanComment.create({
        data: {
          planId: plan.id,
          authorId: ctx.actor.id,
          body: input.body,
          sessionId: input.sessionId ?? null,
        },
        select: { id: true },
      });
      return row;
    }),

  resolveComment: protectedProcedure
    .input(z.object({ id: z.string().cuid(), resolved: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.schedulePlanComment.findUnique({
        where: { id: input.id },
        select: { planId: true },
      });
      if (!comment) throw new TRPCError({ code: "NOT_FOUND" });
      const plan = await loadPlan(ctx, comment.planId);
      // Anyone who can see the plan may tick a point off as dealt with; the
      // author of the plan is usually the one doing it.
      if (
        plan.createdById !== ctx.actor.id &&
        !ctx.bits.has(PermissionFlags.ApproveSchedulePlans)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not yours to resolve.",
        });
      }
      await ctx.db.schedulePlanComment.update({
        where: { id: input.id },
        data: { resolvedAt: input.resolved ? new Date() : null },
      });
      return { ok: true };
    }),

  deleteComment: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.schedulePlanComment.findUnique({
        where: { id: input.id },
        select: { planId: true, authorId: true },
      });
      if (!comment) throw new TRPCError({ code: "NOT_FOUND" });
      await loadPlan(ctx, comment.planId);
      if (comment.authorId !== ctx.actor.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete your own comments.",
        });
      }
      await ctx.db.schedulePlanComment.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  /**
   * Copies a plan into a fresh draft.
   *
   * The demand and the placements come across; the comments and the approvals
   * do not. That is the rule the whole review model rests on — an approval is
   * an answer about one specific timetable, and it must not survive a change to
   * that timetable.
   */
  revise: protectedProcedure
    .input(
      z.object({
        id: planId,
        name: z.string().trim().min(1).max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const source = await loadPlan(ctx, input.id);
      if (!ctx.bits.has(PermissionFlags.ManageSchedulePlans)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No planner access.",
        });
      }

      const [full, requirements, sessions] = await Promise.all([
        ctx.db.schedulePlan.findUniqueOrThrow({ where: { id: source.id } }),
        ctx.db.schedulePlanRequirement.findMany({
          where: { planId: source.id },
          orderBy: { position: "asc" },
        }),
        ctx.db.schedulePlanSession.findMany({ where: { planId: source.id } }),
      ]);

      const chainId = full.rootId ?? full.id;
      const [highest, alreadyRevised] = await Promise.all([
        ctx.db.schedulePlan.aggregate({
          where: {
            orgId: ctx.orgId,
            OR: [{ id: chainId }, { rootId: chainId }],
          },
          _max: { version: true },
        }),
        // `parentId` is unique, so a second revision of the same draft would
        // fail on the constraint. Caught here so it reads as an explanation
        // rather than a database error.
        ctx.db.schedulePlan.findUnique({
          where: { parentId: full.id },
          select: { id: true, version: true },
        }),
      ]);

      if (alreadyRevised) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `This draft has already been revised into version ${alreadyRevised.version}. Work from that one, or revise it in turn.`,
        });
      }

      return ctx.db.$transaction(async (tx) => {
        const copy = await tx.schedulePlan.create({
          data: {
            orgId: ctx.orgId,
            name: input.name ?? full.name,
            notes: full.notes,
            semesterId: full.semesterId,
            status: PlanStatus.DRAFT,
            version: (highest._max.version ?? full.version) + 1,
            rootId: chainId,
            // Only the newest revision may claim a parent — the column is
            // unique, so a second revision of the same draft is refused rather
            // than quietly forking the chain.
            parentId: full.id,
            createdById: ctx.actor.id,
            weekStart: full.weekStart,
            repeatUntil: full.repeatUntil,
            slotMinutes: full.slotMinutes,
            dayStartMinutes: full.dayStartMinutes,
            dayEndMinutes: full.dayEndMinutes,
            workingDays: full.workingDays,
            maxPerDay: full.maxPerDay,
            spreadAcrossDays: full.spreadAcrossDays,
            respectLiveTimetable: full.respectLiveTimetable,
            generatedAt: full.generatedAt,
          },
          select: { id: true },
        });

        // Requirements first, so their sessions can point at the new ids.
        const idMap = new Map<string, string>();
        for (const r of requirements) {
          const created = await tx.schedulePlanRequirement.create({
            data: {
              planId: copy.id,
              position: r.position,
              groupId: r.groupId,
              subject: r.subject,
              sessionsPerWeek: r.sessionsPerWeek,
              durationMinutes: r.durationMinutes,
              facultyIds: r.facultyIds,
              requiredFeatures: r.requiredFeatures,
              roomType: r.roomType,
              minCapacity: r.minCapacity,
              preferredRoomId: r.preferredRoomId,
              notes: r.notes,
              sourceLine: r.sourceLine,
            },
            select: { id: true },
          });
          idMap.set(r.id, created.id);
        }

        if (sessions.length) {
          await tx.schedulePlanSession.createMany({
            data: sessions.map((s) => ({
              planId: copy.id,
              requirementId: s.requirementId
                ? (idMap.get(s.requirementId) ?? null)
                : null,
              title: s.title,
              groupId: s.groupId,
              facultyIds: s.facultyIds,
              dayOfWeek: s.dayOfWeek,
              startMinutes: s.startMinutes,
              durationMinutes: s.durationMinutes,
              roomId: s.roomId,
              reason: s.reason,
              pinned: s.pinned,
              // Deliberately not carried over: this draft has created nothing.
              appliedEventId: null,
            })),
          });
        }

        return copy;
      });
    }),

  // ─── Applying ─────────────────────────────────────────────────────────────

  /** What applying would do, and what it would run into. Writes nothing. */
  applyPreview: protectedProcedure
    .input(z.object({ id: planId }))
    .query(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx, input.id);
      const [sessions, timeZone] = await Promise.all([
        ctx.db.schedulePlanSession.findMany({ where: { planId: plan.id } }),
        orgTimezone(ctx.db, ctx.orgId),
      ]);

      const preview = await previewApply(
        ctx.db,
        {
          id: plan.id,
          orgId: plan.orgId,
          name: plan.name,
          semesterId: plan.semesterId,
          weekStart: plan.weekStart,
          repeatUntil: plan.repeatUntil,
        },
        sessions,
        timeZone,
      );

      const weeks = plan.repeatUntil
        ? Math.max(
            1,
            Math.round(
              (startOfLocalDay(plan.repeatUntil, timeZone).getTime() -
                startOfLocalDay(plan.weekStart, timeZone).getTime()) /
                (7 * 86_400_000),
            ) + 1,
          )
        : 1;

      return {
        willCreate: preview.candidates.length,
        skipped: preview.skipped.length,
        weeks,
        /** Sessions naming more than one teacher; only the first reaches the class. */
        coTaught: preview.candidates
          .filter((c) => c.coTeacherIds.length > 0)
          .map((c) => c.title),
        blocking: preview.blocking.map((b) => ({
          sessionId: b.sessionId,
          title: b.title,
          messages: b.conflicts.map((c) => c.message),
        })),
        warnings: preview.warnings.map((w) => ({
          sessionId: w.sessionId,
          title: w.title,
          messages: w.conflicts.map((c) => c.message),
        })),
      };
    }),

  /**
   * Writes an approved plan to the live timetable. The one destructive step.
   *
   * Named `applyToTimetable` rather than `apply` because tRPC reserves the
   * function-prototype names — a procedure called `apply` throws at router
   * construction, taking the whole API down with it.
   */
  applyToTimetable: protectedProcedure
    .input(z.object({ id: planId }))
    .mutation(async ({ ctx, input }) => {
      const plan = await loadPlan(ctx, input.id);

      if (
        !ctx.bits.hasAll(
          PermissionFlags.ManageSchedulePlans,
          PermissionFlags.ManageAllEvents,
        )
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Applying a plan schedules real classes, which needs permission to manage the timetable.",
        });
      }
      if (plan.createdById !== ctx.actor.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your plan." });
      }
      if (!isApplicable(plan.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            plan.status === "APPLIED"
              ? "This plan has already been applied."
              : "A plan has to be approved by everyone it was shared with before it can be applied.",
        });
      }

      const [settings, timeZone] = await Promise.all([
        ctx.db.orgSettings.findUniqueOrThrow({ where: { orgId: ctx.orgId } }),
        orgTimezone(ctx.db, ctx.orgId),
      ]);

      return ctx.db.$transaction(
        async (tx) => {
          // Re-read inside the transaction: two people hitting apply at once
          // must not both write the timetable.
          const fresh = await tx.schedulePlan.findUniqueOrThrow({
            where: { id: plan.id },
            select: { status: true },
          });
          if (fresh.status !== PlanStatus.APPROVED) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "This plan is no longer approved — reload and try again.",
            });
          }

          const sessions = await tx.schedulePlanSession.findMany({
            where: { planId: plan.id },
          });

          const result = await applyPlan(tx, {
            plan: {
              id: plan.id,
              orgId: plan.orgId,
              name: plan.name,
              semesterId: plan.semesterId,
              weekStart: plan.weekStart,
              repeatUntil: plan.repeatUntil,
            },
            sessions,
            timeZone,
            actorId: ctx.actor.id,
            blockOnConflict: settings.blockConflicts,
          });

          await tx.schedulePlan.update({
            where: { id: plan.id },
            data: {
              status: PlanStatus.APPLIED,
              appliedAt: new Date(),
              appliedById: ctx.actor.id,
            },
          });

          return result;
        },
        // A term's worth of classes is a lot of series to materialise.
        { timeout: 30_000 },
      );
    }),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function assertGroupInOrg(ctx: Ctx, groupId: string): Promise<void> {
  const count = await ctx.db.group.count({
    where: { id: groupId, orgId: ctx.orgId },
  });
  if (!count) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No such group." });
  }
}

/** Refuses to invite anyone who could not answer once invited. */
async function assertCanApprove(ctx: Ctx, userIds: string[]): Promise<void> {
  const users = await ctx.db.user.findMany({
    // Machine identities are unreachable here for the same reason
    // `reviewerCandidates` never offers one. Filtering rather than checking
    // means an id that names one simply fails to resolve, and the count
    // mismatch below refuses the whole invitation.
    where: {
      id: { in: userIds },
      orgId: ctx.orgId,
      isActive: true,
      isServiceAccount: false,
    },
    select: {
      id: true,
      name: true,
      email: true,
      permissions: true,
      roles: { select: { role: { select: { permissions: true } } } },
    },
  });

  if (users.length !== new Set(userIds).size) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "One of the people chosen is no longer active.",
    });
  }

  const cannot = users.filter((u) => {
    const bits = u.roles.reduce(
      (acc, r) => acc | r.role.permissions,
      u.permissions,
    );
    return !new PermissionBitField(expandPermissions(bits)).has(
      PermissionFlags.ApproveSchedulePlans,
    );
  });

  if (cannot.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${cannot
        .map((u) => personName(u))
        .join(
          ", ",
        )} cannot approve schedule plans, so the plan could never be signed off. Grant them the permission first.`,
    });
  }
}

/** Parses a demand CSV against this org's groups, faculty and rooms. */
async function resolveDemandCsv(ctx: Ctx, plan: LoadedPlan, csv: string) {
  const parsed = Papa.parse<Record<string, string>>(csv.trim(), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `That file could not be read: ${parsed.errors[0]?.message ?? "unknown error"}`,
    });
  }

  const headers = parsed.meta.fields ?? [];
  const mapping = new Map<string, DemandColumn>();
  for (const header of headers) {
    const column = matchDemandColumn(header);
    if (column) mapping.set(header, column);
  }
  const unmatched = headers.filter((h) => !mapping.has(h));

  if (!new Set(mapping.values()).has("group")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `No "group" column found. Expected one of: ${DEMAND_COLUMNS.join(", ")}.`,
    });
  }

  const records = parsed.data.map((row, index) => {
    const values: Partial<Record<DemandColumn, string>> = {};
    for (const [header, column] of mapping) {
      const value = row[header];
      if (value !== undefined) values[column] = value;
    }
    // +2: one for the header row, one because people count from 1.
    return { line: index + 2, values };
  });

  const [groups, faculty, rooms] = await Promise.all([
    ctx.db.group.findMany({
      where: { orgId: ctx.orgId },
      select: { id: true, name: true, label: true },
    }),
    ctx.db.facultyProfile.findMany({
      where: { orgId: ctx.orgId },
      select: {
        id: true,
        shortName: true,
        user: { select: { name: true, email: true } },
      },
    }),
    ctx.db.room.findMany({
      where: { orgId: ctx.orgId, isActive: true },
      select: { id: true, code: true },
    }),
  ]);

  const resolved = resolveDemand({
    records,
    lookup: {
      groups,
      faculty: faculty.map((f) => ({
        id: f.id,
        name: f.user.name,
        shortName: f.shortName,
        email: f.user.email,
      })),
      rooms,
    },
    slotMinutes: plan.slotMinutes,
    workingDayMinutes: plan.dayEndMinutes - plan.dayStartMinutes,
  });

  return { ...resolved, unmatchedHeaders: unmatched };
}
