import "server-only";

import type { Session } from "next-auth";

import { intersectPermissions } from "~/lib/permissions";
import { db } from "~/server/db";
import { Prisma } from "../../../generated/prisma";
import { bearerFrom, parseToken, verifySecret } from "./secret";

/**
 * Turning a bearer token into an actor.
 *
 * The result is a `Session` — the very same object the cookie path produces —
 * because that is what lets one set of tRPC procedures serve both callers. A
 * key does not get a parallel authorisation path where a rule might be
 * forgotten; it gets a session whose user happens to be a machine, and every
 * `permissionProcedure` in the app goes on doing exactly what it already does.
 *
 * The machine's bits come from the key's `scopes` column and nowhere else. Its
 * principal holds no roles, so there is nothing for them to be widened by, and
 * narrowing a key is a single write that takes effect on the next request.
 */

export interface ApiKeyIdentity {
  id: string;
  name: string;
  prefix: string;
  principalId: string;
  /** The person a personal key speaks for; null for a service key. */
  ownerId: string | null;
}

export type ApiAuthFailure =
  | "MALFORMED"
  | "UNKNOWN_KEY"
  | "BAD_SECRET"
  | "REVOKED"
  | "EXPIRED"
  | "PRINCIPAL_INACTIVE"
  | "RATE_LIMITED";

export type ApiAuthResult =
  | { ok: true; session: Session; key: ApiKeyIdentity; rate: RateVerdict }
  | { ok: false; failure: ApiAuthFailure; retryAfterSeconds?: number };

export interface RateVerdict {
  limit: number;
  remaining: number;
  /** Seconds until the current window rolls over. */
  resetSeconds: number;
}

/** How long a fixed rate-limit window runs. */
const WINDOW_SECONDS = 60;

/**
 * Authenticates the `Authorization` header, or reports why it could not.
 *
 * Returns null — rather than a failure — when there is no bearer token at all,
 * so the caller can fall through to cookie authentication instead of turning
 * an ordinary browser request into a 401 about API keys.
 */
export async function authenticateApiKey(
  headers: Headers,
  ip: string | null,
): Promise<ApiAuthResult | null> {
  const token = bearerFrom(headers);
  if (!token) return null;

  const parsed = parseToken(token);
  if (!parsed) return { ok: false, failure: "MALFORMED" };

  const key = await db.apiKey.findUnique({
    where: { prefix: parsed.prefix },
    select: {
      id: true,
      orgId: true,
      name: true,
      prefix: true,
      hash: true,
      scopes: true,
      expiresAt: true,
      revokedAt: true,
      rateLimitPerMinute: true,
      principalId: true,
      principal: {
        select: { id: true, name: true, email: true, isActive: true },
      },
      ownerId: true,
      // A personal key's authority is its owner's, and it is read here rather
      // than copied onto the key at mint time so that losing a role narrows
      // every key that person holds on the very next request.
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          permissions: true,
          roles: { select: { role: { select: { permissions: true } } } },
        },
      },
    },
  });

  // Verify the secret before reporting anything else about the key. Answering
  // "revoked" to a wrong secret would confirm that the prefix is real, which is
  // a fact somebody probing with guessed prefixes should not get for free.
  if (!key) return { ok: false, failure: "UNKNOWN_KEY" };
  if (!verifySecret(parsed.secret, key.hash)) {
    return { ok: false, failure: "BAD_SECRET" };
  }

  if (key.revokedAt) return { ok: false, failure: "REVOKED" };
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
    return { ok: false, failure: "EXPIRED" };
  }
  // Deactivating the principal is the emergency stop that does not destroy the
  // audit trail the way deleting the key would.
  if (!key.principal.isActive) {
    return { ok: false, failure: "PRINCIPAL_INACTIVE" };
  }
  // And a personal key is only ever as live as the person it speaks for.
  // Deactivating somebody has to switch off every credential they hold, or
  // "remove their access" is a thing the console claims and does not do.
  if (key.ownerId && !key.owner?.isActive) {
    return { ok: false, failure: "PRINCIPAL_INACTIVE" };
  }

  const rate = await recordUse(key.id, key.rateLimitPerMinute, ip);
  if (rate.remaining < 0) {
    return {
      ok: false,
      failure: "RATE_LIMITED",
      retryAfterSeconds: rate.resetSeconds,
    };
  }

  const identity: ApiKeyIdentity = {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    principalId: key.principalId,
    ownerId: key.ownerId,
  };

  /**
   * Who the session is for, and what it may do.
   *
   * A service key is its own principal: a machine with no roles, whose entire
   * authority is the `scopes` column. A personal key is the opposite — it *is*
   * the person, so the session carries their id, and every procedure that asks
   * "what is mine?" gets the right answer without knowing a key was involved.
   *
   * The authority of a personal key is the intersection of two live things:
   * what the key was granted, and what its owner holds right now. Neither half
   * can be widened by the other. Granting a key `ManageAllEvents` gives a
   * student nothing, because the intersection is empty; and a lecturer who
   * loses a role loses it from every key they hold on the next request, with no
   * revocation and no migration. The owner's own bits are assembled here the
   * same way the cookie path assembles them in the session callback — personal
   * grants unioned with every role — because two answers to "what may this
   * person do?" is one answer too many.
   */
  const owner = key.owner;
  const personal = key.ownerId !== null && owner !== null;

  const ownerBits = owner
    ? owner.roles.reduce(
        (bits, held) => bits | held.role.permissions,
        owner.permissions,
      )
    : 0n;

  return {
    ok: true,
    key: identity,
    rate,
    session: {
      // A key's authority is checked on every request against live rows, so
      // this is a formality; it is filled in rather than left blank because
      // `Session` requires it and a date in the past would read as expired.
      expires: new Date(Date.now() + WINDOW_SECONDS * 1000).toISOString(),
      user: {
        // No non-null assertions: `personal` is a const whose definition
        // includes `owner !== null`, so the narrowing carries through.
        id: personal ? owner.id : key.principal.id,
        orgId: key.orgId,
        name: personal
          ? (owner.name ?? key.name)
          : (key.principal.name ?? key.name),
        email: personal ? owner.email : key.principal.email,
        // No roles on the session either way. A service key has none, and a
        // personal key's are already folded into the bits below — listing them
        // as well would invite somebody to check the list rather than the
        // intersection, and the two disagree by design.
        roles: [],
        permissions: (personal
          ? intersectPermissions(ownerBits, key.scopes)
          : key.scopes
        ).toString(),
        isActive: true,
        // A personal key is a person, and the endpoints that answer "my week"
        // must treat it as one. What it is *not* is a session somebody is
        // sitting behind, which is a different question and is answered by
        // `viaApiKey` — see the note on it in the auth types.
        isServiceAccount: !personal,
        viaApiKey: true,
      },
    },
  };
}

