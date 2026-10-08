import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Icon, type IconName } from "./icon";

/**
 * Small square-cornered tags: a fact about a thing (`Chip`), or one of several
 * options that each switch on and off (`ToggleChip`).
 *
 * Square rather than pill, as the deck has it — a 999px corner on a word is a
 * button shape, and most of these are not buttons. A toggle chip that is on
 * takes the selected wash with slate ink and a tick, so on and off differ in
 * shape as well as colour; a static chip is the neutral wash and nothing more.
 *
 * The room features (Projector, AC, Whiteboard), the booking requirements and
 * the feature filters were each drawn by hand on their own screens before.
 */

const CHIP =
  "inline-flex max-w-full items-center gap-1.5 rounded-[8px] font-medium whitespace-nowrap";

export function Chip({
  children,
  icon,
  className = "",
}: {
  children: ReactNode;
  icon?: IconName;
  className?: string;
}) {
  return (
    <span
      className={`${CHIP} bg-neutral-wash text-muted px-2 py-0.5 text-xs ${className}`}
    >
      {icon && <Icon name={icon} size={12} stroke={2} className="shrink-0" />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export interface ToggleChipProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  pressed: boolean;
  children: ReactNode;
}

export const ToggleChip = forwardRef<HTMLButtonElement, ToggleChipProps>(
  function ToggleChip(
    { pressed, children, className = "", type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-pressed={pressed}
        // 40px tall below the sidebar's breakpoint, where these are tapped;
        // a 26px chip on a laptop, where they are clicked.
        className={`${CHIP} min-h-10 cursor-pointer px-3 text-sm transition-[background-color,box-shadow,color,scale] duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-[30px] lg:px-2.5 lg:text-xs ${
          pressed
            ? "bg-tint-selected text-slate-ink shadow-[inset_0_0_0_1px_var(--info-line)]"
            : "bg-surface text-muted hover:text-title shadow-[inset_0_0_0_1px_var(--field-line)] hover:shadow-[inset_0_0_0_1px_var(--field-line-hover)]"
        } ${className}`}
        {...rest}
      >
        {pressed && <Icon name="check" size={12} stroke={2.6} />}
        {children}
      </button>
    );
  },
);
