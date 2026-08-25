"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Dialog } from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
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
      <div className="flex flex-col gap-4">
        <Notice tone="red">
          <strong className="font-semibold">
            This is the only time this key will ever be shown.
          </strong>{" "}
          Plannr keeps a one-way digest of it and nothing else, so nobody — not
          you, not an engineer with a database prompt — can look it up again.
          {rolled
            ? " The previous key for this integration stopped working the moment this one was made."
            : " If it is lost, roll the key and update the app with the replacement."}
        </Notice>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted text-[12.5px] font-semibold">
              {name}
            </span>
            <button
              type="button"
              onClick={() => void copy()}
              className="text-slate inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold"
              style={{ background: "rgba(68,88,121,0.08)" }}
            >
              <Icon
                name={copied ? "check" : "copy"}
                size={13}
                stroke={2.2}
                color="currentColor"
              />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {/*
           * `select-all` so one click takes the whole token: the fallback when
           * the clipboard API is unavailable is a person selecting this by
           * hand, and a token that breaks over three lines is exactly the thing
           * a drag-select gets subtly wrong.
           */}
          <code
            className="text-title block rounded-[10px] px-3.5 py-3 font-mono text-[12.5px] leading-relaxed break-all select-all"
            style={{
              background: "var(--card-soft)",
              boxShadow: "var(--ring)",
            }}
          >
            {token}
          </code>
          <span className="text-faint text-[11.5px]">
            Send it as{" "}
            <span className="font-mono">Authorization: Bearer …</span> — a
            secret manager or the app&rsquo;s environment, never a repository.
          </span>
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <span
            className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px]"
            style={{
              background: acknowledged ? "var(--slate)" : "var(--surface)",
              boxShadow: acknowledged ? "none" : "var(--ring)",
            }}
          >
            {acknowledged && (
              <Icon name="check" size={12} color="#fff" stroke={3} />
            )}
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span className="text-title text-[13px] font-semibold">
            I have stored this key somewhere safe.
          </span>
        </label>

        {nudged && !acknowledged && (
          <p
            className="m-0 text-[12.5px] font-semibold"
            style={{ color: "var(--red)" }}
          >
            Copy the key first. Closing this box is the last chance to see it.
          </p>
        )}
      </div>
    </Dialog>
  );
}
