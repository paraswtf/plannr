import { TRPCError } from "@trpc/server";
import Papa from "papaparse";
import { z } from "zod";

import {
  addressSearch,
  contactAddress,
  contactAddresses,
  personName,
} from "~/lib/people";
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
import { diffRows, type ExistingUser } from "~/server/services/csv-import/diff";
import {
  matchColumn,
  MAX_IMPORT_ROWS,
  splitList,
} from "~/server/services/csv-import/schema";
import type { Db } from "~/server/services/occurrences";
import { env } from "~/env";

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
  isServiceAccount: boolean;
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
    /** null for the students the college has not sent an address for yet. */
    email: contactAddress(u.email),
    isActive: u.isActive,
    /**
     * Always false on anything the directory hands back — `buildWhere` and
     * `byId` filter machine identities out entirely rather than badging them.
     * It is reported because `me` does not filter: a caller holding an API key
     * asks `users.me` about itself, and "am I a key or a person?" is the one
     * question it cannot answer from the token alone.
     */
    isServiceAccount: u.isServiceAccount,
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

/**
 * An API key's machine identity is a `User` row, so nothing stops an admin
 * screen from pointing any of these mutations at one. This says no.
 *
 * It is not tidiness. A key's authority is its `ApiKey.scopes` column and
 * nothing else — that single row is the whole answer to "what can this key
 * do?", which is what makes a key auditable and narrowable. Assign a role to
 * its principal, or grant it a personal permission bit, and the key silently
 * gains every permission that role carries, on every request, without ever
 * appearing in the scope model: the grant goes around it entirely and no
 * amount of reading the API keys screen would reveal it. Deleting the
 * principal is just as wrong — it takes the audit trail with it, where
 * revoking the key leaves "who created this event" still answerable.
 *
 * So the whole class of edits stops here and is done from the API keys screen,
 * which is the only place that can change a key's powers honestly.
 */
