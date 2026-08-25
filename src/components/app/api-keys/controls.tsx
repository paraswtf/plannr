"use client";

import type { ReactNode } from "react";

import { Icon, type IconName } from "~/components/ui/icon";

/**
 * The buttons and fields this screen repeats, in one place.
 *
 * Everywhere else in the app a button is written inline, and that is fine when
 * a panel has two of them. This screen has five dialogs and a confirmation
 * gesture on three of them, which is around twenty buttons — enough that the
 * inline style objects stop being local colour and start hiding the logic they
 * are wrapped around. The styles below are the same values the rest of the app
 * uses, lifted rather than invented; nothing here is a new visual idea.
 */

type Variant = "primary" | "ghost" | "danger" | "destructive";

const VARIANTS: Record<Variant, React.CSSProperties> = {
  primary: { background: "var(--grad-brand)", color: "#fff" },
  ghost: { boxShadow: "var(--ring)", color: "var(--muted)" },
  /** An action you can undo, or that only threatens one key. */
  danger: { boxShadow: "var(--ring)", color: "var(--red)" },
  /** The one that cannot be taken back, and is filled so it reads that way. */
  destructive: { background: "var(--red)", color: "#fff" },
};

export function Button({
  children,
  variant = "ghost",
  icon,
  disabled = false,
  onClick,
  className = "",
}: {
  children: ReactNode;
  variant?: Variant;
  icon?: IconName;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      // The floor on the height is the touch target, which the pointer-driven
      // layout above the sidebar's breakpoint has no need of.
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap lg:min-h-0 ${className}`}
      style={{
        ...VARIANTS[variant],
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {icon && <Icon name={icon} size={14} color="currentColor" stroke={2} />}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted text-[12.5px] font-semibold">{label}</span>
      {children}
      {hint && <span className="text-faint text-[11.5px]">{hint}</span>}
    </div>
  );
}

/**
 * 16px on a phone: below that, Safari zooms the page in as the field takes
 * focus, which on a dialog leaves it half off screen.
 */
export const INPUT_CLASS =
  "bg-surface text-ink min-h-10 w-full rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0";

export function TextInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  maxLength,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  ariaLabel?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      aria-label={ariaLabel}
      className={INPUT_CLASS}
      style={{ boxShadow: "var(--ring)", opacity: disabled ? 0.6 : 1 }}
    />
  );
}

/**
 * A short warning, stated once and coloured.
 *
 * Red for "this cannot be taken back", amber for "read this before you press
 * the button". The same fill-plus-ring pair as everything else on these
 * screens, so it reads as part of the page rather than as an alert box bolted
 * on to it.
 */
export function Notice({
  tone,
  children,
}: {
  tone: "red" | "orange";
  children: ReactNode;
}) {
  const colour = tone === "red" ? "var(--red)" : "var(--orange)";
  return (
    <div
      className="flex items-start gap-2.5 rounded-[10px] px-3.5 py-3"
      style={{
        background: `color-mix(in srgb, ${colour} 11%, var(--surface))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${colour} 42%, transparent)`,
      }}
    >
      <Icon
        name="alert"
        size={15}
        stroke={2}
        color={tone === "red" ? "#b02636" : "#a2660f"}
        className="mt-px"
      />
      <div className="text-ink min-w-0 text-[12.5px] leading-relaxed">
        {children}
      </div>
    </div>
  );
}

/**
 * How a key is written down when nobody is allowed to see it.
 *
 * `TOKEN_SCHEME` is mirrored rather than imported from
 * `~/server/api-keys/secret`: that module pulls in `node:crypto`, and reaching
 * for one string would drag the minting and verification code into the browser
 * bundle. The dot is real — it is where the public handle ends and the secret
 * begins — so what is printed is the token with its secret half elided, not a
 * decoration.
 */
const TOKEN_SCHEME = "plk_live";

export const tokenHandle = (prefix: string, last4: string) =>
  `${TOKEN_SCHEME}_${prefix}.…${last4}`;

/** "3 minutes ago", give or take — precision here would be false. */
export function relativeTime(at: Date): string {
  const minutes = Math.round((Date.now() - at.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 18) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${Math.round(months / 12)} years ago`;
}
