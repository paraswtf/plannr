"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { Icon, type IconName } from "./icon";

/**
 * Text fields, and the label-hint-error frame they sit in.
 *
 * The field is white and ringed like a card, ringed harder under the pointer,
 * and on focus the ring thickens to slate with a soft halo outside it — a
 * state of its own rather than the browser's outline, which is why every field
 * opts out of the global focus ring with `outline-none`. An invalid field
 * (`aria-invalid`) draws the same shape in red, so the error is visible on the
 * field itself and not only in the line underneath.
 *
 * Sizes follow the buttons: at least 40px tall where the pointer is a finger,
 * so a field and the button beside it are always the same height.
 */

export type FieldSize = "sm" | "md";

const FIELD_BASE =
  "w-full min-w-0 rounded-[var(--radius-btn)] bg-field text-title shadow-[inset_0_0_0_1px_var(--field-line)] transition-[box-shadow,background-color] duration-150 outline-none placeholder:text-placeholder hover:shadow-[inset_0_0_0_1px_var(--field-line-hover)] focus:shadow-[inset_0_0_0_1.5px_var(--focus),0_0_0_3px_var(--focus-halo)] disabled:cursor-not-allowed disabled:bg-paper disabled:text-muted aria-[invalid=true]:shadow-[inset_0_0_0_1.5px_var(--red),0_0_0_3px_var(--bad-halo)]";

const FIELD_SIZES: Record<FieldSize, string> = {
  sm: "min-h-10 px-2.5 text-xs lg:min-h-8",
  md: "min-h-10 px-3 text-sm lg:min-h-9",
};

/**
 * The classes for a text field, for a control that is not an `<input>` but
 * should look like one — a trigger that opens a picker, a read-only value.
 */
export function fieldClass(size: FieldSize = "md", extra = "") {
  return `${FIELD_BASE} ${FIELD_SIZES[size]} ${extra}`;
}

/**
 * The classes for a button that opens a picker — a select, a date, a person —
 * drawn as a field so a form reads as one column of the same boxes.
 *
 * It differs from a text field in two places. Focus shows only for a keyboard
 * (`focus-visible`), because a button takes focus on every click and a ring
 * that lit up each time a menu was opened with the mouse would be noise. And
 * an open trigger (`aria-expanded`) wears the focus ring for as long as its
 * panel is up, so the field the menu belongs to is obvious while choosing.
 */
export function triggerClass(size: FieldSize = "md", extra = "") {
  return `flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-btn)] bg-field text-left font-medium text-title shadow-[inset_0_0_0_1px_var(--field-line)] transition-[box-shadow,background-color] duration-150 outline-none hover:shadow-[inset_0_0_0_1px_var(--field-line-hover)] focus-visible:shadow-[inset_0_0_0_1.5px_var(--focus),0_0_0_3px_var(--focus-halo)] aria-expanded:shadow-[inset_0_0_0_1.5px_var(--focus),0_0_0_3px_var(--focus-halo)] disabled:cursor-not-allowed disabled:opacity-60 ${FIELD_SIZES[size]} ${extra}`;
}

export interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> {
  size?: FieldSize;
  /** A glyph inside the field's leading edge: a search lens, a clock. */
  icon?: IconName;
  invalid?: boolean;
  /**
   * Classes for the `<input>` itself when `icon` has moved `className` onto
   * the wrapper — a font size the field needs at one width, say. Without an
   * icon there is no wrapper, and `className` already lands on the input.
   */
  inputClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = "md", icon, invalid, className = "", inputClassName = "", ...rest },
  ref,
) {
  const field = (
    <input
      ref={ref}
      aria-invalid={invalid ? true : undefined}
      className={fieldClass(
        size,
        `${icon ? "pl-9" : ""} ${icon ? "" : className} ${inputClassName}`,
      )}
      {...rest}
    />
  );
  if (!icon) return field;
  // The wrapper takes the caller's layout classes (a width, a flex basis), so
  // the field inside it can stay `w-full` and the icon stays in its corner.
  return (
    <div className={`relative ${className}`}>
      <Icon
        name={icon}
        size={15}
        stroke={2}
        color="var(--faint)"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
      />
      {field}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /**
   * Whether the reader may drag the field taller. On by default, since a note
   * is as long as its writer makes it; off for a field whose height the layout
   * around it depends on.
   */
  resize?: "y" | "none";
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { invalid, className = "", rows = 3, resize = "y", ...rest },
    ref,
  ) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        aria-invalid={invalid ? true : undefined}
        className={`${FIELD_BASE} block ${resize === "none" ? "resize-none" : "resize-y"} px-3 py-2 text-sm leading-relaxed ${className}`}
        {...rest}
      />
    );
  },
);

/**
 * A label above its control, an optional hint, and the error when there is
 * one — in that order, and with the error replacing the hint rather than
 * stacking under it, so a form does not grow a line taller every time
 * something is wrong with it.
 *
 * Pass a render function to get the generated id, so the label is tied to the
 * field without the caller having to invent one:
 *
 *   <Field label="Room code">{(id) => <Input id={id} … />}</Field>
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  optional = false,
  className = "",
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** The control's id, when the caller already has one. */
  htmlFor?: string;
  /** Say so beside the label, rather than starring every required field. */
  optional?: boolean;
  className?: string;
  children: ReactNode | ((id: string) => ReactNode);
}) {
  const generated = useId();
  const id = htmlFor ?? generated;
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-title text-xs font-semibold">
        {label}
        {optional && (
          <span className="text-faint ml-1.5 font-normal">optional</span>
        )}
      </label>
      {typeof children === "function" ? children(id) : children}
      {error ? (
        <p className="text-bad text-xs font-medium">{error}</p>
      ) : hint ? (
        <p className="text-faint text-xs">{hint}</p>
      ) : null}
    </div>
  );
}
