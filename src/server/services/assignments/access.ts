import { TRPCError } from "@trpc/server";

import { PermissionFlags, type PermissionBitField } from "~/lib/permissions";
import type { Db } from "../occurrences";

/**
 * Who may do what with an assignment. One place, so that the assignment, its
 * paper and its answers all answer the question the same way.
 *
 * - A **manager** may change it and mark it: whoever set it, holding
 *   `ManageOwnAssignments`, or anybody holding `ManageAllAssignments`.
 * - A **student** of its group may read it, and answer it when it is a test
 *   taken in Plannr.
 *
 * Neither role opens a question paper. Only the paper's owner can, with their
 * password, and that check lives with the paper, not here.
 */

/** The parts of a tRPC context the checks need. */
export interface AccessContext {
  db: Db;
  orgId: string;
  actor: { id: string; kind: "user" | "personal" | "service" };
  bits: PermissionBitField;
}

export type AssignmentRole = "manager" | "student";

/** Whether the caller may set assignments at all. */
export const maySetAssignments = (ctx: AccessContext) =>
  ctx.bits.has(PermissionFlags.ManageOwnAssignments);

/** Whether the caller may manage everybody's, not only their own. */
export const managesAll = (ctx: AccessContext) =>
  ctx.bits.has(PermissionFlags.ManageAllAssignments);

/** The caller's student profile, if they are one. */
export async function studentProfileOf(db: Db, userId: string) {
  return db.studentProfile.findUnique({
    where: { userId },
    select: { id: true, memberships: { select: { groupId: true } } },
  });
}

/** The caller's faculty profile, if they teach. */
export async function facultyProfileOf(db: Db, userId: string) {
  return db.facultyProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
}

/**
 * The assignment, for somebody who means to change it. NOT_FOUND for an id
 * that is not in the caller's organisation, FORBIDDEN for one they may see but
 * not change.
 */
export async function assignmentForWrite(ctx: AccessContext, id: string) {
  const assignment = await ctx.db.assignment.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!assignment) throw new TRPCError({ code: "NOT_FOUND" });
  const mine =
    assignment.createdById === ctx.actor.id && maySetAssignments(ctx);
  if (!mine && !managesAll(ctx)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the teacher who set this can change it.",
    });
  }
  return assignment;
}

/**
 * The assignment, for somebody who means to read it, with the capacity they
 * read it in. A manager reads it as one even if they are also in the group.
 */
export async function assignmentForRead(ctx: AccessContext, id: string) {
  const assignment = await ctx.db.assignment.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!assignment) throw new TRPCError({ code: "NOT_FOUND" });

  const mine =
    assignment.createdById === ctx.actor.id && maySetAssignments(ctx);
  if (mine || managesAll(ctx)) {
    return { assignment, role: "manager" as AssignmentRole, studentId: null };
  }

  const student = await studentProfileOf(ctx.db, ctx.actor.id);
  if (student?.memberships.some((m) => m.groupId === assignment.groupId)) {
    return {
      assignment,
      role: "student" as AssignmentRole,
      studentId: student.id,
    };
  }
  // Indistinguishable from an id that does not exist, as elsewhere in the API.
  throw new TRPCError({ code: "NOT_FOUND" });
}
