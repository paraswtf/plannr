import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  expandPermissions,
  impliedPermissions,
  PermissionFlags,
  PERMISSION_CATALOG,
  wouldLockSelfOut,
} from "~/lib/permissions";
import type { PermissionBitField } from "~/lib/permissions";
import { pageArgs, pageInput, toPage } from "~/server/api/pagination";
import {
  createTRPCRouter,
  permissionProcedure,
  protectedProcedure,
} from "~/server/api/trpc";

/**
 * Roles and their permissions.
 *
 * The four seeded roles are locked: their name and permissions are fixed, and
 * they cannot be deleted. Everything bespoke goes in a custom role, so the
 * meaning of "faculty" is the same in every install.
 */

/**
 * Role ids are not cuids: the migration mints them deterministically as
 * `<orgId>-role-<key>` so the built-in roles are stable across installs.
 * Treat them as opaque — the real check is the org-scoped lookup.
 */
const roleId = z.string().min(1).max(80);

/** Permissions arrive as decimal strings, since JSON has no BigInt. */
const permissionsInput = z
  .string()
  .regex(/^\d+$/, "Permissions must be a bitfield")
  .transform((v) => BigInt(v));

const serialise = (role: {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  permissions: bigint;
  isSystem: boolean;
  _count?: { users: number };
}) => ({
  id: role.id,
  key: role.key,
  name: role.name,
  description: role.description,
  /** As granted. */
  permissions: role.permissions.toString(),
  /** Including everything implied — what the role can actually do. */
  effectivePermissions: expandPermissions(role.permissions).toString(),
  /** Held only by implication; the editor shows these ticked but locked. */
  impliedPermissions: impliedPermissions(role.permissions).toString(),
  isSystem: role.isSystem,
  userCount: role._count?.users ?? 0,
});

/**
 * "3 people hold this role", on the roles screen and in the delete
 * confirmation. A people count, so machine identities are out of it.
 *
 * It should never change a number: a principal holds no roles at all — its
 * whole grant is its key's `scopes` column — and `users.setRoles` refuses to
 * give it one. It is here so that if a `UserRole` row ever does land on a
 * principal, the screen reports what an admin would recognise rather than
 * quietly counting a bot as a colleague.
 */
const roleCounts = {
  _count: {
    select: { users: { where: { user: { isServiceAccount: false } } } },
  },
} as const;

/**
 * Stops someone minting a role more powerful than themselves and assigning it
 * on. Without this, anyone who could manage roles could escalate to full admin.
 */
function assertNoEscalation(actorBits: PermissionBitField, wanted: bigint) {
  const missing = expandPermissions(wanted) & ~actorBits.effective;
  if (missing !== 0n && !actorBits.has(PermissionFlags.Administrator)) {
    const names = PERMISSION_CATALOG.filter(
      (p) => (missing & PermissionFlags[p.name]) !== 0n,
    )
      .map((p) => p.label)
      .join(", ");
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `You cannot grant permissions you do not hold yourself: ${names}.`,
    });
  }
}

