import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  bitsToScopes,
  denyScopeGrant,
  scopeCatalog,
  scopeDenialMessage,
  scopesToBits,
} from "~/lib/api-scopes";
import { PermissionFlags } from "~/lib/permissions";
import { pageArgs, pageInput, toPage } from "~/server/api/pagination";
import {
  createTRPCRouter,
  permissionProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { mintKey, servicePrincipalEmail } from "~/server/api-keys/secret";

/**
 * The console for the institution's API keys.
 *
 * Everything here is gated on `ManageRoles`, and that deserves a sentence
 * rather than a shrug. A key is not a room or a course: it is a grant of
 * authority over the institution, handed to something that is not a person and
 * will never be asked to explain itself. Minting one is therefore the same kind
 * of act as writing a role and giving it to somebody — it decides who may do
 * what — so it belongs behind the bit that already means exactly that. The
 * alternative, a bespoke `ManageApiKeys` flag, would have been a second answer
 * to a question the app has already answered once, and would have let an
 * institution accidentally separate "may grant power" from "may grant power to
 * a robot", which are not different questions.
 *
 * Two properties hold across this file:
 *
 *   - `hash` is never selected. Not filtered out downstream, never read. The
 *     shared `keySelect` below is the enforcement, and it is the reason no
 *     procedure here can leak a credential by forgetting to strip a field.
 *   - The secret half of a token exists exactly twice: in the response to
 *     `create` or `roll`, and in whatever the caller does with it next. It is
 *     never recoverable, and a lost key is rolled, not looked up.
 */

/**
 * A key may not administer keys.
 *
 * Worth being precise about, because the permission bits alone would let one
 * through: a key scoped `ManageRoles` satisfies `permissionProcedure`, and
 * `denyScopeGrant` would then cheerfully let it mint a second key holding
 * everything the first one holds. In bitfield terms that is not an escalation
 * — the child is no wider than the parent — but in every sense that matters it
 * is. A leaked token would become permanent: revoke it, and its offspring goes
 * on working under a name and a principal nobody in the building recognises.
 * Widening and rolling are the same trick from different angles; deleting
 * destroys the record of what the token did; and revoking is the mirror image,
 * where a compromised app switches off every integration the college has.
 *
 * So the estate of credentials is administered by people, holding a session,
 * who can be asked afterwards what they were thinking. Reads are left alone
 * here — they disclose no secret — and are refused at the REST doorway
 * instead, for the reason set out in `src/server/rest/routes/api-keys.ts`.
 */
function refuseServicePrincipal(kind: "user" | "service", verb: string): void {
  if (kind !== "service") return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `An API key cannot ${verb} API keys. Sign in to the console and do it as yourself.`,
  });
}

/**
 * The only shape a key is ever read in.
 *
 * A `select` rather than an `include` on purpose: the omission of `hash` is
 * then a property of the query, not a discipline somebody has to keep up in
 * every serialiser they write afterwards.
 */
const keySelect = {
  id: true,
  name: true,
  description: true,
  prefix: true,
  last4: true,
  scopes: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  requestCount: true,
  rateLimitPerMinute: true,
  createdBy: { select: { id: true, name: true } },
} as const;

interface KeyRow {
  id: string;
  name: string;
  description: string | null;
  prefix: string;
  last4: string;
  scopes: bigint;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  requestCount: number;
  rateLimitPerMinute: number;
  createdBy: { id: string; name: string | null } | null;
}

export type ApiKeyStatus = "active" | "expired" | "revoked";

/**
 * Revocation beats expiry, because it is the deliberate one. A key that was
 * switched off in March and would have lapsed in June is "revoked" — telling
 * an admin it merely expired would suggest rolling it is enough to bring it
 * back, which is precisely what somebody decided should not happen.
 */
const statusOf = (
  key: Pick<KeyRow, "revokedAt" | "expiresAt">,
): ApiKeyStatus => {
  if (key.revokedAt) return "revoked";
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) return "expired";
  return "active";
};

const serialise = (key: KeyRow) => ({
  id: key.id,
  name: key.name,
  description: key.description,
  /** The public handle. Identifies the key in a log line; useless as a credential. */
  prefix: key.prefix,
  /** Tail of the secret, so a person holding four keys can tell them apart. */
  last4: key.last4,
  /**
   * Expanded, not literal: a key scoped `ManageAllEvents` can read the
   * timetable whether or not anybody ticked `ViewAllEvents`, and a console
   * that hid that would understate the blast radius of the credential.
   */
  scopes: bitsToScopes(key.scopes),
  status: statusOf(key),
  createdBy: key.createdBy,
  createdAt: key.createdAt,
  expiresAt: key.expiresAt,
  revokedAt: key.revokedAt,
  lastUsedAt: key.lastUsedAt,
  requestCount: key.requestCount,
  rateLimitPerMinute: key.rateLimitPerMinute,
});