/**
 * Stamps the key as used and advances its rate-limit window, atomically.
 *
 * One statement, because read-then-write would let two concurrent requests
 * both see the same count and both be admitted. On serverless there is no
 * shared process to hold a counter in, so the row is the only place the window
 * can live — and since `lastUsedAt` was going to cost a write anyway, the
 * throttle rides along for free.
 *
 * `remaining` comes back negative when the request should be refused; the
 * increment still happened, which is what keeps a client that ignores 429 from
 * escaping the window by hammering it.
 */
async function recordUse(
  keyId: string,
  limit: number,
  ip: string | null,
): Promise<RateVerdict> {
  const rows = await db.$queryRaw<
    Array<{ windowCount: number; windowStartedAt: Date }>
  >(Prisma.sql`
    UPDATE "ApiKey"
    SET
      "lastUsedAt"      = NOW(),
      "lastUsedIp"      = ${ip},
      "requestCount"    = "requestCount" + 1,
      "windowStartedAt" = CASE
        WHEN "windowStartedAt" IS NULL
          OR "windowStartedAt" < NOW() - ${`${WINDOW_SECONDS} seconds`}::interval
        THEN NOW()
        ELSE "windowStartedAt"
      END,
      "windowCount"     = CASE
        WHEN "windowStartedAt" IS NULL
          OR "windowStartedAt" < NOW() - ${`${WINDOW_SECONDS} seconds`}::interval
        THEN 1
        ELSE "windowCount" + 1
      END
    WHERE "id" = ${keyId}
    RETURNING "windowCount", "windowStartedAt"
  `);

  const row = rows[0];
  if (!row) {
    // The key was deleted between the lookup and here. Treat it as spent
    // rather than inventing headroom.
    return { limit, remaining: -1, resetSeconds: WINDOW_SECONDS };
  }

  const elapsed = Math.floor(
    (Date.now() - row.windowStartedAt.getTime()) / 1000,
  );
  return {
    limit,
    remaining: limit - row.windowCount,
    resetSeconds: Math.max(1, WINDOW_SECONDS - elapsed),
  };
}

/** What the caller should be told, without confirming anything it did not already know. */
export const API_AUTH_FAILURE: Record<
  ApiAuthFailure,
  { status: number; code: string; message: string }
> = {
  MALFORMED: {
    status: 401,
    code: "invalid_token",
    message:
      "The Authorization header is not a Plannr API key. Expected `Authorization: Bearer plk_live_<prefix>.<secret>`.",
  },
  // Deliberately identical to BAD_SECRET: a distinguishable answer would let
  // somebody enumerate which prefixes exist.
  UNKNOWN_KEY: {
    status: 401,
    code: "invalid_token",
    message: "That API key is not valid.",
  },
  BAD_SECRET: {
    status: 401,
    code: "invalid_token",
    message: "That API key is not valid.",
  },
  REVOKED: {
    status: 401,
    code: "key_revoked",
    message:
      "This API key has been revoked. Ask an administrator for a new one.",
  },
  EXPIRED: {
    status: 401,
    code: "key_expired",
    message: "This API key has expired. Ask an administrator to roll it.",
  },
  PRINCIPAL_INACTIVE: {
    status: 403,
    code: "key_suspended",
    message: "This API key has been suspended.",
  },
  RATE_LIMITED: {
    status: 429,
    code: "rate_limited",
    message: "Too many requests. Slow down and retry after the window resets.",
  },
};
