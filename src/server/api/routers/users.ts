import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  ACT_ON_DENIAL_MESSAGE,
  canActOn,
  expandPermissions,
  PermissionFlags,
  wouldLockSelfOut,
} from "~/lib/permissions";
import type { PermissionBitField } from "~/lib/permissions";
import {
  createTRPCRouter,
  permissionProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import type { Db } from "~/server/services/occurrences";

/**
 * People management.
 *
 * Every mutation here runs through `canActOn`, which enforces the two rules
 * carried over from the previous app: you cannot act on yourself, and you
 * cannot act on anyone holding a permission you lack.
 */

const PRN_REGEX = /^\d{11}$/;

/**
 * Role ids are not cuids: the migration mints them deterministically as
 * `<orgId>-role-<key>` so the built-in roles are stable across installs.
 * Treat them as opaque — the real check is the org-scoped lookup.
 */
const roleId = z.string().min(1).max(80);

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  isActive: boolean;
  permissions: bigint;
  createdAt: Date;
  roles: Array<{
    role: { id: string; name: string; key: string | null; permissions: bigint };
  }>;
  studentProfile: { prn: string } | null;
  facultyProfile: {
    shortName: string | null;
    department: string | null;
  } | null;
  _count: { accounts: number };
}

const serialise = (u: UserRow) => {
  const rolePermissions = u.roles.reduce(
    (bits, r) => bits | r.role.permissions,
    u.permissions,
  );
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    createdAt: u.createdAt,
    roles: u.roles.map((r) => ({
      id: r.role.id,
      name: r.role.name,
      key: r.role.key,
    })),
    extraPermissions: u.permissions.toString(),
    effectivePermissions: expandPermissions(rolePermissions).toString(),
    prn: u.studentProfile?.prn ?? null,
    department: u.facultyProfile?.department ?? null,
    shortName: u.facultyProfile?.shortName ?? null,
    /** No linked OAuth account means they were imported but never signed in. */
    hasSignedIn: u._count.accounts > 0,
  };
};

const userInclude = {
  roles: {
    include: {
      role: { select: { id: true, name: true, key: true, permissions: true } },
    },
  },
  studentProfile: { select: { prn: true } },
  facultyProfile: { select: { shortName: true, department: true } },
  _count: { select: { accounts: true } },
} as const;

/** Loads the permission bits a target user holds, for the privilege comparison. */
async function loadTarget(db: Db, orgId: string, userId: string) {
  const user = await db.user.findFirst({
    where: { id: userId, orgId },
    include: {
      roles: { include: { role: { select: { permissions: true } } } },
    },
  });
  if (!user)
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });

  const permissions = user.roles.reduce(
    (bits, r) => bits | r.role.permissions,
    user.permissions,
  );
  return { user, permissions };
}

function assertMayActOn(
  actor: { id: string; permissions: bigint },
  target: { id: string; permissions: bigint },
) {
  const denial = canActOn(actor, target);
  if (denial) {
    throw new TRPCError({
      code: denial === "SELF" ? "BAD_REQUEST" : "FORBIDDEN",
      message: ACT_ON_DENIAL_MESSAGE[denial],
    });
  }
}

