"use client";

import { useMemo } from "react";

import { Icon } from "~/components/ui/icon";
import {
  expandPermissions,
  impliedPermissions,
  PermissionFlags,
  PERMISSION_CATALOG,
  PERMISSION_CATEGORIES,
} from "~/lib/permissions";

/**
 * Permission picker.
 *
 * The load-bearing behaviour: a permission that is implied by another shows as
 * ticked but disabled, with a note saying which permission granted it. Without
 * that, someone ticks "manage all events", sees "view all events" stay
 * unticked, ticks it too, and is left unsure which one is doing the work.
 */
export function PermissionEditor({
  value,
  onChange,
  disabled = false,
}: {
  /** Permissions as granted, decimal string. */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const granted = BigInt(value);
  const implied = useMemo(() => impliedPermissions(granted), [granted]);
  const isAdmin = (granted & PermissionFlags.Administrator) !== 0n;

  /** Which ticked permission is responsible for implying `bit`. */
  const sourceOf = (bit: bigint): string | null => {
    if (isAdmin) return "Administrator";
    for (const p of PERMISSION_CATALOG) {
      const flag = PermissionFlags[p.name];
      if (flag === bit) continue;
      if ((granted & flag) === 0n) continue;
      if ((expandPermissions(flag) & bit) !== 0n) return p.label;
    }
    return null;
  };

  const toggle = (bit: bigint) => {
    onChange(
      ((granted & bit) !== 0n ? granted & ~bit : granted | bit).toString(),
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {PERMISSION_CATEGORIES.map((category) => {
        const items = PERMISSION_CATALOG.filter((p) => p.category === category);
        if (items.length === 0) return null;

        return (
          <div key={category}>
            <div className="text-faint mb-2 font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
              {category}
            </div>
            <div className="flex flex-col gap-1">
              {items.map((p) => {
                const bit = PermissionFlags[p.name];
                const checkedDirectly = (granted & bit) !== 0n;
                const isImplied = !checkedDirectly && (implied & bit) !== 0n;
                const checked = checkedDirectly || isImplied;
                const lockedByImplication = isImplied && !disabled;
                const source = isImplied ? sourceOf(bit) : null;

                return (
                  <label
                    key={p.name}
                    className="flex cursor-pointer items-start gap-3 rounded-[10px] px-3 py-2.5"
                    style={{
                      background: checked
                        ? "rgba(68,88,121,0.06)"
                        : "transparent",
                      cursor:
                        disabled || lockedByImplication ? "default" : "pointer",
                      opacity: disabled ? 0.6 : 1,
                    }}
                  >
                    <span
                      className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px]"
                      style={{
                        background: checked ? "var(--slate)" : "var(--surface)",
                        boxShadow: checked ? "none" : "var(--ring)",
                        opacity: lockedByImplication ? 0.55 : 1,
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
                      disabled={disabled || lockedByImplication}
                      onChange={() => toggle(bit)}
                    />
                    <span className="min-w-0">
                      <span className="text-title block text-[13.5px] font-semibold">
                        {p.label}
                        {isImplied && source && (
                          <span className="text-faint ml-2 text-[11.5px] font-medium">
                            granted by {source}
                          </span>
                        )}
                      </span>
                      <span className="text-muted block text-[12.5px]">
                        {p.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
