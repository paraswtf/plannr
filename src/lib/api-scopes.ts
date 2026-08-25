/**
 * What an API key is allowed to do.
 *
 * Scopes are not a second permission system. They are the same bitfield the
 * rest of the app runs on (`src/lib/permissions.ts`), named the same way and
 * checked by the same procedures — a key simply carries its bits directly
 * instead of inheriting them from roles. That is the whole point: there is one
 * answer to "may this caller do that?", and it does not depend on whether the
 * caller arrived with a cookie or a bearer token.
 *
 * Two rules are particular to keys, and both are enforced in the router that
 * mints them:
 *
 *   - You cannot grant what you do not hold. An admin holds `Administrator`,
 *     so in practice they may grant anything; a coordinator handed
 *     `ManageRoles` could not mint a key that outranks them.
 *   - `Administrator` on a key is refused outright. It is a flag that means
 *     "and everything added in future releases too", which is not a promise
 *     anybody can make on behalf of a third-party app they no longer control.
 *
 * Pure and dependency-free, like the module it builds on: the server, the key
 * editor and the OpenAPI document all read from here.
 */

import {
  PERMISSION_CATALOG,
  PermissionFlags,
  expandPermissions,
  type PermissionName,
} from "./permissions";

/** A scope is spelled exactly like the permission it is. */
export type ScopeName = PermissionName;

/**
 * The bits a key may be granted: everything except `Administrator`.
 *
 * Granting a key "full access to everything, including future features" would
 * mean every release silently widens what an app the institution integrated
 * with two years ago can reach. A key gets an enumerated list, and adding to
 * it is somebody's deliberate act.
 */
export const GRANTABLE_SCOPES: ScopeName[] = PERMISSION_CATALOG.map(
  (entry) => entry.name,
).filter((name) => name !== "Administrator");

const GRANTABLE_SET = new Set<string>(GRANTABLE_SCOPES);

/** Every bit a key may hold, as one mask. */
export const ALL_GRANTABLE_BITS = GRANTABLE_SCOPES.reduce(
  (bits, name) => bits | PermissionFlags[name],
  0n,
);

export const isScopeName = (value: string): value is ScopeName =>
  GRANTABLE_SET.has(value);

/**
 * Scope names → bits, ignoring anything unrecognised.
 *
 * Unknown names are dropped rather than thrown on so that a key minted against
 * a newer build, whose scope list has since shrunk, still authenticates with
 * the bits that do still exist instead of failing shut on a name.
 */
export function scopesToBits(names: readonly string[]): bigint {
  return names.reduce(
    (bits, name) => (isScopeName(name) ? bits | PermissionFlags[name] : bits),
    0n,
  );
}

/**
 * Bits → the scope names in force, implications included.
 *
 * Expanded rather than literal because that is what the key can actually do:
 * a key scoped `ManageAllEvents` reads the timetable whether or not anybody
 * ticked `ViewAllEvents`, and a list that hid this would be lying about the
 * blast radius of the credential.
 */
export function bitsToScopes(bits: bigint): ScopeName[] {
  const effective = expandPermissions(bits);
  return GRANTABLE_SCOPES.filter(
    (name) => (effective & PermissionFlags[name]) === PermissionFlags[name],
  );
}

/** Bits held only by implication — shown ticked but locked in the editor. */
export function impliedScopes(bits: bigint): ScopeName[] {
  const granted = new Set(
    GRANTABLE_SCOPES.filter(
      (name) => (bits & PermissionFlags[name]) === PermissionFlags[name],
    ),
  );
  return bitsToScopes(bits).filter((name) => !granted.has(name));
}

/**
 * Why a set of scopes cannot be granted, or null when it can.
 *
 * Returned rather than thrown so the key editor can grey out the offending
 * checkbox as you tick it, instead of waiting for the save to fail.
 */
export type ScopeDenial =
  | { reason: "UNKNOWN_SCOPE"; scope: string }
  | { reason: "ADMINISTRATOR" }
  | { reason: "NOT_HELD"; scope: ScopeName }
  | { reason: "EMPTY" };

export function denyScopeGrant(
  names: readonly string[],
  granterBits: bigint,
): ScopeDenial | null {
  if (names.length === 0) return { reason: "EMPTY" };

  const granter = expandPermissions(granterBits);
  const isAdmin =
    (granterBits & PermissionFlags.Administrator) !== 0n ||
    (granter & PermissionFlags.Administrator) !== 0n;

  for (const name of names) {
    if (name === "Administrator") return { reason: "ADMINISTRATOR" };
    if (!isScopeName(name)) return { reason: "UNKNOWN_SCOPE", scope: name };
    // An administrator holds every bit, present and future, so the check below
    // would pass anyway — but only because `expandPermissions` says so, and
    // saying it here keeps that dependency legible.
    if (
      !isAdmin &&
      (granter & PermissionFlags[name]) !== PermissionFlags[name]
    ) {
      return { reason: "NOT_HELD", scope: name };
    }
  }
  return null;
}

export function scopeDenialMessage(denial: ScopeDenial): string {
  switch (denial.reason) {
    case "EMPTY":
      return "A key needs at least one scope — one that can do nothing is not a credential, it is a liability.";
    case "ADMINISTRATOR":
      return "Administrator cannot be granted to a key. It would widen the app's access with every future release. Tick the specific scopes it needs instead.";
    case "UNKNOWN_SCOPE":
      return `"${denial.scope}" is not a scope this build knows about.`;
    case "NOT_HELD":
      return `You cannot grant "${denial.scope}" to a key, because you do not hold it yourself.`;
  }
}

/**
 * Scopes grouped for the editor, in the order `PERMISSION_CATEGORIES` lists
 * them. Derived from the permission catalogue so a new permission shows up in
 * the key editor without anybody remembering to add it twice.
 */
export interface ScopeGroup {
  category: string;
  scopes: Array<{ name: ScopeName; label: string; description: string }>;
}

export function scopeCatalog(): ScopeGroup[] {
  const groups = new Map<string, ScopeGroup>();
  for (const entry of PERMISSION_CATALOG) {
    if (!GRANTABLE_SET.has(entry.name)) continue;
    let group = groups.get(entry.category);
    if (!group) {
      group = { category: entry.category, scopes: [] };
      groups.set(entry.category, group);
    }
    group.scopes.push({
      name: entry.name,
      label: entry.label,
      description: entry.description,
    });
  }
  return [...groups.values()];
}
