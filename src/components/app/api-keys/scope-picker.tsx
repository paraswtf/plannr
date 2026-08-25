"use client";

import { useMemo } from "react";

import { Icon } from "~/components/ui/icon";
import {
  bitsToScopes,
  impliedScopes,
  scopesToBits,
  type ScopeName,
} from "~/lib/api-scopes";
import { expandPermissions, PermissionFlags } from "~/lib/permissions";
import type { RouterOutputs } from "~/trpc/react";

/**
 * What a key is allowed to do, as a set of checkboxes.
 *
 * Deliberately the same control as {@link PermissionEditor} in the people
 * screen, because it is the same question — a scope *is* a permission — and
 * anybody who has granted a role here should recognise this immediately. Two
 * things are different, and both are about the fact that a key is a credential
 * handed to somebody else:
 *
 *   - A scope the granter does not hold is drawn but unavailable. `denyScopeGrant`
 *     refuses it on the server with a sentence; showing it greyed with that
 *     sentence attached is the same refusal, arriving before the save rather
 *     than after it. Hiding it instead would leave an admin wondering why the
 *     scope their colleague granted is not in the list.
 *   - `Administrator` is not in the catalogue at all, so there is nothing to
 *     draw. That is `GRANTABLE_SCOPES`' doing, not this component's.
 */

export type ScopeCatalog = RouterOutputs["apiKeys"]["scopeCatalog"];

/**
 * The scopes actually granted, out of a set that has been closed under
 * implication.
 *
 * `apiKeys.list` reports scopes expanded — a key scoped `ManageAllEvents` is
 * listed as holding `ViewAllEvents` too, because it does — which is the honest
 * answer to "what can this key reach?" and the wrong starting point for an
 * editor: every box would arrive ticked-and-granted, and unticking the one
 * doing the work would leave its implications behind as free-standing grants.
 * So the editor recovers a generating set first, by dropping anything another
 * member of the set already implies. Expanding what comes back out gives the
 * original list, so nothing is lost and nothing is quietly widened.
 *
 * Assumes the implication graph has no cycles, which `PERMISSION_IMPLIES` does
 * not: two scopes implying each other would both look redundant and both be
 * dropped.
 */
export function grantedScopes(scopes: readonly ScopeName[]): ScopeName[] {
  return scopes.filter(
    (name) =>
      !scopes.some(
        (other) =>
          other !== name &&
          (expandPermissions(PermissionFlags[other]) &
            PermissionFlags[name]) !==
            0n,
      ),
  );
}

export function ScopePicker({
  catalog,
  value,
  onChange,
  granterPermissions,
  disabled = false,
}: {
  catalog: ScopeCatalog;
  /** The scopes granted outright. Implications are added for display only. */
  value: ScopeName[];
  onChange: (next: ScopeName[]) => void;
  /** The permissions of the person doing the granting, as a decimal string. */
  granterPermissions: string;
  disabled?: boolean;
}) {
  const granted = useMemo(() => new Set(value), [value]);
  const grantedBits = useMemo(() => scopesToBits(value), [value]);
  const locked = useMemo(
    () => new Set(impliedScopes(grantedBits)),
    [grantedBits],
  );
  const held = useMemo(
    () => expandPermissions(BigInt(granterPermissions)),
    [granterPermissions],
  );

  /** Which ticked scope is responsible for `name` being in force. */
  const sourceOf = (name: ScopeName): ScopeName | null =>
    value.find(
      (other) =>
        other !== name &&
        (expandPermissions(PermissionFlags[other]) & PermissionFlags[name]) !==
          0n,
    ) ?? null;

  const labels = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of catalog) {
      for (const scope of group.scopes) map.set(scope.name, scope.label);
    }
    return map;
  }, [catalog]);

  const toggle = (name: ScopeName) => {
    if (granted.has(name)) {
      onChange(value.filter((s) => s !== name));
      return;
    }
    // Ticking a scope that already implies ones you ticked earlier makes those
    // earlier grants redundant, and leaving them in would mean unticking the
    // broad one silently left the narrow ones behind. Kept minimal instead, so
    // the set of ticked boxes always reads as the reason for everything below
    // it.
    onChange(grantedScopes([...value, name]));
  };

  const chosen = bitsToScopes(grantedBits).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted text-[12.5px] font-semibold">Scopes</span>
        <span className="text-faint font-mono text-[11.5px]">
          {chosen === 0 ? "none chosen" : `${chosen} in force`}
        </span>
      </div>

      {catalog.map((group) => (
        <div key={group.category}>
          <div className="text-faint mb-2 font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
            {group.category}
          </div>
          <div className="flex flex-col gap-1">
            {group.scopes.map((scope) => {
              const name = scope.name;
              const bit = PermissionFlags[name];
              const isGranted = granted.has(name);
              const isImplied = locked.has(name);
              const checked = isGranted || isImplied;
              const withheld = (held & bit) !== bit;
              const immovable = disabled || isImplied || withheld;
              const source = isImplied ? sourceOf(name) : null;

              return (
                <label
                  key={name}
                  className="flex items-start gap-3 rounded-[10px] px-3 py-2.5"
                  style={{
                    background: checked
                      ? "rgba(68,88,121,0.06)"
                      : "transparent",
                    cursor: immovable ? "default" : "pointer",
                    opacity: disabled ? 0.6 : withheld ? 0.45 : 1,
                  }}
                >
                  <span
                    className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px]"
                    style={{
                      background: checked ? "var(--slate)" : "var(--surface)",
                      boxShadow: checked ? "none" : "var(--ring)",
                      opacity: isImplied ? 0.55 : 1,
                    }}
                  >
                    {checked && (
                      <Icon name="check" size={12} color="#fff" stroke={3} />
                    )}
                  </span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    disabled={immovable}
                    onChange={() => toggle(name)}
                  />
                  <span className="min-w-0">
                    <span className="text-title block text-[13.5px] font-semibold">
                      {scope.label}
                      {source && (
                        <span className="text-faint ml-2 text-[11.5px] font-medium">
                          granted by {labels.get(source) ?? source}
                        </span>
                      )}
                    </span>
                    <span className="text-muted block text-[12.5px]">
                      {withheld
                        ? "You cannot grant this to a key, because you do not hold it yourself."
                        : scope.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
