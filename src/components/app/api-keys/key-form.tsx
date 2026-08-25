"use client";

import { Select, type SelectOption } from "~/components/ui/select";
import { DEFAULT_TIMEZONE, formatFullDate } from "~/lib/dates";
import type { ScopeName } from "~/lib/api-scopes";
import { Field, INPUT_CLASS, TextInput } from "./controls";
import { ScopePicker, type ScopeCatalog } from "./scope-picker";

/**
 * The fields a key has, shared by minting one and editing one.
 *
 * One component rather than two forms that drift: the only difference between
 * the two screens is that an existing key's expiry can be left exactly as it
 * is, which is the `keep` option below. Everything else — the name that becomes
 * the principal's name, the scopes, the throttle — is the same question in both
 * places and deserves the same words.
 */

/** How long a key lives. Values are strings because a `<Select>` deals in them. */
export type ExpiryChoice = "keep" | "never" | "30" | "90" | "365";

export interface KeyDraft {
  name: string;
  description: string;
  scopes: ScopeName[];
  /** Requests a minute. Kept as text so the field can be empty mid-edit. */
  rateLimit: string;
  expiry: ExpiryChoice;
}

/**
 * The database's default, mirrored so a new key's field is not blank.
 *
 * 120 a minute is two a second, which is comfortable for a room display
 * polling every few seconds and nowhere near enough to walk the whole
 * timetable in a hurry.
 */
export const DEFAULT_RATE_LIMIT = 120;

/**
 * Ninety days by default, and the default is the argument.
 *
 * A key that never expires is a credential nobody will ever be forced to look
 * at again — the schema's own comment calls the null "a choice the UI makes you
 * make". Offering it, but not first, is that choice: a quarter is long enough
 * that rotating is not a chore and short enough that a forgotten integration
 * announces itself while somebody still remembers what it was for.
 */
export const DEFAULT_EXPIRY: ExpiryChoice = "90";

export const emptyDraft = (): KeyDraft => ({
  name: "",
  description: "",
  scopes: [],
  rateLimit: String(DEFAULT_RATE_LIMIT),
  expiry: DEFAULT_EXPIRY,
});

/** Days from now, or null for "never", or undefined for "leave it alone". */
export function expiryDays(choice: ExpiryChoice): number | null | undefined {
  if (choice === "keep") return undefined;
  if (choice === "never") return null;
  return Number(choice);
}

export function expiryDate(choice: ExpiryChoice): Date | null | undefined {
  const days = expiryDays(choice);
  if (days === undefined || days === null) return days;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** Is this draft complete enough to send? The server checks all of it again. */
export function draftIsValid(draft: KeyDraft): boolean {
  const rate = Number(draft.rateLimit);
  return (
    draft.name.trim().length > 0 &&
    draft.scopes.length > 0 &&
    Number.isInteger(rate) &&
    rate >= 1 &&
    rate <= 10_000
  );
}

function expiryOptions(
  current: Date | null | undefined,
  allowKeep: boolean,
): SelectOption<ExpiryChoice>[] {
  const options: SelectOption<ExpiryChoice>[] = [];
  if (allowKeep) {
    options.push({
      value: "keep",
      label: "Leave unchanged",
      hint: current
        ? `Expires ${formatFullDate(current, DEFAULT_TIMEZONE)}`
        : "Never expires",
    });
  }
  options.push(
    { value: "30", label: "30 days" },
    { value: "90", label: "90 days" },
    { value: "365", label: "365 days" },
    {
      value: "never",
      label: "Never",
      hint: "Nobody will be prompted to look at it again",
    },
  );
  return options;
}

export function KeyFields({
  draft,
  onChange,
  catalog,
  granterPermissions,
  currentExpiry,
  allowKeep = false,
  disabled = false,
}: {
  draft: KeyDraft;
  onChange: (next: KeyDraft) => void;
  catalog: ScopeCatalog;
  granterPermissions: string;
  currentExpiry?: Date | null;
  allowKeep?: boolean;
  disabled?: boolean;
}) {
  const set = <K extends keyof KeyDraft>(field: K, value: KeyDraft[K]) =>
    onChange({ ...draft, [field]: value });

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Name"
        hint="Shown wherever this key acts — “scheduled by” on every lecture it books."
      >
        <TextInput
          value={draft.name}
          onChange={(v) => set("name", v)}
          placeholder="e.g. Foyer room display"
          maxLength={80}
          disabled={disabled}
          // `Field` draws its label as prose, not as a `<label>`, so a control
          // that does not name itself has no name at all — the expiry and the
          // throttle below already say theirs for the same reason.
          ariaLabel="Name"
        />
      </Field>

      <Field
        label="What it is for"
        hint="Optional, and the thing that stops an unfamiliar key being left alone out of caution."
      >
        <textarea
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Which app this is, who runs it, and where to find them."
          maxLength={500}
          rows={2}
          disabled={disabled}
          aria-label="What it is for"
          className={`${INPUT_CLASS} resize-y`}
          style={{ boxShadow: "var(--ring)", opacity: disabled ? 0.6 : 1 }}
        />
      </Field>

      {/* The expiry popover is ~280px wide, which is more than half a phone;
          side by side these two would open a list hanging off the dialog. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Expires">
          <Select
            value={draft.expiry}
            options={expiryOptions(currentExpiry, allowKeep)}
            onChange={(v) => set("expiry", v)}
            ariaLabel="Expires"
          />
        </Field>
        <Field label="Rate limit" hint="Requests a minute, 1–10,000.">
          <input
            type="number"
            min={1}
            max={10_000}
            value={draft.rateLimit}
            onChange={(e) => set("rateLimit", e.target.value)}
            disabled={disabled}
            aria-label="Rate limit, requests a minute"
            className={INPUT_CLASS}
            style={{ boxShadow: "var(--ring)", opacity: disabled ? 0.6 : 1 }}
          />
        </Field>
      </div>

      <ScopePicker
        catalog={catalog}
        value={draft.scopes}
        onChange={(v) => set("scopes", v)}
        granterPermissions={granterPermissions}
        disabled={disabled}
      />
    </div>
  );
}
