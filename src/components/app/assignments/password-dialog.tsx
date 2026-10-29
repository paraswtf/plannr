"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Dialog } from "~/components/ui/dialog";
import { Field, Input } from "~/components/ui/field";

/**
 * The length a paper's password must have. The server's own bounds live in
 * src/server/services/papers/crypto.ts (PAPER_PASSWORD_MIN and _MAX); they are
 * copied here because that file is server code and must not reach the browser.
 */
export const PAPER_PASSWORD_MIN = 8;
export const PAPER_PASSWORD_MAX = 200;

export const FORGOTTEN_WARNING =
  "If you forget this password, nobody can open this paper, not even an administrator.";

export type PasswordMode = "set" | "enter" | "change";

/** A password's length as the server counts it: NFC code points. */
export const passwordLength = (password: string) =>
  Array.from(password.normalize("NFC")).length;

/** What the fields hold. Lives in the component that shows them, never longer. */
export interface PasswordValues {
  /** The paper's password ("enter"), its first one ("set") or the current one ("change"). */
  password: string;
  /** "set": the password again. "change": the new password. */
  next: string;
  /** "change": the new password again. */
  again: string;
}

export const EMPTY_PASSWORDS: PasswordValues = {
  password: "",
  next: "",
  again: "",
};

/**
 * What is wrong with the fields, or null when they can be sent. Checked when
 * the person asks to go ahead, not while they type.
 */
export function passwordProblem(
  mode: PasswordMode,
  v: PasswordValues,
): string | null {
  if (mode === "enter") {
    return v.password ? null : "Type the paper's password.";
  }
  if (mode === "change" && !v.password) {
    return "Type the paper's current password.";
  }
  const chosen = mode === "set" ? v.password : v.next;
  const copy = mode === "set" ? v.next : v.again;
  const length = passwordLength(chosen);
  if (length < PAPER_PASSWORD_MIN || length > PAPER_PASSWORD_MAX) {
    return `The password must be ${PAPER_PASSWORD_MIN} to ${PAPER_PASSWORD_MAX} characters long.`;
  }
  // Compared as the server sees them, so a phone and a laptop that compose
  // accents differently still match.
  if (chosen.normalize("NFC") !== copy.normalize("NFC")) {
    return "The two copies of the password are not the same. Type them again.";
  }
  if (
    mode === "change" &&
    v.next.normalize("NFC") === v.password.normalize("NFC")
  ) {
    return "The new password is the same as the current one. Choose a different one.";
  }
  return null;
}

/**
 * The password fields of each mode, without a dialog around them, so the
 * upload dialog can ask for the password beside the file.
 */
export function PasswordFields({
  mode,
  values,
  onChange,
  disabled = false,
}: {
  mode: PasswordMode;
  values: PasswordValues;
  onChange: (values: PasswordValues) => void;
  disabled?: boolean;
}) {
  const set =
    (key: keyof PasswordValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...values, [key]: e.target.value });
  // Kept away from password managers: a paper's password is never the
  // sign-in one, so nothing should offer to fill it (a wrong fill spends one
  // of the five tries), generate it or save it. "new-password" would invite
  // both a generated password and a save prompt. No maxLength: the server
  // counts NFC code points, which passwordProblem checks.
  const common = {
    type: "password",
    autoComplete: "off",
    spellCheck: false,
    "data-1p-ignore": true,
    "data-lpignore": "true",
    "data-bwignore": true,
    disabled,
  } as const;

  if (mode === "enter") {
    return (
      <Field label="Paper's password">
        {(id) => (
          <Input
            id={id}
            {...common}
            value={values.password}
            onChange={set("password")}
          />
        )}
      </Field>
    );
  }

  const lengthHint = `${PAPER_PASSWORD_MIN} characters or more.`;
  return (
    <div className="flex flex-col gap-4">
      {mode === "change" && (
        <Field label="Current password">
          {(id) => (
            <Input
              id={id}
              {...common}
              value={values.password}
              onChange={set("password")}
            />
          )}
        </Field>
      )}
      <Field
        label={mode === "set" ? "Password" : "New password"}
        hint={lengthHint}
      >
        {(id) => (
          <Input
            id={id}
            {...common}
            value={mode === "set" ? values.password : values.next}
            onChange={set(mode === "set" ? "password" : "next")}
          />
        )}
      </Field>
      <Field label={mode === "set" ? "Password again" : "New password again"}>
        {(id) => (
          <Input
            id={id}
            {...common}
            value={mode === "set" ? values.next : values.again}
            onChange={set(mode === "set" ? "next" : "again")}
          />
        )}
      </Field>
      <Callout tone="warn">{FORGOTTEN_WARNING}</Callout>
    </div>
  );
}

/**
 * Asks for a question paper's password.
 *
 * The dialog is controlled: it never closes itself. Cancel and Escape call
 * `onClose`; a successful `onSubmit` clears the fields, and the caller closes
 * the dialog (sets `open` to false) when it is done with it. A rejected
 * `onSubmit` shows its message inside the dialog and keeps it open.
 *
 * `onSubmit` is called straight from the click, before anything is awaited,
 * so a caller that opens a tab (a form posted to a new tab) does so inside the
 * person's own gesture and is not blocked as a pop-up.
 *
 * The password lives in this component's state while the dialog is open and
 * nowhere else; it is cleared when the dialog closes or succeeds.
 */
export function PasswordDialog({
  open,
  onClose,
  mode,
  title,
  description,
  confirmLabel,
  pendingLabel,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  mode: PasswordMode;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  onSubmit: (password: string, newPassword?: string) => Promise<void>;
}): React.ReactElement {
  const [values, setValues] = useState<PasswordValues>(EMPTY_PASSWORDS);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formId = useId();
  // A reply that lands after the dialog has closed must not refill it.
  const live = useRef(open);

  useEffect(() => {
    live.current = open;
    if (!open) {
      setValues(EMPTY_PASSWORDS);
      setError(null);
      setPending(false);
    }
  }, [open]);

  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );

  const close = () => {
    if (pending) return;
    setValues(EMPTY_PASSWORDS);
    setError(null);
    onClose();
  };

  const submit = () => {
    if (pending) return;
    const problem = passwordProblem(mode, values);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setPending(true);
    const sent =
      mode === "set"
        ? onSubmit(values.password)
        : mode === "change"
          ? onSubmit(values.password, values.next)
          : onSubmit(values.password);
    sent.then(
      () => {
        if (!live.current) return;
        setValues(EMPTY_PASSWORDS);
        setPending(false);
      },
      (e: unknown) => {
        if (!live.current) return;
        setPending(false);
        setError(
          e instanceof Error && e.message
            ? e.message
            : "That did not work. Try again in a moment.",
        );
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      icon="key"
      width={460}
      footer={
        <>
          <Button variant="secondary" disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            disabled={pending}
          >
            {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {description && (
          <div className="text-ink text-sm leading-relaxed">{description}</div>
        )}
        <PasswordFields
          mode={mode}
          values={values}
          onChange={(v) => {
            setValues(v);
            if (error) setError(null);
          }}
          disabled={pending}
        />
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}
      </form>
    </Dialog>
  );
}