function assertNotServiceAccount(target: { isServiceAccount: boolean }) {
  if (target.isServiceAccount) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "That account belongs to an API key, not a person. Change its scopes or revoke it from the API keys screen.",
    });
  }
}

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
  // Every mutation that edits, repermissions or deletes somebody comes through
  // here, so one check covers update, setRoles, setExtraPermissions and delete.
  assertNotServiceAccount(user);

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
        // A person's page, reached from the directory. A principal has no page
        // here — it has one on the API keys screen — so it answers null rather
        // than rendering a colleague who does not exist.
        where: { id: input.id, orgId: ctx.orgId, isServiceAccount: false },
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
      // Deliberately unfiltered. This asks "is this address spoken for?", and
      // the unique index it is standing in for does not care whose row holds
      // it — hiding a principal here would trade a clear message for a raw
      // constraint error a moment later.
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
        email: z.string().trim().email().toLowerCase().optional(),
        isActive: z.boolean().optional(),
        /** null clears the PRN and removes the student profile. */
        prn: z.string().trim().regex(PRN_REGEX).nullish(),
        department: z.string().trim().max(120).nullish(),
        shortName: z.string().trim().max(60).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const target = await loadTarget(ctx.db, ctx.orgId, input.id);
      assertMayActOn(
        { id: ctx.actor.id, permissions: ctx.actor.permissions },
        { id: target.user.id, permissions: target.permissions },
      );

      // Both of these are unique, so check them up front and say which value
      // clashed rather than surfacing a database constraint error.
      if (input.email && input.email !== target.user.email) {
        // Unfiltered for the same reason as `create`: this stands in for a
        // unique index, which is blind to what kind of row holds the address.
        const clash = await ctx.db.user.findUnique({
          where: { email: input.email },
          select: { id: true },
        });
        if (clash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `${input.email} is already used by someone else.`,
          });
        }
      }
      if (input.prn) {
        const clash = await ctx.db.studentProfile.findFirst({
          where: {
            orgId: ctx.orgId,
            prn: input.prn,
            userId: { not: input.id },
          },
          select: { user: { select: { name: true, email: true } } },
        });
        if (clash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `PRN ${input.prn} already belongs to ${personName(clash.user)}.`,
          });
        }
      }

      // Somebody with no address was shut out by the college's paperwork, not
      // by anyone here, so supplying one opens the account — the same rule the
      // student import follows. An account disabled on purpose keeps its state
      // through an address change, because that is a decision somebody made.
      const opened =
        contactAddress(input.email) && !contactAddress(target.user.email)
          ? true
          : undefined;

      return ctx.db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: input.id },
          data: {
            name: input.name,
            email: input.email,
            isActive: input.isActive ?? opened,
          },
        });

        // A student profile is created, updated or dropped to follow the PRN.
        if (input.prn === null) {
          await tx.studentProfile.deleteMany({ where: { userId: input.id } });
        } else if (input.prn !== undefined) {
          await tx.studentProfile.upsert({
            where: { userId: input.id },
            create: { userId: input.id, orgId: ctx.orgId, prn: input.prn },
            update: { prn: input.prn },
          });
        }

        if (input.department !== undefined || input.shortName !== undefined) {
          await tx.facultyProfile.upsert({
            where: { userId: input.id },
            create: {
              userId: input.id,
              orgId: ctx.orgId,
              department: input.department ?? null,
              shortName: input.shortName ?? null,
            },
            update: {
              ...(input.department !== undefined
                ? { department: input.department }
                : {}),
              ...(input.shortName !== undefined
                ? { shortName: input.shortName }
                : {}),
            },
          });
        }

        const updated = await tx.user.findUniqueOrThrow({
          where: { id: input.id },
          include: userInclude,
        });
        return serialise(updated);
      });
    }),

  /** The groups a person belongs to, editable from their profile. */
  groups: permissionProcedure(PermissionFlags.ViewUsers)
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const profile = await ctx.db.studentProfile.findUnique({
        where: { userId: input.id },
        include: {
          memberships: {
            include: {
              group: {
                select: { id: true, name: true, label: true },
              },
            },
          },
        },
      });
      return {
        hasStudentProfile: Boolean(profile),
        groups:
          profile?.memberships.map((m) => ({
            id: m.group.id,
            label: m.group.label ?? m.group.name,
          })) ?? [],
      };
    }),

  setGroups: permissionProcedure(PermissionFlags.ManageGroups)
    .input(
      z.object({ id: z.string().cuid(), groupIds: z.array(z.string().cuid()) }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.studentProfile.findUnique({
        where: { userId: input.id },
        select: { id: true, user: { select: { isServiceAccount: true } } },
      });
      if (!profile) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Give this person a PRN first — group membership is recorded against their student record.",
        });
      }
      // A principal cannot hold a student profile — `update` refuses to give it
      // one — so this can only fire if something else put one there. Checked
      // anyway, because the alternative failure is a key quietly joining a
      // cohort and turning up on sixty people's rosters.
      assertNotServiceAccount(profile.user);

      const groups = await ctx.db.group.findMany({
        where: { id: { in: input.groupIds }, orgId: ctx.orgId },
        select: { id: true },
      });

      await ctx.db.$transaction([
        ctx.db.studentGroupMembership.deleteMany({
          where: { studentId: profile.id },
        }),
        ctx.db.studentGroupMembership.createMany({
          data: groups.map((g) => ({
            studentId: profile.id,
            groupId: g.id,
            addedById: ctx.actor.id,
          })),
        }),
      ]);
      return { assigned: groups.length };
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
      const skipped: Array<{ id: string; who: string; reason: string }> = [];

      for (const target of targets) {
        // This procedure's contract is to skip and explain rather than fail the
        // whole selection, so a principal caught in a select-all is reported
        // the same way a protected colleague is — the outcome is the same
        // refusal `assertNotServiceAccount` makes elsewhere.
        if (target.isServiceAccount) {
          skipped.push({
            id: target.id,
            who: personName(target),
            reason:
              "That account belongs to an API key. Revoke it from the API keys screen.",
          });
          continue;
        }

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
            who: personName(target),
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
   * Dry run of a CSV import: parses, validates and diffs against the database,
   * changing nothing. The commit re-runs all of it rather than trusting these
   * results back, so this is purely for the preview table.
   */
  importPreview: permissionProcedure(PermissionFlags.ImportUsers)
    .input(z.object({ csv: z.string().max(2_000_000) }))
    .query(async ({ ctx, input }) => planImport(ctx, input.csv)),

  importCommit: permissionProcedure(PermissionFlags.ImportUsers)
    .input(
      z.object({
        csv: z.string().max(2_000_000),
        fileName: z.string().max(200).optional(),
        /** Create any groups named in the file that do not exist yet. */
        createMissingGroups: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const plan = await planImport(ctx, input.csv);

      if (plan.summary.error > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${plan.summary.error} row(s) still have errors. Fix the file and try again.`,
        });
      }
      if (plan.newGroups.length > 0 && !input.createMissingGroups) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unknown group(s): ${plan.newGroups.join(", ")}. Confirm to create them.`,
        });
      }

      const roles = await ctx.db.role.findMany({ where: { orgId: ctx.orgId } });
      const roleByKey = new Map(
        roles.filter((r) => r.key).map((r) => [r.key!, r]),
      );

      // Groups named in the file but not yet present. They need a course, so
      // they hang off a catch-all one rather than being invented per row.
      const groupIdByName = new Map<string, string>();
      for (const g of await ctx.db.group.findMany({
        where: { orgId: ctx.orgId },
        select: { id: true, name: true },
      })) {
        groupIdByName.set(g.name.toLowerCase(), g.id);
      }

      if (plan.newGroups.length > 0) {
        const course = await ctx.db.programme.upsert({
          where: { orgId_code: { orgId: ctx.orgId, code: "UNSORTED" } },
          update: {},
          create: {
            orgId: ctx.orgId,
            code: "UNSORTED",
            name: "Imported groups",
          },
        });
        for (const name of plan.newGroups) {
          const created = await ctx.db.group.create({
            data: {
              orgId: ctx.orgId,
              name,
              label: name,
              programmeId: course.id,
            },
          });
          groupIdByName.set(name.toLowerCase(), created.id);
        }
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;

      // Chunked so one enormous file does not sit in a single long
      // transaction; each chunk is atomic on its own.
      const actionable = plan.rows.filter((r) => r.status !== "skip");
      skipped = plan.rows.length - actionable.length;

      for (let i = 0; i < actionable.length; i += 100) {
        const chunk = actionable.slice(i, i + 100);
        await ctx.db.$transaction(async (tx) => {
          for (const row of chunk) {
            const roleIds = row.data.roles
              .map((key) => roleByKey.get(key)?.id)
              .filter((id): id is string => Boolean(id));

            const user = row.matchedUserId
              ? await tx.user.update({
                  where: { id: row.matchedUserId },
                  data: { name: row.data.name, email: row.data.email },
                })
              : await tx.user.create({
                  data: {
                    orgId: ctx.orgId,
                    name: row.data.name,
                    email: row.data.email,
                  },
                });
            if (row.matchedUserId) updated++;
            else created++;

            await tx.userRole.deleteMany({ where: { userId: user.id } });
            await tx.userRole.createMany({
              data: roleIds.map((roleId) => ({
                userId: user.id,
                roleId,
                assignedById: ctx.actor.id,
              })),
            });

            if (row.data.prn) {
              const profile = await tx.studentProfile.upsert({
                where: { userId: user.id },
                create: {
                  userId: user.id,
                  orgId: ctx.orgId,
                  prn: row.data.prn,
                },
                update: { prn: row.data.prn },
              });

              for (const groupName of row.data.groups) {
                const groupId = groupIdByName.get(groupName.toLowerCase());
                if (!groupId) continue;
                await tx.studentGroupMembership.upsert({
                  where: {
                    studentId_groupId: { studentId: profile.id, groupId },
                  },
                  create: {
                    studentId: profile.id,
                    groupId,
                    addedById: ctx.actor.id,
                  },
                  update: {},
                });
              }
            }
          }
        });
      }

      await ctx.db.importBatch.create({
        data: {
          orgId: ctx.orgId,
          createdById: ctx.actor.id,
          fileName: input.fileName,
          created,
          updated,
          skipped,
        },
      });

      return { created, updated, skipped };
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
      // A placeholder address is nobody's identifier: it is never shown, so it
      // cannot have been read off a screen, and matching one would let a paste
      // reach a student by a string that says they have no address.
      const emails = contactAddresses(cleaned.filter((v) => v.includes("@")));
      const prns = cleaned.filter((v) => !v.includes("@"));

      const found = await ctx.db.user.findMany({
        where: {
          orgId: ctx.orgId,
          // Whatever this resolves to gets added to a group, a roster or a
          // reviewer list, so a paste must never land on a machine identity.
          isServiceAccount: false,
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
          email: contactAddress(u.email),
          prn: u.studentProfile?.prn ?? null,
        })),
        unmatched,
      };
    }),
});

