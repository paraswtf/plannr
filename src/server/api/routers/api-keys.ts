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
/**
 * Why every lookup in this file is filtered to `ownerId: null`.
 *
 * The console administers the institution's credentials. A personal key is not
 * one of those — it is somebody's phone, holding no more than they already
 * hold — and the separation is not tidiness. `roll` returns a working token:
 * an administrator who rolled a student's personal key would be handed a
 * credential that acts as that student, which is a straightforward escalation
 * and one nobody would think to look for. Filtering the lookup rather than the
 * response is what makes that unreachable rather than merely unlikely.
 *
 * The emergency stop for a personal key is the one that already exists and is
 * the honest one: deactivate the person. `authenticateApiKey` refuses a
 * personal key whose owner is inactive, so switching somebody off switches off
 * every credential they hold, in one write, with the audit trail intact.
 */
function refuseApiKey(
  kind: "user" | "service" | "personal",
  verb: string,
): void {
  // Every kind of credential, not merely a service principal. A personal key
  // carries a person's id and their permissions, so a check that asked "is
  // there a human behind this?" would answer yes and wave it through — and a
  // key that can mint a key is a leaked token that renews itself for ever,
  // which is the exact failure the paragraph above exists to prevent. What
  // matters here is not who is asking but what they are asking *with*.
  if (kind === "user") return;
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

/**
 * Everything a personal key may ever hold.
 *
 * One scope, and it is the one everybody already has: reading your own classes.
 * That is the entire question the Siri answers ask, and keeping the list this
 * short is what makes a personal key safe to hand out unaided — a leaked one
 * reads its owner's own timetable, which is what the college puts on a
 * noticeboard, and can do nothing else at all.
 *
 * The intersection in `authenticateApiKey` means this is a ceiling and not a
 * grant: a student holds `ViewOwnEvents`, so their key does; somebody who
 * somehow held none would get a key that could do nothing.
 */
export const PERSONAL_SCOPES = ["ViewOwnEvents"] as const;

/**
 * How many personal keys one person may hold at once.
 *
 * More than one because a phone and an iPad are two devices and sharing a token
 * between them is the habit this would otherwise teach. Not many more, because
 * a list nobody prunes is a list nobody reads, and the point of holding one per
 * device is being able to switch off the device you lost.
 */
const MAX_PERSONAL_KEYS = 5;

/** A phone asking a handful of questions a day, with room for a bad shortcut. */
const PERSONAL_RATE_LIMIT = 60;

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
   *
   * Institutional keys only. A personal key is not part of the estate this
   * console administers: it is one student's phone, it holds nothing but what
   * that student already holds, and a college where everybody sets up Siri
   * would otherwise turn this screen into a directory of handsets with empty
   * scope lists — burying the dozen credentials that actually grant something.
   * They are managed by the person who owns them, on their own settings
   * screen, which is also the only place their token was ever shown.
   */
  list: permissionProcedure(PermissionFlags.ManageRoles)
    .input(z.object(pageInput({ defaultSize: 200, maxSize: 500 })).default({}))
    .query(async ({ ctx, input }) => {
      const where = { orgId: ctx.orgId, ownerId: null };
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
        // `ownerId: null` for the reason `list` gives: a personal key is not
        // part of this estate, and an id that reaches this endpoint must not
        // be able to read one out of it by guessing.
        where: { id: input.id, orgId: ctx.orgId, ownerId: null },
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
      refuseApiKey(ctx.actor.kind, "mint");

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
      refuseApiKey(ctx.actor.kind, "edit");

      const key = await ctx.db.apiKey.findFirst({
        where: { id: input.id, orgId: ctx.orgId, ownerId: null },
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
      refuseApiKey(ctx.actor.kind, "roll");

      const key = await ctx.db.apiKey.findFirst({
        where: { id: input.id, orgId: ctx.orgId, ownerId: null },
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
      refuseApiKey(ctx.actor.kind, "revoke");

      const key = await ctx.db.apiKey.findFirst({
        where: { id: input.id, orgId: ctx.orgId, ownerId: null },
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
      refuseApiKey(ctx.actor.kind, "delete");

      const key = await ctx.db.apiKey.findFirst({
        where: { id: input.id, orgId: ctx.orgId, ownerId: null },
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
        where: { id: input.id, orgId: ctx.orgId, ownerId: null },
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

  // ─── Personal keys ────────────────────────────────────────────────────────

  /**
   * The keys somebody holds for their own devices.
   *
   * Everything above this line is the institution's credential estate, behind
   * `ManageRoles`, because minting one is granting authority over the college.
   * Everything below it is a different act with a different risk, and the
   * distinction is the whole reason a student may do it unaided: a personal key
   * grants nothing at all. Its authority is the intersection of what it was
   * given and what its owner already holds, computed live on every request in
   * `authenticateApiKey`, so it cannot reach a single thing the person could not
   * reach by signing in — and the moment they lose a role, or are deactivated,
   * it loses it too.
   *
   * That is what makes it safe to be self-service. Requiring an administrator
   * would not make it safer; it would make it unused, and the feature it exists
   * for is a student asking their phone when their next lecture is.
   */
  mine: protectedProcedure.query(async ({ ctx }) => {
    const keys = await ctx.db.apiKey.findMany({
      where: { orgId: ctx.orgId, ownerId: ctx.actor.id },
      select: keySelect,
      orderBy: { createdAt: "desc" },
    });
    return keys.map(serialise);
  }),

  /**
   * Mints one for the caller, and returns the only copy of the token there will
   * ever be. See `create` above for why that is shown once and never again.
   *
   * The scopes are not the caller's to choose. `PERSONAL_SCOPES` is what a
   * personal key may ever hold, and it is deliberately the narrowest thing that
   * answers the question the feature exists for — reading your own timetable.
   * A general personal access token, scoped to everything its owner can do,
   * was the obvious alternative and is a much larger promise: a lecturer's
   * would be able to cancel lectures, and it would be sitting in a shortcut on
   * a phone. If a second use ever wants a wider one, that is a deliberate
   * addition here with its own name, not a parameter this endpoint accepts.
   */
  createMine: protectedProcedure
    .input(z.object({ name: keyName }).default({ name: "Siri" }))
    .mutation(async ({ ctx, input }) => {
      refuseApiKey(ctx.actor.kind, "mint");

      const minted = mintKey();

      const key = await ctx.db.$transaction(async (tx) => {
        /*
         * Counted inside the transaction, and counting rows rather than live
         * ones.
         *
         * Outside it, two tabs firing at once both read four and both write a
         * fifth. Inside it the window is a great deal smaller, though read
         * committed does not close it altogether — the honest description is a
         * cap that holds against a person and not against a determined script.
         * That is enough, because the thing being bounded is rows in a table
         * and the worst case is a handful too many, and the alternative is a
         * partial unique index expressing "at most five" that Postgres has no
         * way to write.
         *
         * Every row counts, not just the unrevoked, because `revokeMine` below
         * deletes rather than tombstones — so these are the same number, and
         * saying so here is what stops somebody reintroducing the tombstone and
         * quietly making the cap unbounded again.
         */
        const held = await tx.apiKey.count({
          where: { orgId: ctx.orgId, ownerId: ctx.actor.id },
        });
        if (held >= MAX_PERSONAL_KEYS) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You already have ${MAX_PERSONAL_KEYS} personal keys. Switch one off before making another.`,
          });
        }

        // A principal of its own, exactly as a service key gets, and for the
        // same reason: `principalId` is unique, so a key whose principal was
        // its owner would be the only one that person could ever hold. The
        // principal is the credential's identity in the audit columns; the
        // owner is whose timetable it may read.
        const principal = await tx.user.create({
          data: {
            orgId: ctx.orgId,
            name: principalName(input.name),
            email: servicePrincipalEmail(minted.prefix),
            isServiceAccount: true,
            isActive: true,
            permissions: 0n,
          },
          select: { id: true },
        });

        return tx.apiKey.create({
          data: {
            orgId: ctx.orgId,
            name: input.name,
            description: "Personal key, for this person's own devices.",
            prefix: minted.prefix,
            hash: minted.hash,
            last4: minted.last4,
            principalId: principal.id,
            ownerId: ctx.actor.id,
            scopes: scopesToBits(PERSONAL_SCOPES),
            createdById: ctx.actor.id,
            expiresAt: null,
            // A phone asking a handful of questions a day. Low enough that a
            // shortcut stuck in a loop stops being the college's problem,
            // high enough that nobody meets it by using the thing.
            rateLimitPerMinute: PERSONAL_RATE_LIMIT,
          },
          select: keySelect,
        });
      });

      return {
        ...serialise(key),
        token: minted.token,
        shownOnce: true as const,
      };
    }),

  /**
   * Switches off one of the caller's own keys. Never anybody else's.
   *
   * Deletes it, where the institution's keys are revoked and kept. That is not
   * an inconsistency, it is the audit trail being honest about what there is to
   * audit: a service key mints events and change requests, and its rows are
   * what `Event.createdById` and the NOT NULL `EventChangeRequest.requestedById`
   * point at, so destroying it would orphan history. A personal key holds
   * `ViewOwnEvents` and can therefore never have written anything at all —
   * there is no history to orphan, and keeping a tombstone for every phone
   * anybody ever set up would grow two tables for ever with nothing in them
   * that could be asked a question.
   */
  revokeMine: protectedProcedure
    .input(z.object({ id: keyId }))
    .mutation(async ({ ctx, input }) => {
      refuseApiKey(ctx.actor.kind, "revoke");

      const key = await ctx.db.apiKey.findFirst({
        // The owner is in the filter rather than checked afterwards, so an id
        // belonging to somebody else — or to one of the institution's own
        // integrations — is indistinguishable from one that does not exist.
        where: { id: input.id, orgId: ctx.orgId, ownerId: ctx.actor.id },
        select: { id: true, principalId: true },
      });
      if (!key) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "You have no key with that id.",
        });
      }

      // Both rows, in one transaction, because a principal without its key is a
      // user nobody can sign in as, find, or explain. Key first: it holds the
      // foreign key.
      await ctx.db.$transaction(async (tx) => {
        await tx.apiKey.delete({ where: { id: key.id } });
        await tx.user.delete({ where: { id: key.principalId } });
      });

      return { revoked: true as const };
    }),
});
