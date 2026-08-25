import { beforeEach, describe, expect, it } from "vitest";

import {
  PermissionBitField,
  PermissionFlags,
  SYSTEM_ROLES,
} from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";
import { RoomFeature, RoomType } from "../../../../generated/prisma";

/**
 * The schedule builder's whole life, against a real database: demand in, a week
 * out, shared for sign-off, approved, and written to the timetable.
 *
 * The rules worth protecting here are the ones a unit test cannot reach —
 * a draft being invisible to everyone but its author, an approval not
 * surviving a revision, and applying being refused until every reviewer has
 * answered. Those are the promises the feature makes.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`).
 */

const TZ = "Asia/Kolkata";
const createCaller = createCallerFactory(appRouter);

interface Actor {
  id: string;
  orgId: string;
  roles: Array<{ id: string; name: string; key: string | null }>;
  permissions: bigint;
}

function callerFor(actor: Actor) {
  return createCaller({
    db,
    headers: new Headers(),
    session: {
      expires: new Date(Date.now() + 3_600_000).toISOString(),
      user: {
        id: actor.id,
        orgId: actor.orgId,
        roles: actor.roles,
        permissions: actor.permissions.toString(),
        isActive: true,
        // A cookie session is always a person; the fixture says so explicitly
        // so that a machine identity can never sneak in through a caller.
        isServiceAccount: false,
      },
    },
    actor,
    bits: new PermissionBitField(actor.permissions),
    orgId: actor.orgId,
  } as Parameters<typeof createCaller>[0]);
}

let orgId: string;
let planner: Actor;
let reviewer: Actor;
let outsider: Actor;
let groupA: string;
let groupB: string;
let facultyId: string;
let labRoomId: string;

/** Creates a user with the named system roles plus any extra personal grants. */
async function makeActor(
  email: string,
  name: string,
  roleKeys: string[],
  extraPermissions = 0n,
): Promise<Actor> {
  const user = await db.user.upsert({
    where: { email },
    update: { name, permissions: extraPermissions },
    create: { email, name, orgId, permissions: extraPermissions },
  });
  const roles = await db.role.findMany({
    where: { orgId, key: { in: roleKeys } },
  });
  await db.userRole.deleteMany({ where: { userId: user.id } });
  if (roles.length) {
    await db.userRole.createMany({
      data: roles.map((r) => ({ userId: user.id, roleId: r.id })),
    });
  }
  return {
    id: user.id,
    orgId,
    roles: roles.map(({ id, name: n, key }) => ({ id, name: n, key })),
    permissions: roles.reduce(
      (bits, r) => bits | r.permissions,
      extraPermissions,
    ),
  };
}

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: "plan-itest" },
    update: {},
    create: { slug: "plan-itest", name: "Plan Integration Org", timezone: TZ },
  });
  orgId = org.id;
  await db.orgSettings.upsert({
    where: { orgId },
    update: {
      blockConflicts: true,
      slotMinutes: 60,
      dayStartMinutes: 9 * 60,
      dayEndMinutes: 17 * 60,
      workingDays: [1, 2, 3, 4, 5],
    },
    create: {
      orgId,
      blockConflicts: true,
      slotMinutes: 60,
      dayStartMinutes: 9 * 60,
      dayEndMinutes: 17 * 60,
      workingDays: [1, 2, 3, 4, 5],
    },
  });

  await db.schedulePlan.deleteMany({ where: { orgId } });
  await db.event.deleteMany({ where: { orgId } });

  for (const role of SYSTEM_ROLES) {
    await db.role.upsert({
      where: { orgId_key: { orgId, key: role.key } },
      update: { permissions: role.permissions },
      create: {
        orgId,
        key: role.key,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isSystem: true,
      },
    });
  }

  const building = await db.building.upsert({
    where: { orgId_name: { orgId, name: "Plan Block" } },
    update: {},
    create: { orgId, name: "Plan Block" },
  });

  const mkRoom = async (
    code: string,
    capacity: number,
    type: RoomType,
    features: RoomFeature[] = [],
  ) =>
    (
      await db.room.upsert({
        where: { orgId_code: { orgId, code } },
        update: { capacity, type, features, isActive: true },
        create: {
          orgId,
          code,
          buildingId: building.id,
          floor: 1,
          capacity,
          type,
          features,
        },
      })
    ).id;

  await mkRoom("PL-1", 60, RoomType.LECTURE, [RoomFeature.PROJECTOR]);
  await mkRoom("PL-2", 40, RoomType.LECTURE);
  labRoomId = await mkRoom("PL-LAB", 30, RoomType.LAB, [RoomFeature.COMPUTERS]);

  // An admin holds every permission, so the planner is given exactly the
  // coordinator's — which is the role that is actually meant to build these.
  planner = await makeActor(
    "plan-itest-planner@plannr-demo.invalid",
    "Plan Coordinator",
    ["coordinator"],
  );
  // Approval is not in any system role by design; it is granted to whoever the
  // institution nominates.
  reviewer = await makeActor(
    "plan-itest-reviewer@plannr-demo.invalid",
    "Head of Department",
    ["faculty"],
    PermissionFlags.ApproveSchedulePlans,
  );
  outsider = await makeActor(
    "plan-itest-outsider@plannr-demo.invalid",
    "Another Coordinator",
    ["coordinator"],
  );

  const teacher = await makeActor(
    "plan-itest-teacher@plannr-demo.invalid",
    "Plan Teacher",
    ["faculty"],
  );
  facultyId = (
    await db.facultyProfile.upsert({
      where: { userId: teacher.id },
      update: { shortName: "Dr. Plan" },
      create: { userId: teacher.id, orgId, shortName: "Dr. Plan" },
    })
  ).id;

  const course = await db.programme.upsert({
    where: { orgId_code: { orgId, code: "PLAN-BCA" } },
    update: {},
    create: { orgId, code: "PLAN-BCA", name: "Plan Test Course" },
  });

  // Not an upsert: the group's natural key includes a nullable `semesterId`, and
  // Prisma will not match a compound unique through a null.
  const mkGroup = async (name: string) => {
    const existing = await db.group.findFirst({
      where: { orgId, programmeId: course.id, name },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await db.group.create({
      data: { orgId, programmeId: course.id, name, label: `${name} · Plan` },
      select: { id: true },
    });
    return created.id;
  };

  groupA = await mkGroup("PLAN-A");
  groupB = await mkGroup("PLAN-B");
});