/**
 * Parses a CSV and works out what importing it would do. Shared by the preview
 * and the commit — the commit re-runs it rather than trusting the client to
 * echo back a plan, which also closes the gap where the database moved on
 * between the two calls.
 */
async function planImport(
  ctx: { db: Db; orgId: string; bits: PermissionBitField },
  csv: string,
) {
  const parsed = Papa.parse<Record<string, string>>(csv.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => matchColumn(h) ?? `ignored:${h}`,
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Could not read that CSV: ${parsed.errors[0]!.message}`,
    });
  }
  if (parsed.data.length > MAX_IMPORT_ROWS) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `That file has ${parsed.data.length} rows; the limit is ${MAX_IMPORT_ROWS}.`,
    });
  }

  const headers = parsed.meta.fields ?? [];
  if (!headers.includes("email")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The file needs an email column.",
    });
  }

  const records = parsed.data.map((values, i) => ({
    // +2: one for the header row, one because spreadsheets count from 1.
    line: i + 2,
    values,
  }));

  // Only the people the file actually mentions. Loading the whole directory to
  // diff a twenty-row paste would not survive a real intake.
  const emailsInFile = records
    .map((r) => r.values.email?.trim().toLowerCase())
    .filter((v): v is string => Boolean(v));
  const prnsInFile = records
    .map((r) => r.values.prn?.trim())
    .filter((v): v is string => Boolean(v));

  const [users, roles, groups] = await Promise.all([
    ctx.db.user.findMany({
      where: {
        orgId: ctx.orgId,
        // This lookup decides which rows the commit will *update* — and an
        // update rewrites the person's whole role set. Matching a principal
        // would hand it every role named in a spreadsheet column, which is the
        // escalation `assertNotServiceAccount` exists to prevent, so it is not
        // matchable at all. It cannot happen anyway: `rowSchema` rejects any
        // address outside the Workspace domain, and a principal's address is
        // deliberately on a domain Google will never vouch for.
        isServiceAccount: false,
        OR: [
          { email: { in: emailsInFile } },
          { studentProfile: { prn: { in: prnsInFile } } },
        ],
      },
      include: {
        roles: {
          include: { role: { select: { key: true, permissions: true } } },
        },
        studentProfile: {
          include: {
            memberships: { include: { group: { select: { name: true } } } },
          },
        },
        _count: { select: { accounts: true } },
      },
    }),
    ctx.db.role.findMany({ where: { orgId: ctx.orgId } }),
    ctx.db.group.findMany({
      where: {
        orgId: ctx.orgId,
        name: {
          in: records.flatMap((r) => splitList(r.values.groups)),
          mode: "insensitive",
        },
      },
      select: { name: true },
    }),
  ]);

  const existing: ExistingUser[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    prn: u.studentProfile?.prn ?? null,
    hasSignedIn: u._count.accounts > 0,
    roleKeys: u.roles
      .map((r) => r.role.key)
      .filter((k): k is string => Boolean(k)),
    groupNames: u.studentProfile?.memberships.map((m) => m.group.name) ?? [],
  }));

  // An importer can only hand out roles whose permissions they already hold.
  const assignableRoleKeys = roles
    .filter(
      (r) =>
        r.key &&
        (ctx.bits.has(PermissionFlags.Administrator) ||
          (expandPermissions(r.permissions) & ~ctx.bits.effective) === 0n),
    )
    .map((r) => r.key!);

  return diffRows({
    records,
    domain: env.GOOGLE_WORKSPACE_DOMAIN,
    existing,
    knownRoleKeys: roles
      .map((r) => r.key)
      .filter((k): k is string => Boolean(k)),
    knownGroupNames: groups.map((g) => g.name),
    assignableRoleKeys,
  });
}

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
    // The staff directory, and the "N matches" count above it, are a list of
    // colleagues. A machine identity is neither a colleague nor a headcount.
    isServiceAccount: false,
    ...(input.roleId ? { roles: { some: { roleId: input.roleId } } } : {}),
    ...(input.status === "active" ? { isActive: true } : {}),
    ...(input.status === "inactive" ? { isActive: false } : {}),
    ...(input.status === "never-signed-in" ? { accounts: { none: {} } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            addressSearch(q),
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