export const usersRouter = createTRPCRouter({
  /** The signed-in user's own profile and what they can do. */
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.actor.id },
      include: userInclude,
    });
    return serialise(user);
  }),

  list: permissionProcedure(PermissionFlags.ViewUsers)
    .input(
      z
        .object({
          query: z.string().trim().max(120).optional(),
          roleId: roleId.optional(),
          status: z
            .enum(["all", "active", "inactive", "never-signed-in"])
            .default("all"),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(5).max(200).default(25),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const where = buildWhere(ctx.orgId, input);
      const [rows, total] = await Promise.all([
        ctx.db.user.findMany({
          where,
          include: userInclude,
          orderBy: [{ name: "asc" }, { email: "asc" }],
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        ctx.db.user.count({ where }),
      ]);
      return {
        rows: rows.map(serialise),
        total,
        page: input.page,
        pageSize: input.pageSize,
        pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
      };
    }),

  /**
   * Result count without fetching the rows — powers the "N matches" hint that
   * appears while typing, before a search is applied.
   */
  count: permissionProcedure(PermissionFlags.ViewUsers)
    .input(
      z
        .object({
          query: z.string().trim().max(120).optional(),
          roleId: roleId.optional(),
          status: z
            .enum(["all", "active", "inactive", "never-signed-in"])
            .default("all"),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) =>
      ctx.db.user.count({ where: buildWhere(ctx.orgId, input) }),
    ),

  byId: permissionProcedure(PermissionFlags.ViewUsers)
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        include: userInclude,
      });
      return user ? serialise(user) : null;
    }),

  create: permissionProcedure(PermissionFlags.ManageUsers)
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().toLowerCase(),
        roleIds: z.array(roleId).min(1),
        prn: z.string().trim().regex(PRN_REGEX).optional(),
        department: z.string().trim().max(120).optional(),
        shortName: z.string().trim().max(60).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `${input.email} is already on the system.`,
        });
      }

      const roles = await assertAssignableRoles(ctx, input.roleIds);
      const isFaculty = roles.some((r) => r.key === "faculty");

      const user = await ctx.db.user.create({
        data: {
          orgId: ctx.orgId,
          name: input.name,
          email: input.email,
          roles: {
            create: roles.map((r) => ({
              roleId: r.id,
              assignedById: ctx.actor.id,
            })),
          },
          ...(input.prn
            ? {
                studentProfile: {
                  create: { orgId: ctx.orgId, prn: input.prn },
                },
              }
            : {}),
          ...(isFaculty
            ? {
                facultyProfile: {
                  create: {
                    orgId: ctx.orgId,
                    shortName: input.shortName ?? input.name,
                    department: input.department,
                  },
                },
              }
            : {}),
        },
        include: userInclude,
      });
      return serialise(user);
    }),

  update: permissionProcedure(PermissionFlags.ManageUsers)
    .input(
      z.object({
        id: z.string().cuid(),
        name: z.string().trim().min(1).max(120).optional(),
        isActive: z.boolean().optional(),
        prn: z.string().trim().regex(PRN_REGEX).nullish(),
        department: z.string().trim().max(120).nullish(),
        shortName: z.string().trim().max(60).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const target = await loadTarget(ctx.db, ctx.orgId, input.id);
      // Editing your own name is fine; anything else about yourself is not.
      const selfEditingName =
        target.user.id === ctx.actor.id &&
        input.isActive === undefined &&
        input.prn === undefined;
      if (!selfEditingName) {
        assertMayActOn(
          { id: ctx.actor.id, permissions: ctx.actor.permissions },
          { id: target.user.id, permissions: target.permissions },
        );
      }

      const updated = await ctx.db.user.update({
        where: { id: input.id },
        data: {
          name: input.name,
          isActive: input.isActive,
          ...(input.prn !== undefined && input.prn !== null
            ? {
                studentProfile: {
                  upsert: {
                    create: { orgId: ctx.orgId, prn: input.prn },
                    update: { prn: input.prn },
                  },
                },
              }
            : {}),
          ...(input.department !== undefined || input.shortName !== undefined
            ? {
                facultyProfile: {
                  upsert: {
                    create: {
                      orgId: ctx.orgId,
                      department: input.department ?? null,
                      shortName: input.shortName ?? null,
                    },
                    update: {
                      department: input.department ?? undefined,
                      shortName: input.shortName ?? undefined,
                    },
                  },
                },
              }
            : {}),
        },
        include: userInclude,
      });
      return serialise(updated);
    }),

  /** Replaces the whole set of roles a person holds. */
  setRoles: permissionProcedure(PermissionFlags.ManageUsers)
    .input(z.object({ id: z.string().cuid(), roleIds: z.array(roleId) }))
    .mutation(async ({ ctx, input }) => {
      const target = await loadTarget(ctx.db, ctx.orgId, input.id);
      assertMayActOn(
        { id: ctx.actor.id, permissions: ctx.actor.permissions },
        { id: target.user.id, permissions: target.permissions },
      );

      const roles = await assertAssignableRoles(ctx, input.roleIds);

      await ctx.db.$transaction([
        ctx.db.userRole.deleteMany({ where: { userId: input.id } }),
        ctx.db.userRole.createMany({
          data: roles.map((r) => ({
            userId: input.id,
            roleId: r.id,
            assignedById: ctx.actor.id,
          })),
        }),
      ]);

      const updated = await ctx.db.user.findUniqueOrThrow({
        where: { id: input.id },
        include: userInclude,
      });
      return serialise(updated);
    }),

  /** Per-user permission grants, on top of whatever their roles carry. */
  setExtraPermissions: permissionProcedure(PermissionFlags.ManageRoles)
    .input(
      z.object({
        id: z.string().cuid(),
        permissions: z
          .string()
          .regex(/^\d+$/)
          .transform((v) => BigInt(v)),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const target = await loadTarget(ctx.db, ctx.orgId, input.id);
      assertMayActOn(
        { id: ctx.actor.id, permissions: ctx.actor.permissions },
        { id: target.user.id, permissions: target.permissions },
      );

      const missing =
        expandPermissions(input.permissions) & ~ctx.bits.effective;
      if (missing !== 0n && !ctx.bits.has(PermissionFlags.Administrator)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot grant permissions you do not hold yourself.",
        });
      }

      if (wouldLockSelfOut(ctx.actor.id, input.id, input.permissions)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That change would remove your own ability to manage roles.",
        });
      }

      const updated = await ctx.db.user.update({
        where: { id: input.id },
        data: { permissions: input.permissions },
        include: userInclude,
      });
      return serialise(updated);
    }),

  delete: permissionProcedure(PermissionFlags.ManageUsers)
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const target = await loadTarget(ctx.db, ctx.orgId, input.id);
      assertMayActOn(
        { id: ctx.actor.id, permissions: ctx.actor.permissions },
        { id: target.user.id, permissions: target.permissions },
      );

      await ctx.db.user.delete({ where: { id: input.id } });
      return { deleted: true };
    }),

  /**
   * Bulk delete skips what it may not touch rather than failing outright, and
   * reports why — otherwise one protected row blocks the whole selection.
   */
  bulkDelete: permissionProcedure(PermissionFlags.ManageUsers)
    .input(z.object({ ids: z.array(z.string().cuid()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const targets = await ctx.db.user.findMany({
        where: { id: { in: input.ids }, orgId: ctx.orgId },
        include: {
          roles: { include: { role: { select: { permissions: true } } } },
        },
      });

      const deletable: string[] = [];
      const skipped: Array<{ id: string; email: string; reason: string }> = [];

      for (const target of targets) {
        const permissions = target.roles.reduce(
          (bits, r) => bits | r.role.permissions,
          target.permissions,
        );
        const denial = canActOn(
          { id: ctx.actor.id, permissions: ctx.actor.permissions },
          { id: target.id, permissions },
        );
        if (denial) {
          skipped.push({
            id: target.id,
            email: target.email,
            reason: ACT_ON_DENIAL_MESSAGE[denial],
          });
        } else {
          deletable.push(target.id);
        }
      }

      if (deletable.length) {
        await ctx.db.user.deleteMany({ where: { id: { in: deletable } } });
      }
      return { deleted: deletable.length, skipped };
    }),

  /**
   * Resolves pasted emails or PRNs to people, for the bulk-add flows. Reports
   * what it could not find rather than silently dropping it.
   */
  resolveIdentifiers: permissionProcedure(PermissionFlags.ViewUsers)
    .input(
      z.object({ identifiers: z.array(z.string().trim()).min(1).max(2000) }),
    )
    .query(async ({ ctx, input }) => {
      const cleaned = [...new Set(input.identifiers.filter(Boolean))];
      const emails = cleaned
        .filter((v) => v.includes("@"))
        .map((v) => v.toLowerCase());
      const prns = cleaned.filter((v) => !v.includes("@"));

      const found = await ctx.db.user.findMany({
        where: {
          orgId: ctx.orgId,
          OR: [
            { email: { in: emails } },
            { studentProfile: { prn: { in: prns } } },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          studentProfile: { select: { prn: true } },
        },
      });

      const matchedKeys = new Set<string>();
      for (const u of found) {
        matchedKeys.add(u.email.toLowerCase());
        if (u.studentProfile) matchedKeys.add(u.studentProfile.prn);
      }
      const unmatched = cleaned.filter(
        (v) => !matchedKeys.has(v.includes("@") ? v.toLowerCase() : v),
      );

      return {
        matched: found.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          prn: u.studentProfile?.prn ?? null,
        })),
        unmatched,
      };
    }),
});