export const rolesRouter = createTRPCRouter({
  /** The permission catalog, for building the editor. */
  catalog: protectedProcedure.query(() =>
    PERMISSION_CATALOG.map((p) => ({
      ...p,
      bit: PermissionFlags[p.name].toString(),
      implies: expandPermissions(PermissionFlags[p.name]).toString(),
    })),
  ),

  /**
   * Every role in the institution, built-ins first.
   *
   * The default page is set past any plausible list rather than at a
   * comfortable screenful, because three of the four things that read this
   * render it whole and have no pager to reach a second page with: the role
   * filter on the people screen, the picker in "add person", and the one in
   * the user drawer. Four built-ins plus whatever an institution has invented
   * is a list of tens, so 200 is not a page — it is the whole thing with room
   * to spare, which is the only size that leaves those pickers honest.
   */
  list: permissionProcedure(PermissionFlags.ViewUsers)
    .input(z.object(pageInput({ defaultSize: 200, maxSize: 500 })).default({}))
    .query(async ({ ctx, input }) => {
      const where = { orgId: ctx.orgId };
      const [roles, total] = await Promise.all([
        ctx.db.role.findMany({
          where,
          include: roleCounts,
          orderBy: [{ isSystem: "desc" }, { name: "asc" }],
          ...pageArgs(input),
        }),
        ctx.db.role.count({ where }),
      ]);
      return toPage(roles.map(serialise), total, input);
    }),

  byId: permissionProcedure(PermissionFlags.ViewUsers)
    .input(z.object({ id: roleId }))
    .query(async ({ ctx, input }) => {
      const role = await ctx.db.role.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        include: roleCounts,
      });
      return role ? serialise(role) : null;
    }),

  create: permissionProcedure(PermissionFlags.ManageRoles)
    .input(
      z.object({
        name: z.string().trim().min(1).max(60),
        description: z.string().trim().max(300).optional(),
        permissions: permissionsInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertNoEscalation(ctx.bits, input.permissions);

      const clash = await ctx.db.role.findFirst({
        where: { orgId: ctx.orgId, name: input.name },
        select: { id: true },
      });
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A role called "${input.name}" already exists.`,
        });
      }

      const role = await ctx.db.role.create({
        data: {
          orgId: ctx.orgId,
          name: input.name,
          description: input.description,
          permissions: input.permissions,
          isSystem: false,
        },
        include: roleCounts,
      });
      return serialise(role);
    }),

  update: permissionProcedure(PermissionFlags.ManageRoles)
    .input(
      z.object({
        id: roleId,
        name: z.string().trim().min(1).max(60).optional(),
        description: z.string().trim().max(300).nullish(),
        permissions: permissionsInput.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = await ctx.db.role.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
      });
      if (!role) throw new TRPCError({ code: "NOT_FOUND" });

      if (role.isSystem) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `"${role.name}" is a built-in role and cannot be changed. Create a custom role instead.`,
        });
      }

      if (input.permissions !== undefined) {
        assertNoEscalation(ctx.bits, input.permissions);

        // Editing a role you hold can strip your own access; the same guard as
        // editing your own account.
        const holdsIt = await ctx.db.userRole.findUnique({
          where: { userId_roleId: { userId: ctx.actor.id, roleId: role.id } },
          select: { userId: true },
        });
        if (
          holdsIt &&
          wouldLockSelfOut(ctx.actor.id, ctx.actor.id, input.permissions)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "That change would remove your own ability to manage roles.",
          });
        }
      }

      if (input.name && input.name !== role.name) {
        const clash = await ctx.db.role.findFirst({
          where: { orgId: ctx.orgId, name: input.name, id: { not: role.id } },
          select: { id: true },
        });
        if (clash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A role called "${input.name}" already exists.`,
          });
        }
      }

      const updated = await ctx.db.role.update({
        where: { id: role.id },
        data: {
          name: input.name,
          description: input.description,
          permissions: input.permissions,
        },
        include: roleCounts,
      });
      return serialise(updated);
    }),

  /** How many people would lose this role, shown before confirming. */
  deleteImpact: permissionProcedure(PermissionFlags.ManageRoles)
    .input(z.object({ id: roleId }))
    .query(async ({ ctx, input }) => {
      const [role, userCount] = await Promise.all([
        ctx.db.role.findFirst({
          where: { id: input.id, orgId: ctx.orgId },
          select: { name: true, isSystem: true },
        }),
        ctx.db.userRole.count({
          where: { roleId: input.id, user: { isServiceAccount: false } },
        }),
      ]);
      const wouldStrand = await ctx.db.user.count({
        where: {
          orgId: ctx.orgId,
          isServiceAccount: false,
          roles: { some: { roleId: input.id }, every: { roleId: input.id } },
        },
      });
      return {
        name: role?.name ?? null,
        isSystem: role?.isSystem ?? false,
        userCount,
        wouldStrand,
      };
    }),

  delete: permissionProcedure(PermissionFlags.ManageRoles)
    .input(z.object({ id: roleId }))
    .mutation(async ({ ctx, input }) => {
      const role = await ctx.db.role.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
      });
      if (!role) throw new TRPCError({ code: "NOT_FOUND" });

      if (role.isSystem) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `"${role.name}" is a built-in role and cannot be deleted.`,
        });
      }

      // Deleting a role would cascade its assignments away; anyone left with no
      // role at all would silently lose access to everything. A principal is
      // not among them — it draws nothing from roles — so counting one here
      // would block the delete forever behind a message about a person who
      // does not exist.
      const stranded = await ctx.db.user.count({
        where: {
          orgId: ctx.orgId,
          isServiceAccount: false,
          roles: { some: { roleId: role.id }, every: { roleId: role.id } },
        },
      });
      if (stranded > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${stranded} ${stranded === 1 ? "person has" : "people have"} no other role. Give them another role first.`,
        });
      }

      await ctx.db.role.delete({ where: { id: role.id } });
      return { deleted: true };
    }),
});
