import { forwardRef, type ButtonHTMLAttributes } from "react";

import { Icon, type IconName } from "./icon";

/**
 * The app's buttons.
 *
 * There was no button component until the redesign: every screen drew its own,
 * from inline styles, and so there were a dozen slightly different slate
 * buttons, quiet buttons that were quiet in four different ways, and one
 * "Approve" that was white text on nothing at all because the class it asked
 * for had never existed. One component now owns the shape, the states and the
 * touch size, and a screen only says which kind of button it means.
 *
 * Which variant to reach for:
 *
 *   primary       the one thing this screen or dialog is for. One per view.
 *   secondary     an alternative to it, or a peer action in a toolbar
 *   quiet         a frequent, low-stakes action that should still look pressable
 *   ghost         toolbar and inline actions that would be noise as filled shapes
 *   danger        the final, irreversible step: delete, revoke, cancel the class
 *   danger-quiet  the way *towards* a destructive step, before it is confirmed
 *
 * Every size is at least 40px tall below the sidebar's breakpoint, where the
 * pointer is a finger, and settles to its drawn height above it.
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "quiet"
  | "ghost"
  | "danger"
  | "danger-quiet"
  | "link";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-btn)] font-semibold whitespace-nowrap select-none transition-[background-color,box-shadow,color,scale] duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-10 px-3 text-xs lg:min-h-8",
  md: "min-h-10 px-4 text-sm lg:min-h-9",
  lg: "min-h-12 px-5 text-base",
};

/** Icon size per button size: about the cap height plus the stroke. */
const ICON: Record<ButtonSize, number> = { sm: 14, md: 15, lg: 17 };

/*
 * The filled variants carry a hairline of light along their top edge and a
 * shadow cast in their own hue, which is what makes a flat fill read as a
 * thing that can be pressed rather than as a coloured label.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-slate text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(22,32,51,0.16),0_2px_8px_-2px_rgba(68,88,121,0.4)] hover:bg-slate-hover",
  secondary:
    "bg-surface text-title shadow-[inset_0_0_0_1px_var(--card-ring),0_1px_2px_rgba(22,32,51,0.05)] hover:bg-surface-hover",
  quiet: "bg-tint text-slate-ink hover:bg-tint-strong",
  ghost: "text-muted hover:bg-tint hover:text-title",
  danger:
    "bg-red-strong text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(22,32,51,0.16),0_2px_8px_-2px_rgba(196,47,62,0.4)] hover:bg-red-hover",
  "danger-quiet": "bg-bad-wash text-bad hover:bg-bad-wash-strong",
  // Text that is a button: an inline "More", a disclosure in a sentence. No
  // fill and no height of its own, so it sits on the line it is in; the
  // invisible pad around it is the touch target a 13px word cannot be.
  link: "relative min-h-0! px-0! text-slate underline-offset-[3px] after:absolute after:-inset-x-1.5 after:-inset-y-2 after:content-[''] hover:underline",
};

/*
 * A toggle — a button that stays down. `aria-pressed` is what a screen reader
 * hears, so it is also what draws the state: a pressed secondary, quiet or
 * ghost button takes the selected wash and slate ink with a hairline, the same
 * way a chosen row or segment does.
 */
const PRESSED =
  "aria-pressed:bg-tint-selected aria-pressed:text-slate-ink aria-pressed:shadow-[inset_0_0_0_1px_var(--info-line)]";

/**
 * The classes for a button of this kind, for an element that is not a
 * `<button>` — a `<Link>` that should look like one, mostly.
 */
export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  extra = "",
) {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${PRESSED} ${extra}`;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Drawn before the label. */
  icon?: IconName;
  /** Drawn after the label: an arrow that says where the button goes. */
  iconAfter?: IconName;
  /** Stretch to the width of the container, as on a phone-width form. */
  block?: boolean;
  /**
   * Make it a toggle: sets `aria-pressed` and draws the pressed state. Leave
   * undefined for an ordinary button, which then has no `aria-pressed` at all.
   */
  pressed?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      icon,
      iconAfter,
      block = false,
      pressed,
      className = "",
      // A button in a form submits it unless told otherwise, which is the
      // wrong default for every button in this app that is not the form's
      // own submit — so the default is flipped and a submit says so.
      type = "button",
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-pressed={pressed}
        className={buttonClass(
          variant,
          size,
          `${block ? "w-full" : ""} ${className}`,
        )}
        {...rest}
      >
        {icon && <Icon name={icon} size={ICON[size]} stroke={2} />}
        {children}
        {iconAfter && <Icon name={iconAfter} size={ICON[size]} stroke={2} />}
      </button>
    );
  },
);

export type IconButtonVariant = "ghost" | "quiet" | "secondary" | "danger";
export type IconButtonSize = "xs" | "sm" | "md";

const ICON_VARIANTS: Record<IconButtonVariant, string> = {
  ghost: "text-muted hover:bg-tint hover:text-title",
  quiet: "bg-tint text-slate hover:bg-tint-strong",
  secondary:
    "bg-surface text-muted shadow-[inset_0_0_0_1px_var(--card-ring)] hover:bg-surface-hover hover:text-title",
  // A row's Remove: quiet until it is pointed at, and then plainly the
  // destructive one — never red at rest, where a column of them would be a
  // column of alarms.
  danger: "text-muted hover:bg-bad-wash hover:text-bad",
};

/*
 * `xs` is for a control nested inside another control — the steppers inside
 * a time field — where a 32px button would be taller than the field it sits
 * in. It is still 40px wherever the pointer is a finger.
 */
const ICON_SIZES: Record<IconButtonSize, string> = {
  xs: "h-10 w-10 lg:h-7 lg:w-7",
  sm: "h-10 w-10 lg:h-8 lg:w-8",
  md: "h-10 w-10 lg:h-9 lg:w-9",
};

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  icon: IconName;
  /**
   * What the button does, in words. Required: it is the button's accessible
   * name, and its tooltip, because an icon on its own names nothing.
   */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Override the glyph's size when the icon is optically small or large. */
  iconSize?: number;
}

/**
 * The classes for an icon button, for an element that is not a `<button>` — a
 * `<Link>` that does one thing and shows only a glyph, like signing out. The
 * caller owes it the same `aria-label` and `title` the component sets.
 */
export function iconButtonClass(
  variant: IconButtonVariant = "ghost",
  size: IconButtonSize = "md",
  extra = "",
) {
  return `inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-btn)] transition-[background-color,box-shadow,color,scale] duration-150 ease-out active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-50 ${ICON_SIZES[size]} ${ICON_VARIANTS[variant]} ${extra}`;
}

/** A square button with only an icon in it: close, fold, more, previous. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon,
      label,
      variant = "ghost",
      size = "md",
      iconSize,
      className = "",
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={iconButtonClass(variant, size, className)}
        {...rest}
      >
        <Icon
          name={icon}
          size={iconSize ?? (size === "md" ? 16 : size === "sm" ? 15 : 14)}
          stroke={2}
        />
      </button>
    );
  },
);
