"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Callout } from "~/components/ui/callout";
import { Dialog } from "~/components/ui/dialog";
import { Checkbox } from "~/components/ui/checkbox";
import { Button, Notice } from "./controls";

/**
 * The one moment the secret exists outside the app that will use it.
 *
 * Read the router's `create` before changing anything here: the database holds
 * a SHA-256 digest and nothing else, so when this dialog closes the token is
 * gone from the world unless somebody wrote it down. That is not a UI
 * inconvenience to be smoothed over — it is the property that makes a leaked
 * database useless — and this screen's whole job is to make it impossible to
 * close this box by accident.
 *
 * Hence three things that would otherwise be over-engineering:
 *
 *   - The scrim, the X and Escape all refuse while the box is unacknowledged,
 *     and say why. Every other dialog in the app dismisses on all three,
 *     because every other dialog can be reopened.
 *   - "Done" waits on a tick, not on the copy button. Copying by hand is a
 *     perfectly good way to keep a key, and a button that only unlocks on a
 *     successful `navigator.clipboard` call would strand anybody on an origin
 *     where that API is unavailable.
 *   - The token lives in this component's props and nowhere else. It is not in
 *     the URL, not in a query cache the devtools will print, not in a log line,
 *     and the caller drops it the moment `onClose` fires.
 */
export function SecretDialog({
  name,
  token,
  rolled,
  onClose,
}: {
  name: string;
  token: string;
  /** A rotation rather than a fresh mint — the old token is already dead. */
  rolled: boolean;
  onClose: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [nudged, setNudged] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      toast.success("Key copied. Paste it into the app that needs it.");
    } catch {
      toast.error(
        "Could not reach the clipboard. Click the key to select it, then copy it by hand.",
      );
    }
  };

  const attemptClose = () => {
    if (acknowledged) {
      onClose();
      return;
    }
    setNudged(true);
  };

  return (
    <Dialog
      open
      title={rolled ? "Your new key" : "Copy this key now"}
      icon="key"
      iconTone="var(--red)"
      width={560}
      onClose={attemptClose}
      footer={
        <Button
          variant="primary"
          disabled={!acknowledged}
          onClick={attemptClose}
        >
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Notice
          tone="red"
          title="This is the only time this key will ever be shown."
        >
          Plannr keeps a one-way digest of it and nothing else, so nobody (not
          you, not an engineer with a database prompt) can look it up again.
          {rolled
            ? " The previous key for this integration stopped working the moment this one was made."
            : " If it is lost, roll the key and update the app with the replacement."}
        </Notice>

        {/*
         * The token is the thing this box is for, so it is the largest type in
         * it, and the copy button under it is a full-width control rather than
         * the small chip it used to be — the one action that matters here was
         * the smallest target in the dialog, on a phone most of all.
         */}
        <div className="flex flex-col gap-2">
          <span className="text-title text-xs font-semibold">{name}</span>
          {/*
           * `select-all` so one click takes the whole token: the fallback when
           * the clipboard API is unavailable is a person selecting this by
           * hand, and a token that breaks over three lines is exactly the thing
           * a drag-select gets subtly wrong.
           */}
          <code className="text-title bg-tint block rounded-[12px] px-3.5 py-3 font-mono text-base leading-relaxed break-all shadow-[inset_0_0_0_1px_var(--hair)] select-all">
            {token}
          </code>
          <Button
            icon={copied ? "check" : "copy"}
            block
            onClick={() => void copy()}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <span className="text-muted text-xs">
            Send it as{" "}
            <span className="font-mono">Authorization: Bearer …</span>, and keep
            it in a secret manager or the app&rsquo;s environment, never a
            repository.
          </span>
        </div>

        <Checkbox
          checked={acknowledged}
          onChange={setAcknowledged}
          label={
            <span className="font-semibold">
              I have stored this key somewhere safe.
            </span>
          }
        />

        {nudged && !acknowledged && (
          // Announced rather than merely drawn: the refusal is the only
          // feedback a dismissed Escape or a dead-looking X gives, and
          // somebody reading the box by ear would otherwise be told nothing
          // at all about why it will not close.
          <Callout tone="bad" role="alert">
            Copy the key first. Closing this box is the last chance to see it.
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
