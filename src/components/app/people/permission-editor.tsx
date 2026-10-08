"use client";

import { useMemo } from "react";

import { Checkbox } from "~/components/ui/checkbox";
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
        // How many of the category are on, ticked or implied: a sense of where
        // the list stands without scrolling through twenty-odd rows to count.
        const on = items.filter(
          (p) => ((granted | implied) & PermissionFlags[p.name]) !== 0n,
        ).length;

        return (
          <div key={category}>
            {/*
             * Sentence case in the body face, with the count beside it, where
             * this used to be spaced-out mono capitals: a heading to read, not
             * a label to decode.
             */}
            <div className="text-title mb-1.5 px-3 text-sm font-semibold">
              {category}
              <span className="text-faint ml-2 font-mono text-xs font-normal tabular-nums">
                {on} of {items.length}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {items.map((p) => {
                const bit = PermissionFlags[p.name];
                const checkedDirectly = (granted & bit) !== 0n;
                const isImplied = !checkedDirectly && (implied & bit) !== 0n;
                const checked = checkedDirectly || isImplied;
                const lockedByImplication = isImplied && !disabled;
                const source = isImplied ? sourceOf(bit) : null;
                const interactive = !disabled && !lockedByImplication;

                /*
                 * Implied by another permission: the box is ticked and locked,
                 * with the note beside the name saying which one granted it, so
                 * it reads as "on, but not your doing". The shared checkbox
                 * dims a disabled row, which is the cue that it cannot be
                 * changed here.
                 */
                return (
                  <Checkbox
                    key={p.name}
                    checked={checked}
                    disabled={disabled || lockedByImplication}
                    onChange={() => toggle(bit)}
                    label={
                      <>
                        {p.label}
                        {isImplied && source && (
                          <span className="text-faint ml-2 text-xs font-medium">
                            granted by {source}
                          </span>
                        )}
                      </>
                    }
                    description={p.description}
                    className={`gap-3 rounded-[10px] px-3 transition-colors duration-150 ${
                      checked
                        ? "bg-tint"
                        : interactive
                          ? "hover:bg-tint-hover"
                          : ""
                    }`}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