/** Adds a line of demand with sensible defaults. */
const demand = (
  groupId: string,
  subject: string,
  over: Partial<{
    sessionsPerWeek: number;
    durationMinutes: number;
    facultyIds: string[];
    requiredFeatures: RoomFeature[];
    roomType: RoomType;
  }> = {},
) => ({
  groupId,
  subject,
  sessionsPerWeek: over.sessionsPerWeek ?? 2,
  durationMinutes: over.durationMinutes ?? 60,
  facultyIds: over.facultyIds ?? [],
  requiredFeatures: (over.requiredFeatures ?? []) as never,
  roomType: (over.roomType ?? null) as never,
  minCapacity: null,
  preferredRoomId: null,
  notes: null,
});

/** A plan with demand, generated and ready to share. */
async function seedGeneratedPlan(name = "Test plan") {
  const api = callerFor(planner);
  const plan = await api.plans.create({ name });
  await api.plans.addRequirement({
    planId: plan.id,
    requirement: demand(groupA, "Data Structures", {
      sessionsPerWeek: 3,
      facultyIds: [facultyId],
    }),
  });
  await api.plans.addRequirement({
    planId: plan.id,
    requirement: demand(groupB, "Databases", { sessionsPerWeek: 2 }),
  });
  const result = await api.plans.generate({ id: plan.id });
  return { api, planId: plan.id, result };
}

