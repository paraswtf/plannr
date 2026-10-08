"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { Icon } from "./icon";

/**
 * A checkbox, drawn the house way, with the real one doing the work.
 *
 * The native input stays in the page — visually hidden, never removed — so the
 * keyboard, the form, the screen reader and the indeterminate state all come
 * from the platform. The 18px box beside it is only a picture of that input:
 * it follows `:checked`, `:indeterminate`, `:focus-visible` and `:disabled`
 * through `peer-*` classes, which is why the input has to come first.
 *
 * Checked is a slate box with a white tick, not only a colour change, so the
 * state survives for somebody who cannot tell the slate from the grey. The row
 * is at least 40px tall below the sidebar's breakpoint, the label included in
 * the target, because a lone 18px square is a hard thing to hit on a phone.
 *
 * Three screens drew their own before this existed — the people directory,
 * the permission editor and the API key scopes — each slightly differently.
 */
export function Checkbox({
  checked,
  onChange,
  indeterminate = false,
  disabled = false,
  label,
  description,
  id,
  name,
  value,
  ariaLabel,
  className = "",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Some but not all of what this box stands for, as on a "select all". */
  indeterminate?: boolean;
  disabled?: boolean;
  /** Visible label. Omit only with `ariaLabel`, as in a table's first column. */
  label?: ReactNode;
  /** A second line under the label, for what the option means. */
  description?: ReactNode;
  id?: string;
  name?: string;
  value?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  const input = useRef<HTMLInputElement>(null);

  // `indeterminate` is a property, never an attribute, so it can only be set
  // from script.
  useEffect(() => {
    if (input.current) input.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const mark = indeterminate ? "minus" : "check";

  return (
    <label
      htmlFor={inputId}
      className={`group relative flex min-h-10 items-start gap-2.5 py-2 lg:min-h-0 lg:py-1 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      } ${className}`}
    >
      <input
        ref={input}
        id={inputId}
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="bg-surface peer-checked:bg-slate peer-indeterminate:bg-slate peer-focus-visible:outline-focus mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-white shadow-[inset_0_0_0_1px_var(--field-line)] transition-[background-color,box-shadow] duration-150 group-hover:shadow-[inset_0_0_0_1px_var(--field-line-hover)] peer-checked:shadow-none peer-indeterminate:shadow-none peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-solid [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100 peer-indeterminate:[&>svg]:opacity-100"
      >
        {mark === "check" ? (
          <Icon name="check" size={12} stroke={3} />
        ) : (
          <span className="h-[2px] w-2 rounded-full bg-white" />
        )}
      </span>
      {(label ?? description) && (
        <span className="min-w-0">
          {label && (
            <span className="text-title block text-sm leading-[18px] font-medium">
              {label}
            </span>
          )}
          {description && (
            <span className="text-muted mt-0.5 block text-xs">
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
}