function buildWhere(
  orgId: string,
  input: {
    query?: string;
    roleId?: string;
    status?: "all" | "active" | "inactive" | "never-signed-in";
  },
) {
  const q = input.query;
  return {
    orgId,
    ...(input.roleId ? { roles: { some: { roleId: input.roleId } } } : {}),
    ...(input.status === "active" ? { isActive: true } : {}),
    ...(input.status === "inactive" ? { isActive: false } : {}),
    ...(input.status === "never-signed-in" ? { accounts: { none: {} } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { studentProfile: { prn: { contains: q } } },
          ],
        }
      : {}),
  };
}

/** Roles must belong to this org, and you may not hand out powers you lack. */
async function assertAssignableRoles(
  ctx: { db: Db; orgId: string; bits: PermissionBitField },
  roleIds: string[],
) {
  if (roleIds.length === 0) return [];

  const roles = await ctx.db.role.findMany({
    where: { id: { in: roleIds }, orgId: ctx.orgId },
  });
  if (roles.length !== new Set(roleIds).size) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown role." });
  }

  if (!ctx.bits.has(PermissionFlags.Administrator)) {
    const granting = roles.reduce((bits, r) => bits | r.permissions, 0n);
    if ((expandPermissions(granting) & ~ctx.bits.effective) !== 0n) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You cannot assign a role with permissions you do not hold.",
      });
    }
  }
  return roles;
}