describe("schedule plans", () => {
  it("lays a week out from the demand it is given", async () => {
    const { api, planId, result } = await seedGeneratedPlan();

    expect(result.placed).toBe(5);
    expect(result.unplaced).toBe(0);

    const plan = await api.plans.byId({ id: planId });
    expect(plan.sessions).toHaveLength(5);
    expect(plan.sessions.every((s) => s.roomId !== null)).toBe(true);
    expect(
      plan.sessions.filter((s) => s.title === "Data Structures"),
    ).toHaveLength(3);
  });

  it("writes nothing to the live timetable while it is a plan", async () => {
    const { planId } = await seedGeneratedPlan();
    const events = await db.event.count({ where: { orgId } });
    expect(events).toBe(0);
    expect(await db.schedulePlanSession.count({ where: { planId } })).toBe(5);
  });

  it("keeps a draft invisible to everyone but its author", async () => {
    const { planId } = await seedGeneratedPlan();

    await expect(
      callerFor(outsider).plans.byId({ id: planId }),
    ).rejects.toThrow(/No such plan/);

    const theirList = await callerFor(outsider).plans.list();
    expect(theirList.rows.some((p) => p.id === planId)).toBe(false);
  });

  it("shows a shared plan to anyone with planner access", async () => {
    const { api, planId } = await seedGeneratedPlan();
    await api.plans.share({ id: planId, reviewerIds: [reviewer.id] });

    const seen = await callerFor(outsider).plans.byId({ id: planId });
    expect(seen.name).toBe("Test plan");
    // Seeing it is not editing it.
    expect(seen.can.edit).toBe(false);
    expect(seen.can.review).toBe(false);
  });

  it("refuses to invite a reviewer who could not approve", async () => {
    const { api, planId } = await seedGeneratedPlan();
    await expect(
      api.plans.share({ id: planId, reviewerIds: [outsider.id] }),
    ).rejects.toThrow(/cannot approve schedule plans/i);
  });

  /**
   * A key can hold `ApproveSchedulePlans` in its scopes and call the mutation
   * perfectly well. What it cannot be is *nominated*: a plan waiting on a
   * reviewer that will never open a screen would sit unapproved forever, so the
   * picker does not offer one and sharing will not accept one by id.
   */
  it("never offers an API key's machine identity as a reviewer", async () => {
    const principal = await db.user.upsert({
      where: { email: "plan-itest-key@plannr-service.invalid" },
      update: {
        name: "Planner Key",
        isServiceAccount: true,
        permissions: PermissionFlags.ApproveSchedulePlans,
      },
      create: {
        orgId,
        email: "plan-itest-key@plannr-service.invalid",
        name: "Planner Key",
        isServiceAccount: true,
        permissions: PermissionFlags.ApproveSchedulePlans,
      },
    });

    // It holds the very bit the picker filters on, so only `isServiceAccount`
    // can be what keeps it out.
    const candidates = await callerFor(planner).plans.reviewerCandidates({});
    expect(candidates.map((c) => c.id)).toContain(reviewer.id);
    expect(candidates.map((c) => c.id)).not.toContain(principal.id);

    const { api, planId } = await seedGeneratedPlan("Key reviewer");
    await expect(
      api.plans.share({ id: planId, reviewerIds: [principal.id] }),
    ).rejects.toThrow();
    expect(await db.schedulePlanReviewer.count({ where: { planId } })).toBe(0);
  });

  it("will not share a plan with nothing in it to review", async () => {
    const api = callerFor(planner);
    const plan = await api.plans.create({ name: "Empty" });
    await expect(
      api.plans.share({ id: plan.id, reviewerIds: [reviewer.id] }),
    ).rejects.toThrow(/Generate the timetable/i);
  });

  it("locks the demand once a plan is out for review", async () => {
    const { api, planId } = await seedGeneratedPlan();
    await api.plans.share({ id: planId, reviewerIds: [reviewer.id] });

    await expect(
      api.plans.addRequirement({
        planId,
        requirement: demand(groupA, "Sneaked in"),
      }),
    ).rejects.toThrow(/out for review/i);
  });

  it("reaches approved only when every reviewer has approved", async () => {
    const { api, planId } = await seedGeneratedPlan();
    const second = await makeActor(
      "plan-itest-reviewer2@plannr-demo.invalid",
      "Second Reviewer",
      ["faculty"],
      PermissionFlags.ApproveSchedulePlans,
    );
    await api.plans.share({
      id: planId,
      reviewerIds: [reviewer.id, second.id],
    });

    const first = await callerFor(reviewer).plans.review({
      id: planId,
      decision: "APPROVED",
    });
    expect(first.status).toBe("IN_REVIEW");

    const done = await callerFor(second).plans.review({
      id: planId,
      decision: "APPROVED",
    });
    expect(done.status).toBe("APPROVED");
  });

  it("sends the plan back when one reviewer asks for changes", async () => {
    const { api, planId } = await seedGeneratedPlan();
    await api.plans.share({ id: planId, reviewerIds: [reviewer.id] });

    const answer = await callerFor(reviewer).plans.review({
      id: planId,
      decision: "CHANGES_REQUESTED",
      note: "Thursday afternoon is the placement drive.",
    });
    expect(answer.status).toBe("CHANGES_REQUESTED");

    // The note is kept as feedback, not just as a decision.
    const plan = await api.plans.byId({ id: planId });
    expect(plan.comments.some((c) => c.body.includes("placement drive"))).toBe(
      true,
    );
  });

  it("refuses a review from someone it was not shared with", async () => {
    const { api, planId } = await seedGeneratedPlan();
    const bystander = await makeActor(
      "plan-itest-bystander@plannr-demo.invalid",
      "Bystander",
      ["faculty"],
      PermissionFlags.ApproveSchedulePlans,
    );
    await api.plans.share({ id: planId, reviewerIds: [reviewer.id] });

    await expect(
      callerFor(bystander).plans.review({ id: planId, decision: "APPROVED" }),
    ).rejects.toThrow(/not shared with you/i);
  });

  it("will not apply a plan that has not been approved", async () => {
    const { api, planId } = await seedGeneratedPlan();
    await expect(api.plans.applyToTimetable({ id: planId })).rejects.toThrow(
      /approved by everyone/i,
    );

    await api.plans.share({ id: planId, reviewerIds: [reviewer.id] });
    await expect(api.plans.applyToTimetable({ id: planId })).rejects.toThrow(
      /approved by everyone/i,
    );
  });

  it("writes an approved plan to the timetable as recurring classes", async () => {
    const { api, planId } = await seedGeneratedPlan();
    await api.plans.share({ id: planId, reviewerIds: [reviewer.id] });
    await callerFor(reviewer).plans.review({
      id: planId,
      decision: "APPROVED",
    });

    const result = await api.plans.applyToTimetable({ id: planId });
    expect(result.created).toBe(5);

    const events = await db.event.findMany({
      where: { orgId },
      include: { occurrences: true },
    });
    expect(events).toHaveLength(5);
    expect(events.every((e) => e.kind === "CLASS")).toBe(true);
    expect(events.every((e) => e.rrule?.includes("FREQ=WEEKLY"))).toBe(true);
    // Occurrences are materialised in the same transaction as the event.
    expect(events.every((e) => e.occurrences.length > 0)).toBe(true);

    const after = await api.plans.byId({ id: planId });
    expect(after.status).toBe("APPLIED");
    expect(after.sessions.every((s) => s.appliedEventId !== null)).toBe(true);
  });

  it("refuses to apply the same plan twice", async () => {
    const { api, planId } = await seedGeneratedPlan();
    await api.plans.share({ id: planId, reviewerIds: [reviewer.id] });
    await callerFor(reviewer).plans.review({
      id: planId,
      decision: "APPROVED",
    });
    await api.plans.applyToTimetable({ id: planId });

    await expect(api.plans.applyToTimetable({ id: planId })).rejects.toThrow(
      /already been applied/i,
    );
    expect(await db.event.count({ where: { orgId } })).toBe(5);
  });

  it("schedules around what is already on the timetable", async () => {
    const first = await seedGeneratedPlan("First plan");
    await first.api.plans.share({
      id: first.planId,
      reviewerIds: [reviewer.id],
    });
    await callerFor(reviewer).plans.review({
      id: first.planId,
      decision: "APPROVED",
    });
    await first.api.plans.applyToTimetable({ id: first.planId });

    // A second plan for the same groups must not propose the slots the first
    // one just took.
    const second = await seedGeneratedPlan("Second plan");
    expect(second.result.unplaced).toBe(0);

    const preview = await second.api.plans.applyPreview({ id: second.planId });
    expect(preview.blocking).toHaveLength(0);
  });

  it("gives a revision its own feedback and approvals", async () => {
    const { api, planId } = await seedGeneratedPlan();
    await api.plans.share({ id: planId, reviewerIds: [reviewer.id] });
    await callerFor(reviewer).plans.review({
      id: planId,
      decision: "CHANGES_REQUESTED",
      note: "Move the lab.",
    });

    const copy = await api.plans.revise({ id: planId });
    const revision = await api.plans.byId({ id: copy.id });

    expect(revision.status).toBe("DRAFT");
    expect(revision.version).toBe(2);
    // The work carries over…
    expect(revision.requirements).toHaveLength(2);
    expect(revision.sessions).toHaveLength(5);
    // …the judgement of it does not.
    expect(revision.comments).toHaveLength(0);
    expect(revision.reviewers).toHaveLength(0);
    expect(revision.sessions.every((s) => s.appliedEventId === null)).toBe(
      true,
    );

    const history = await api.plans.history({ id: copy.id });
    expect(history.map((h) => h.version)).toEqual([1, 2]);

    // Revising the same draft again would fork the chain; it is refused with
    // an explanation rather than a unique-constraint error.
    await expect(api.plans.revise({ id: planId })).rejects.toThrow(
      /already been revised into version 2/i,
    );
  });

  it("keeps a hand-placed session where it was put", async () => {
    const { api, planId } = await seedGeneratedPlan();
    const before = await api.plans.byId({ id: planId });
    const session = before.sessions[0]!;

    await api.plans.moveSession({
      id: session.id,
      dayOfWeek: 5,
      startMinutes: 15 * 60,
      roomId: labRoomId,
    });

    await api.plans.generate({ id: planId });

    const after = await api.plans.byId({ id: planId });
    const moved = after.sessions.find((s) => s.id === session.id)!;
    expect(moved.dayOfWeek).toBe(5);
    expect(moved.startMinutes).toBe(15 * 60);
    expect(moved.pinned).toBe(true);
    // Regenerating still produces the full weekly count, pins included.
    expect(after.sessions).toHaveLength(5);
  });

  it("refuses a hand move onto a slot the group is already in", async () => {
    const { api, planId } = await seedGeneratedPlan();
    const plan = await api.plans.byId({ id: planId });
    const [a, b] = plan.sessions.filter((s) => s.groupId === groupA);

    await expect(
      api.plans.moveSession({
        id: a!.id,
        dayOfWeek: b!.dayOfWeek!,
        startMinutes: b!.startMinutes!,
        roomId: labRoomId,
      }),
    ).rejects.toThrow(/already in/i);
  });

  it("imports demand from a CSV, resolving names as it goes", async () => {
    const api = callerFor(planner);
    const plan = await api.plans.create({ name: "Imported" });

    const csv = [
      "group,subject,lectures per week,duration,taught by,requirements",
      `PLAN-A,Operating Systems,3,60,Dr. Plan,projector`,
      `PLAN-B,OS Lab,2,2h,Dr. Plan,computers`,
    ].join("\n");

    const preview = await api.plans.importPreview({ planId: plan.id, csv });
    expect(preview.summary).toEqual({ ready: 2, error: 0, sessions: 5 });

    await api.plans.importCommit({ planId: plan.id, csv });
    const full = await api.plans.byId({ id: plan.id });

    expect(full.requirements).toHaveLength(2);
    expect(full.requirements[0]!.facultyNames).toEqual(["Dr. Plan"]);
    const lab = full.requirements.find((r) => r.subject === "OS Lab")!;
    expect(lab.durationMinutes).toBe(120);
    expect(lab.requiredFeatures).toEqual(["COMPUTERS"]);
  });

  it("refuses to import a file with unresolved lines", async () => {
    const api = callerFor(planner);
    const plan = await api.plans.create({ name: "Bad import" });
    const csv = "group,subject\nNO-SUCH-GROUP,Ghost Studies";

    await expect(
      api.plans.importCommit({ planId: plan.id, csv }),
    ).rejects.toThrow(/still have errors/i);
    expect(
      await db.schedulePlanRequirement.count({ where: { planId: plan.id } }),
    ).toBe(0);
  });

  it("reports what cannot be fitted rather than dropping it", async () => {
    const api = callerFor(planner);
    const plan = await api.plans.create({ name: "Too much" });
    // A five-day week of eight hours is 40 hourly slots, and a group can only
    // be in one place at a time — so 80 lectures for one group is 40 too many
    // however many rooms there are.
    for (const subject of ["Everything", "Everything else"]) {
      await api.plans.addRequirement({
        planId: plan.id,
        requirement: demand(groupA, subject, { sessionsPerWeek: 40 }),
      });
    }

    const result = await api.plans.generate({ id: plan.id });
    expect(result.placed).toBe(40);
    expect(result.unplaced).toBe(40);

    const full = await api.plans.byId({ id: plan.id });
    const stuck = full.sessions.filter((s) => s.dayOfWeek === null);
    expect(stuck).toHaveLength(40);
    // Every one of them says why, rather than just vanishing from the grid.
    expect(stuck.every((s) => (s.reason?.length ?? 0) > 0)).toBe(true);
  });

  it("lets a reviewer comment on one proposed session", async () => {
    const { api, planId } = await seedGeneratedPlan();
    await api.plans.share({ id: planId, reviewerIds: [reviewer.id] });
    const plan = await api.plans.byId({ id: planId });
    const session = plan.sessions[0]!;

    await callerFor(reviewer).plans.comment({
      planId,
      sessionId: session.id,
      body: "This room is on the far side of campus.",
    });

    const after = await api.plans.byId({ id: planId });
    expect(after.comments[0]!.sessionId).toBe(session.id);
    expect(after.sessions.find((s) => s.id === session.id)!.commentCount).toBe(
      1,
    );
  });
});