/**
 * Mirrors the fixed window `recordUse` enforces in
 * `~/server/api-keys/authenticate`. Duplicated rather than imported because
 * that module is `server-only` machinery whose window is an implementation
 * detail of the throttle; here the number is only ever used to describe a row
 * to a human, and nothing is enforced against it.
 */
const RATE_WINDOW_SECONDS = 60;

const keyId = z.string().cuid();
const keyName = z.string().trim().min(1).max(80);
const keyDescription = z.string().trim().max(500);
/**
 * Scope names arrive unvalidated on purpose. `denyScopeGrant` is the one place
 * that decides whether a set of scopes may be granted, and it answers with a
 * sentence a person can act on — "you cannot grant X, because you do not hold
 * it yourself" — where a zod enum would only ever manage "invalid enum value".
 */
const scopeNames = z.array(z.string()).max(64);
const rateLimit = z.number().int().min(1).max(10_000);

/** The display name carried by the machine identity, in every audit column. */
const principalName = (name: string) => `${name} (API key)`;

export const apiKeysRouter = createTRPCRouter({
  /**
   * The scope vocabulary, for rendering the checkboxes.
   *
   * Open to anyone signed in, like `roles.catalog`: it is a static list
   * derived from the permission catalogue, identical in every install, and
   * contains nothing about this institution at all.
   */
  scopeCatalog: protectedProcedure.query(() => scopeCatalog()),

  /**
   * The whole estate, newest first, revoked ones included.
   *
   * Sized to be read whole rather than paged: the console draws every key in
   * one card, and an institution holding two hundred credentials has a problem
   * this screen would not be the place to discover. Revoked keys count towards
   * that — they are never deleted, because the audit trail names their
   * principals — so the default has to be comfortably past the live ones.
   */
  list: permissionProcedure(PermissionFlags.ManageRoles)
    .input(z.object(pageInput({ defaultSize: 200, maxSize: 500 })).default({}))
    .query(async ({ ctx, input }) => {
      const where = { orgId: ctx.orgId };
      const [keys, total] = await Promise.all([
        ctx.db.apiKey.findMany({
          where,
          select: keySelect,
          orderBy: { createdAt: "desc" },
          ...pageArgs(input),
        }),
        ctx.db.apiKey.count({ where }),
      ]);
      return toPage(keys.map(serialise), total, input);
    }),

  /**
   * Throws rather than returning null when there is no such key, unlike
   * `rooms.byId`. A missing room is an ordinary miss in a picker; a missing
   * key is either a typo or somebody poking at another organisation's ids,
   * and both want an answer that cannot be mistaken for "it exists and is
   * empty".
   */
  byId: permissionProcedure(PermissionFlags.ManageRoles)
    .input(z.object({ id: keyId }))
    .query(async ({ ctx, input }) => {
      const key = await ctx.db.apiKey.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: keySelect,
      });
      if (!key) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found.",
        });
      }
      return serialise(key);
    }),

  /**
   * Mints a key, and returns the only copy of it that will ever exist.
   *
   * READ THIS BEFORE CHANGING THE RETURN SHAPE. `token` is the whole secret,
   * in plain text, for the first and last time: the database holds a SHA-256
   * digest and nothing else, so once this response is gone the credential
   * cannot be recovered by anybody — not the admin who made it, not an
   * engineer with a psql prompt. `shownOnce` exists so the UI has something
   * unambiguous to hang "copy this now, you will not see it again" on, and so
   * that nothing downstream ever mistakes this response for the ordinary key
   * record that `list` and `byId` return.
   */
  create: permissionProcedure(PermissionFlags.ManageRoles)
    .input(
      z.object({
        name: keyName,
        description: keyDescription.optional(),
        scopes: scopeNames,
        expiresInDays: z.number().int().min(1).max(3650).optional(),
        rateLimitPerMinute: rateLimit.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      refuseServicePrincipal(ctx.actor.kind, "mint");

      const denial = denyScopeGrant(input.scopes, ctx.actor.permissions);
      if (denial) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: scopeDenialMessage(denial),
        });
      }

      const minted = mintKey();
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      // One transaction because the two rows are one fact. A principal without
      // its key is a user nobody can sign in as, find, or explain; a key
      // without its principal cannot satisfy `Event.createdById` or the NOT
      // NULL `EventChangeRequest.requestedById`, which is the entire reason the
      // principal exists.
      const key = await ctx.db.$transaction(async (tx) => {
        const principal = await tx.user.create({
          data: {
            orgId: ctx.orgId,
            name: principalName(input.name),
            email: servicePrincipalEmail(minted.prefix),
            isServiceAccount: true,
            isActive: true,
            /**
             * Zero, and it stays zero. The key's own `scopes` column is the
             * entire grant, and the principal is given no roles either — so
             * "what can this key do?" is answerable by reading one row, and
             * narrowing it is one write that takes effect on the next request.
             * Bits here would be a second, invisible source of authority that
             * survived every change made in the key editor.
             */
            permissions: 0n,
          },
          select: { id: true },
        });

        return tx.apiKey.create({
          data: {
            orgId: ctx.orgId,
            name: input.name,
            description: input.description,
            prefix: minted.prefix,
            hash: minted.hash,
            last4: minted.last4,
            principalId: principal.id,
            scopes: scopesToBits(input.scopes),
            createdById: ctx.actor.id,
            expiresAt,
            rateLimitPerMinute: input.rateLimitPerMinute,
          },
          select: keySelect,
        });
      });

      return {
        ...serialise(key),
        /** Plain text. Shown once. Not stored anywhere, by anyone. */
        token: minted.token,
        shownOnce: true as const,
      };
    }),

  update: permissionProcedure(PermissionFlags.ManageRoles)
    .input(
      z.object({
        id: keyId,
        name: keyName.optional(),
        description: keyDescription.nullish(),
        scopes: scopeNames.optional(),
        rateLimitPerMinute: rateLimit.optional(),
        /** Null clears the expiry; undefined leaves it alone. */
        expiresAt: z.date().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      refuseServicePrincipal(ctx.actor.kind, "edit");

      const key = await ctx.db.apiKey.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: { id: true, name: true, principalId: true, revokedAt: true },
      });
      if (!key) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found.",
        });
      }
      // Revocation is a full stop, not a pause. Editing a revoked key would
      // suggest it could be brought back, and the sensible reading of "widen
      // the scopes on the key we switched off after the leak" is that somebody
      // has the wrong row.
      if (key.revokedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${key.name}" has been revoked and can no longer be changed. Mint a new key instead.`,
        });
      }

      if (input.scopes !== undefined) {
        const denial = denyScopeGrant(input.scopes, ctx.actor.permissions);
        if (denial) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: scopeDenialMessage(denial),
          });
        }
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        // The principal's name is what an admin reads in "scheduled by" on
        // every event this app has ever created. Leaving it behind when the
        // key is renamed would leave last year's name attached to tomorrow's
        // lecture, which is how audit trails quietly stop being trusted.
        if (input.name !== undefined && input.name !== key.name) {
          await tx.user.update({
            where: { id: key.principalId },
            data: { name: principalName(input.name) },
          });
        }

        return tx.apiKey.update({
          where: { id: key.id },
          data: {
            name: input.name,
            description: input.description,
            scopes:
              input.scopes !== undefined
                ? scopesToBits(input.scopes)
                : undefined,
            rateLimitPerMinute: input.rateLimitPerMinute,
            expiresAt: input.expiresAt,
          },
          select: keySelect,
        });
      });

      return serialise(updated);
    }),

  /**
   * Rotates the secret without disturbing the identity.
   *
   * Same row, same principal, same `createdAt`, same running `requestCount` —
   * so everything the app has ever scheduled still points at the thing that
   * scheduled it, and a rotation costs the institution no history. That is the
   * whole difference between rolling a key and replacing one, and it is why
   * rolling is the answer to "the token is in a git commit" rather than
   * "revoke it and mint another".
   *
   * The public prefix rotates along with the secret. It costs nothing — it is
   * a handle, not a credential — and it means the leaked token stops matching
   * any row at all, so probing with it is answered by the same flat "not
   * valid" as a token invented from thin air, instead of confirming that the
   * key it names is real. The principal's address is derived from the prefix,
   * so it moves too.
   */
  roll: permissionProcedure(PermissionFlags.ManageRoles)
    .input(z.object({ id: keyId }))
    .mutation(async ({ ctx, input }) => {
      refuseServicePrincipal(ctx.actor.kind, "roll");

      const key = await ctx.db.apiKey.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: { id: true, name: true, principalId: true, revokedAt: true },
      });
      if (!key) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found.",
        });
      }
      if (key.revokedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${key.name}" has been revoked. Rolling it would quietly put it back into service — mint a new key instead.`,
        });
      }

      const minted = mintKey();

      const rolled = await ctx.db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: key.principalId },
          data: { email: servicePrincipalEmail(minted.prefix) },
        });
        return tx.apiKey.update({
          where: { id: key.id },
          data: {
            prefix: minted.prefix,
            hash: minted.hash,
            last4: minted.last4,
          },
          select: keySelect,
        });
      });

      return {
        ...serialise(rolled),
        /** Plain text. Shown once. The old token is dead the moment this returns. */
        token: minted.token,
        shownOnce: true as const,
      };
    }),

  /**
   * Switches a key off, permanently, and keeps every trace of it.
   *
   * The row survives revocation because the audit trail depends on it. The
   * principal is named by `Event.createdById` on everything the app ever
   * scheduled and by the NOT NULL `EventChangeRequest.requestedById` on
   * everything it ever asked for; taking it away would null out the first and
   * cascade the second into oblivion. "Who booked LT-3 every Tuesday last
   * term?" has to keep having an answer after somebody has decided the
   * integration that did it is no longer welcome.
   *
   * Idempotent: revoking an already-revoked key returns it unchanged rather
   * than erroring, because the caller wanted it off and it is off, and because
   * the one moment this gets called twice is an incident where nobody needs an
   * error message about a race.
   */
  revoke: permissionProcedure(PermissionFlags.ManageRoles)
    .input(z.object({ id: keyId }))
    .mutation(async ({ ctx, input }) => {
      refuseServicePrincipal(ctx.actor.kind, "revoke");

      const key = await ctx.db.apiKey.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: keySelect,
      });
      if (!key) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found.",
        });
      }
      if (key.revokedAt) return serialise(key);

      const revoked = await ctx.db.apiKey.update({
        where: { id: key.id },
        data: { revokedAt: new Date(), revokedById: ctx.actor.id },
        select: keySelect,
      });
      return serialise(revoked);
    }),

  /**
   * Erases a key and its principal outright.
   *
   * Guarded behind revocation, and the guard is not ceremony. Deleting the
   * principal nulls `createdById` on every event this app scheduled and
   * cascades away every change request it ever raised — a term's worth of
   * "who did this?" gone in one click, from a list where the row above is a
   * key somebody still depends on. Requiring a revoke first means the
   * destructive act is deliberately the second one, and by then the key has
   * already been off long enough for anybody to notice what broke.
   *
   * This exists at all for the mistakes: a key minted with a typo in its name,
   * or against the wrong environment, that never made a request worth keeping.
   */
  delete: permissionProcedure(PermissionFlags.ManageRoles)
    .input(z.object({ id: keyId }))
    .mutation(async ({ ctx, input }) => {
      refuseServicePrincipal(ctx.actor.kind, "delete");

      const key = await ctx.db.apiKey.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: { id: true, name: true, principalId: true, revokedAt: true },
      });
      if (!key) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found.",
        });
      }
      if (!key.revokedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${key.name}" is still live. Revoke it first — deleting it takes the record of everything it did with it.`,
        });
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.apiKey.delete({ where: { id: key.id } });
        // Explicit, though the schema would cascade the key away with the
        // principal: the two rows are created together and they go together,
        // and relying on the cascade would leave the principal behind on any
        // future schema where that relation is loosened.
        await tx.user.delete({ where: { id: key.principalId } });
      });

      return { deleted: true };
    }),

  /**
   * What the app has actually been doing.
   *
   * The counters come off the key's own row, where the authenticator maintains
   * them as part of the write it was making anyway. The window is reported as
   * empty once it has gone stale, rather than as a window that closed at
   * lunchtime: a stale window and an unused one are indistinguishable to the
   * next request, and describing it any other way would have an admin reading
   * "119 of 120 used" beside a key that has all its headroom back.
   *
   * `eventsCreated` is the honest measure of blast radius. Request counts say
   * how chatty an integration is; this says how much of the timetable it owns.
   */
  usage: permissionProcedure(PermissionFlags.ManageRoles)
    .input(z.object({ id: keyId }))
    .query(async ({ ctx, input }) => {
      const key = await ctx.db.apiKey.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: {
          id: true,
          principalId: true,
          requestCount: true,
          lastUsedAt: true,
          lastUsedIp: true,
          rateLimitPerMinute: true,
          windowStartedAt: true,
          windowCount: true,
        },
      });
      if (!key) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found.",
        });
      }

      const eventsCreated = await ctx.db.event.count({
        where: { orgId: ctx.orgId, createdById: key.principalId },
      });

      const elapsed = key.windowStartedAt
        ? (Date.now() - key.windowStartedAt.getTime()) / 1000
        : Number.POSITIVE_INFINITY;
      const open = elapsed < RATE_WINDOW_SECONDS;
      const used = open ? key.windowCount : 0;

      return {
        requestCount: key.requestCount,
        lastUsedAt: key.lastUsedAt,
        lastUsedIp: key.lastUsedIp,
        rateLimit: {
          perMinute: key.rateLimitPerMinute,
          usedThisWindow: used,
          remaining: Math.max(0, key.rateLimitPerMinute - used),
          windowStartedAt: open ? key.windowStartedAt : null,
          resetsInSeconds: open ? Math.ceil(RATE_WINDOW_SECONDS - elapsed) : 0,
        },
        eventsCreated,
      };
    }),
});
