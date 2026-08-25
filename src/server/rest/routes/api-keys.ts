import { type RouteDef } from "../types";

/**
 * Key management, over HTTP, for people only.
 *
 * Every route below is `actor: "session"`, and that is the whole design of this
 * file. A key must never mint, roll, widen, revoke, delete or even enumerate
 * keys, and the reasoning differs slightly for the writes and the reads.
 *
 * The writes are escalation with extra steps. A key scoped `ManageRoles` would
 * pass every permission check in the app and could then mint a second key
 * holding everything it holds — no wider, in bitfield terms, and yet a leaked
 * token that has learned to reproduce. Revoke the original and its offspring
 * carries on under a name nobody recognises. Rolling, widening and deleting
 * are the same manoeuvre from other angles; and an app that can revoke can
 * switch off every integration the college has in one loop. The procedures
 * themselves refuse a service principal for exactly these reasons — this layer
 * is the earlier, plainer refusal, made before the request costs a database
 * round trip.
 *
 * The reads are quieter but not harmless. Nothing here discloses a secret;
 * `hash` is never selected, and `prefix` and `last4` are public by design. What
 * `GET /api-keys` discloses is the shape of the institution's trust: which
 * integrations exist, what each is allowed to touch, which have gone unused
 * for a year, and which expire on Friday. That is a reconnaissance document,
 * and no legitimate integration has ever needed one. The tRPC procedures leave
 * reads open — a `ManageRoles` holder with a session may list keys, and adding
 * a second refusal there would fork the enforcement story for no gain — so the
 * narrowing happens here, which `RouteDef.scopes` explicitly permits: this
 * layer may be stricter than the app, never looser.
 *
 * Scopes: `ManageRoles` throughout, because that is the bit the procedures
 * check. `GET /api-keys/scopes` is declared `ViewUsers` instead — the
 * procedure behind it gates on nothing more than being signed in, since the
 * catalogue is a static vocabulary derived from `PERMISSION_CATALOG` and says
 * nothing about this institution, but every `ManageRoles` holder already
 * carries `ViewUsers` by implication, so naming the weaker bit costs a
 * legitimate caller nothing and stops the document implying that a corner of
 * `/api-keys` is open to anyone at all.
 */
export const apiKeyRoutes: RouteDef[] = [
  {
    method: "GET",
    path: "/api-keys",
    procedure: "apiKeys.list",
    summary: "List the organisation's API keys",
    description:
      "Newest first, with each key's scopes, status and usage. Never includes the secret — that exists only in the response that minted it.",
    tag: "API keys",
    scopes: ["ManageRoles"],
    actor: "session",
  },
  {
    method: "POST",
    path: "/api-keys",
    procedure: "apiKeys.create",
    summary: "Mint an API key",
    description:
      "Returns `token`, the only copy of the secret that will ever exist: the database keeps a SHA-256 digest and nothing else, so a key that is lost is rolled, not recovered. You cannot grant scopes you do not hold yourself, and `Administrator` cannot be granted to a key at all.",
    tag: "API keys",
    scopes: ["ManageRoles"],
    actor: "session",
    status: 201,
    dangerous: true,
  },
  {
    method: "GET",
    path: "/api-keys/scopes",
    procedure: "apiKeys.scopeCatalog",
    summary: "List the scopes a key can be granted",
    description:
      "The vocabulary itself, grouped as the key editor renders it. Every permission except `Administrator`.",
    tag: "API keys",
    scopes: ["ViewUsers"],
    actor: "session",
    input: "none",
  },
  {
    method: "GET",
    path: "/api-keys/{id}",
    procedure: "apiKeys.byId",
    summary: "Fetch one API key",
    description:
      "One key's name, scopes, status, expiry and rate limit — never its secret, which no endpoint returns twice. People only, for the same reason the list is: an integration reading back the exact bits it was granted is reconnaissance dressed as introspection, and it never needs to ask. A key that wants to know what it may do should try the call and read the refusal; a person auditing an integration should use `GET /api-keys` and `GET /api-keys/{id}/usage`.",
    tag: "API keys",
    scopes: ["ManageRoles"],
    actor: "session",
  },
  {
    method: "PATCH",
    path: "/api-keys/{id}",
    procedure: "apiKeys.update",
    summary: "Edit an API key",
    description:
      "Rename it, re-scope it, change its rate limit or its expiry. Sending `scopes` replaces the set outright rather than adding to it. A revoked key cannot be edited.",
    tag: "API keys",
    scopes: ["ManageRoles"],
    actor: "session",
    dangerous: true,
  },
  {
    method: "POST",
    path: "/api-keys/{id}/roll",
    procedure: "apiKeys.roll",
    summary: "Roll an API key's secret",
    description:
      "Issues a new token on the same key, keeping its identity, its scopes and everything it has already created. The old token stops working immediately, and its prefix stops resolving at all. This — not revoke-and-recreate — is the answer to a token that has leaked.",
    tag: "API keys",
    scopes: ["ManageRoles"],
    actor: "session",
    dangerous: true,
  },
  {
    method: "POST",
    path: "/api-keys/{id}/revoke",
    procedure: "apiKeys.revoke",
    summary: "Revoke an API key",
    description:
      "Permanent and idempotent. The record survives, because everything the key ever scheduled still points at it.",
    tag: "API keys",
    scopes: ["ManageRoles"],
    actor: "session",
    dangerous: true,
  },
  {
    method: "DELETE",
    path: "/api-keys/{id}",
    procedure: "apiKeys.delete",
    summary: "Delete a revoked API key",
    description:
      "Erases the key and its machine identity. Refused unless the key has already been revoked, because deleting it un-attributes every event it created and removes every change request it raised. For keys minted by mistake; revoke is what you want for keys that did work.",
    tag: "API keys",
    scopes: ["ManageRoles"],
    actor: "session",
    dangerous: true,
  },
  {
    method: "GET",
    path: "/api-keys/{id}/usage",
    procedure: "apiKeys.usage",
    summary: "Read an API key's usage",
    description:
      "Request count, last use and IP, the current rate-limit window, and how many events the key has created — the last being the honest measure of how much of the timetable an integration owns.",
    tag: "API keys",
    scopes: ["ManageRoles"],
    actor: "session",
  },
];
