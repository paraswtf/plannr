"use client";

import type { ReactNode } from "react";

import { Button as UiButton, type ButtonVariant } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Input } from "~/components/ui/field";
import type { IconName } from "~/components/ui/icon";

/**
 * The buttons and fields this screen repeats, in one place.
 *
 * This screen has five dialogs and a confirmation gesture on three of them,
 * which is around twenty buttons. They used to be drawn here from inline style
 * objects; the app has its own `Button`, `Input` and `Callout` now, so what is
 * left is the console's own vocabulary laid over them — the four kinds of
 * button an API key needs, and the two kinds of warning — so the dialogs can
 * keep saying "destructive" where they mean it rather than re-deciding at every
 * call site which of the app's variants that is.
 */

type Variant = "primary" | "ghost" | "danger" | "destructive";

/*
 * `danger` and `destructive` are not two names for red. Rolling a key, or the
 * step that leads to revoking one, is the bad wash with red ink: plainly
 * dangerous, still recoverable. The act that cannot be taken back is the solid
 * red fill, so the only warning between the two — that the second is filled —
 * survives the move onto the shared button. `ghost` was a ringed white button
 * here before it had a name, which is the shared `secondary`.
 */
const VARIANTS: Record<Variant, ButtonVariant> = {
  primary: "primary",
  ghost: "secondary",
  /** An action you can undo, or that only threatens one key. */
  danger: "danger-quiet",
  /** The one that cannot be taken back, and is filled so it reads that way. */
  destructive: "danger",
};

export function Button({
  children,
  variant = "ghost",
  size = "md",
  icon,
  disabled = false,
  block = false,
  onClick,
  className = "",
}: {
  children: ReactNode;
  variant?: Variant;
  size?: "sm" | "md";
  icon?: IconName;
  disabled?: boolean;
  /** Full width, for the one action a phone-width box is about. */
  block?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    // The shared button is `type="button"` and DOM-disabled, which is what the
    // "a double press cannot mint two credentials" guarantees upstairs rest on.
    <UiButton
      variant={VARIANTS[variant]}
      size={size}
      icon={icon}
      disabled={disabled}
      block={block}
      onClick={onClick}
      className={className}
    >
      {children}
    </UiButton>
  );
}

/**
 * The label-hint-error frame, which is the app's own now: it renders a real
 * `<label>` tied to the control by id, so a field passed as a render function
 * is named by the words above it.
 */
export { Field } from "~/components/ui/field";

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  disabled = false,
  maxLength,
  ariaLabel,
}: {
  /** From `Field`'s render function, so the label names this field. */
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  ariaLabel?: string;
}) {
  // 13px on the scale, and 16px under a coarse pointer by the rule in
  // globals.css: below that, Safari zooms the page in as the field takes
  // focus, which on a dialog leaves it half off screen.
  return (
    <Input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      aria-label={ariaLabel}
    />
  );
}

/**
 * A short warning, stated once and coloured.
 *
 * Red for "this cannot be taken back", amber for "read this before you press
 * the button" — the app's `bad` and `warn`, so a warning here is the same red
 * as a badge or a refusal anywhere else. Given a `title`, the title carries the
 * tone and the explanation under it drops to ordinary ink, so a paragraph of
 * consequences is not a paragraph of red.
 */
export function Notice({
  tone,
  title,
  children,
}: {
  tone: "red" | "orange";
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Callout tone={tone === "red" ? "bad" : "warn"} title={title}>
      {children}
    </Callout>
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
