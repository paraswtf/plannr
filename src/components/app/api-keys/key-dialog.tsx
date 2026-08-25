"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Dialog } from "~/components/ui/dialog";
import { Segmented } from "~/components/ui/segmented";
import { Stat } from "~/components/ui/stat";
import { DEFAULT_TIMEZONE, formatFullDate } from "~/lib/dates";
import { api, type RouterOutputs } from "~/trpc/react";
import { Button, Notice, relativeTime, tokenHandle } from "./controls";
import { draftIsValid, expiryDate, KeyFields, type KeyDraft } from "./key-form";
import { grantedScopes, type ScopeCatalog } from "./scope-picker";

/** The whole envelope `apiKeys.list` answers with, page and all. */
export type ApiKeyPage = RouterOutputs["apiKeys"]["list"];
export type ApiKey = ApiKeyPage["rows"][number];

/**
 * One key, everything about it, and every way to change it.
 *
 * All of it in a single dialog because the four actions here are answers to one
 * question — "what do I do about this integration?" — and the difference
 * between rolling and revoking is something an admin has to weigh in the
 * moment, not discover behind two separate menu items.
 *
 * The confirmations replace this dialog's own body rather than opening a second
 * one over it. Stacked modals share `Dialog`'s document-level Escape handler,
 * so one press would close both — dismissing the confirmation and the key
 * behind it in a single keystroke, which is exactly the wrong outcome on a box
 * asking "are you sure?".
 */

type Tab = "details" | "usage";
type Confirm = "roll" | "revoke" | "delete";

export const STATUS_BADGE: Record<
  ApiKey["status"],
  { label: string; tone: "green" | "orange" | "red" }
> = {
  active: { label: "Active", tone: "green" },
  expired: { label: "Expired", tone: "orange" },
  revoked: { label: "Revoked", tone: "red" },
};

const draftFrom = (key: ApiKey): KeyDraft => ({
  name: key.name,
  description: key.description ?? "",
  // `list` reports scopes expanded; the editor wants the ones actually granted.
  scopes: grantedScopes(key.scopes),
  rateLimit: String(key.rateLimitPerMinute),
  expiry: "keep",
});

export function KeyDialog({
  apiKey,
  catalog,
  granterPermissions,
  onClose,
  onRolled,
}: {
  apiKey: ApiKey;
  catalog: ScopeCatalog;
  granterPermissions: string;
  onClose: () => void;
  onRolled: (rolled: { name: string; token: string }) => void;
}) {
  const [tab, setTab] = useState<Tab>("details");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [draft, setDraft] = useState<KeyDraft>(() => draftFrom(apiKey));
  const [typedName, setTypedName] = useState("");

  const utils = api.useUtils();
  const refresh = () => utils.apiKeys.list.invalidate();
  const complain = (error: { message: string }) => toast.error(error.message);

  const revoked = apiKey.status === "revoked";

  const update = api.apiKeys.update.useMutation({
    onSuccess: async (key) => {
      toast.success(`Saved. “${key.name}” is up to date.`);
      await refresh();
      onClose();
    },
    onError: complain,
  });

  const roll = api.apiKeys.roll.useMutation({
    onSuccess: (key) => {
      const handed = { name: key.name, token: key.token };
      // Wiped before it is handed on, so the plaintext token does not outlive
      // the dialog allowed to show it by sitting in the mutation cache — and
      // handed on last, because that is what unmounts this dialog.
      roll.reset();
      void refresh();
      onRolled(handed);
    },
    onError: complain,
  });

  const revoke = api.apiKeys.revoke.useMutation({
    onSuccess: async () => {
      toast.success(
        `“${apiKey.name}” is switched off. Nothing it did is lost.`,
      );
      await refresh();
      onClose();
    },
    onError: complain,
  });

  const remove = api.apiKeys.delete.useMutation({
    onSuccess: async () => {
      toast.success(`“${apiKey.name}” and everything it recorded are gone.`);
      await refresh();
      onClose();
    },
    onError: complain,
  });

  const busy =
    update.isPending || roll.isPending || revoke.isPending || remove.isPending;

  const title =
    confirm === "roll"
      ? "Roll this key?"
      : confirm === "revoke"
        ? `Revoke “${apiKey.name}”?`
        : confirm === "delete"
          ? `Delete “${apiKey.name}”?`
          : apiKey.name;

  const cancel = (
    <Button disabled={busy} onClick={() => setConfirm(null)}>
      Cancel
    </Button>
  );

  let body: React.ReactNode;
  let footer: React.ReactNode;

  if (confirm === "roll") {
    body = <RollConfirmation name={apiKey.name} />;
    footer = (
      <>
        {cancel}
        <Button
          variant="danger"
          icon="rotate"
          disabled={busy}
          onClick={() => roll.mutate({ id: apiKey.id })}
        >
          {roll.isPending ? "Rolling…" : "Roll it"}
        </Button>
      </>
    );
  } else if (confirm === "revoke") {
    body = <RevokeConfirmation name={apiKey.name} />;
    footer = (
      <>
        {cancel}
        <Button
          variant="destructive"
          disabled={busy}
          onClick={() => revoke.mutate({ id: apiKey.id })}
        >
          {revoke.isPending ? "Revoking…" : "Revoke the key"}
        </Button>
      </>
    );
  } else if (confirm === "delete") {
    body = (
      <DeleteConfirmation
        name={apiKey.name}
        typed={typedName}
        onType={setTypedName}
      />
    );
    footer = (
      <>
        {cancel}
        <Button
          variant="destructive"
          icon="trash"
          disabled={busy || typedName.trim() !== apiKey.name}
          onClick={() => remove.mutate({ id: apiKey.id })}
        >
          {remove.isPending ? "Deleting…" : "Delete for good"}
        </Button>
      </>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <Summary apiKey={apiKey} />

        <Segmented
          size="sm"
          value={tab}
          onChange={setTab}
          items={[
            { value: "details", label: "Details" },
            { value: "usage", label: "Usage" },
          ]}
        />

        {tab === "usage" ? (
          <Usage id={apiKey.id} />
        ) : revoked ? (
          <RevokedDetails
            apiKey={apiKey}
            catalog={catalog}
            onDelete={() => setConfirm("delete")}
          />
        ) : (
          <>
            <KeyFields
              draft={draft}
              onChange={setDraft}
              catalog={catalog}
              granterPermissions={granterPermissions}
              currentExpiry={apiKey.expiresAt}
              allowKeep
              disabled={busy}
            />
            <div
              className="flex flex-wrap gap-2.5 pt-4"
              style={{ boxShadow: "inset 0 1px 0 var(--hair-soft)" }}
            >
              <Button
                icon="rotate"
                disabled={busy}
                onClick={() => setConfirm("roll")}
              >
                Roll the secret
              </Button>
              <Button
                variant="danger"
                icon="x"
                disabled={busy}
                onClick={() => setConfirm("revoke")}
              >
                Revoke
              </Button>
            </div>
          </>
        )}
      </div>
    );

    footer =
      tab === "usage" || revoked ? (
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      ) : (
        <>
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || !draftIsValid(draft)}
            onClick={() =>
              update.mutate({
                id: apiKey.id,
                name: draft.name.trim(),
                description: draft.description.trim() || null,
                scopes: draft.scopes,
                rateLimitPerMinute: Number(draft.rateLimit),
                expiresAt: expiryDate(draft.expiry),
              })
            }
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </>
      );
  }

  return (
    <Dialog
      open
      title={title}
      icon="key"
      iconTone={
        confirm === "revoke" || confirm === "delete"
          ? "var(--red)"
          : "var(--slate)"
      }
      width={620}
      // Escape and the scrim back out of a confirmation rather than taking the
      // key with them: they are the same "no" the Cancel button is, and landing
      // back on the page after pressing Escape over "are you sure?" reads as
      // having done something.
      onClose={confirm ? () => setConfirm(null) : onClose}
      footer={footer}
    >
      {body}
    </Dialog>
  );
}

/** The facts about a key that do not change with the tab. */
function Summary({ apiKey }: { apiKey: ApiKey }) {
  const status = STATUS_BADGE[apiKey.status];
  const life = apiKey.revokedAt
    ? `revoked ${formatFullDate(apiKey.revokedAt, DEFAULT_TIMEZONE)}`
    : apiKey.expiresAt
      ? `expires ${formatFullDate(apiKey.expiresAt, DEFAULT_TIMEZONE)}`
      : "never expires";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
        <span className="text-faint font-mono text-[11.5px] break-all">
          {tokenHandle(apiKey.prefix, apiKey.last4)}
        </span>
      </div>
      <span className="text-faint font-mono text-[11.5px]">
        Created {relativeTime(apiKey.createdAt)}
        {apiKey.createdBy?.name ? ` by ${apiKey.createdBy.name}` : ""} · {life}
      </span>
    </div>
  );
}

/**
 * A revoked key is read-only, and the router refuses to edit or roll one, so
 * the screen says so rather than offering fields that would be rejected. The
 * only thing left to do with the row is the one thing that cannot be undone.
 */
function RevokedDetails({
  apiKey,
  catalog,
  onDelete,
}: {
  apiKey: ApiKey;
  catalog: ScopeCatalog;
  onDelete: () => void;
}) {
  const when = apiKey.revokedAt ? ` ${relativeTime(apiKey.revokedAt)}` : "";
  const labels = new Map(
    catalog.flatMap((group) =>
      group.scopes.map((scope) => [scope.name, scope.label] as const),
    ),
  );

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="red">
        {`This key was switched off${when} and cannot be edited, rolled or brought back.`}{" "}
        Its record is kept so that everything it scheduled still says who
        scheduled it. An integration that is wanted again needs a new key.
      </Notice>

      {apiKey.description && (
        <p className="text-muted m-0 text-[13px]">{apiKey.description}</p>
      )}

      <div>
        <div className="text-faint mb-2 font-mono text-[11px] font-bold tracking-[0.06em] uppercase">
          Scopes it held
        </div>
        <div className="flex flex-wrap gap-1.5">
          {apiKey.scopes.map((scope) => (
            <Badge key={scope}>{labels.get(scope) ?? scope}</Badge>
          ))}
        </div>
      </div>

      <div>
        <Button variant="danger" icon="trash" onClick={onDelete}>
          Delete this key
        </Button>
      </div>
    </div>
  );
}

function Usage({ id }: { id: string }) {
  const usage = api.apiKeys.usage.useQuery({ id });

  if (!usage.data) {
    return (
      <p className="text-faint m-0 text-[13px]">
        {usage.error ? usage.error.message : "Reading the counters…"}
      </p>
    );
  }

  const { rateLimit } = usage.data;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Requests"
          value={usage.data.requestCount.toLocaleString()}
          icon="swap"
          note="Since the key was minted"
        />
        <Stat
          label="Events created"
          value={usage.data.eventsCreated.toLocaleString()}
          icon="calendar"
          tone="violet"
          note="Lectures and bookings it owns"
        />
        <Stat
          label="This minute"
          value={`${rateLimit.usedThisWindow}/${rateLimit.perMinute}`}
          icon="clock"
          // Amber only once the headroom is nearly gone, so a busy key does not
          // read as a problem while it is comfortably inside its allowance.
          tone={
            rateLimit.remaining / rateLimit.perMinute < 0.2 ? "orange" : "green"
          }
          note={
            rateLimit.windowStartedAt
              ? `Resets in ${rateLimit.resetsInSeconds}s`
              : "Window is clear"
          }
        />
      </div>

      <p className="text-muted m-0 text-[12.5px]">
        {usage.data.lastUsedAt
          ? `Last used ${relativeTime(usage.data.lastUsedAt)}${
              usage.data.lastUsedIp ? ` from ${usage.data.lastUsedIp}` : ""
            }.`
          : "Never used. Nothing has presented this key yet."}
      </p>

      <p className="text-faint m-0 text-[12px]">
        Request counts say how chatty an integration is. Events created say how
        much of the timetable it owns — and deleting the key takes that record
        with it.
      </p>
    </div>
  );
}

function RollConfirmation({ name }: { name: string }) {
  return (
    <div className="flex flex-col gap-3.5">
      <Notice tone="orange">
        The current token stops working the instant you press the button.
        Anything still using it starts failing until it is given the
        replacement.
      </Notice>
      <p className="text-muted m-0 text-[13px]">
        Rolling is the answer to “the token is in a git commit”. The key keeps
        its name, its scopes, its history and its principal — so every lecture{" "}
        <strong className="text-title font-semibold">{name}</strong> has ever
        scheduled still points at the thing that scheduled it. Only the secret
        changes.
      </p>
      <p className="text-muted m-0 text-[13px]">
        The new key is shown once, on the next screen. Have somewhere to put it.
      </p>
    </div>
  );
}

function RevokeConfirmation({ name }: { name: string }) {
  return (
    <div className="flex flex-col gap-3.5">
      <Notice tone="red">
        Revoking is a full stop, not a pause.{" "}
        <strong className="font-semibold">{name}</strong> cannot be edited,
        rolled or switched back on afterwards.
      </Notice>
      <p className="text-muted m-0 text-[13px]">
        Everything the key ever did is kept: the row stays, and the events it
        scheduled and the changes it requested go on naming it. What stops is
        the token — the next request it makes is refused.
      </p>
      <p className="text-muted m-0 text-[13px]">
        If the integration is still wanted and only the secret has leaked, roll
        the key instead.
      </p>
    </div>
  );
}

/**
 * The deliberate gesture.
 *
 * Typing the name back is not theatre. Deleting a key nulls the author of every
 * event it scheduled and cascades away every change request it ever raised — a
 * term of "who did this?" gone from a list where the row above is an
 * integration somebody still depends on. The name is typed because a button
 * cannot be pressed by accident twice.
 */
function DeleteConfirmation({
  name,
  typed,
  onType,
}: {
  name: string;
  typed: string;
  onType: (value: string) => void;
}) {
  const matches = typed.trim() === name;

  return (
    <div className="flex flex-col gap-3.5">
      <Notice tone="red">
        This erases the key, its service principal, and the record of everything
        it did. Every event it scheduled loses its author, and every change it
        requested is deleted outright. There is no undo.
      </Notice>
      <p className="text-muted m-0 text-[13px]">
        This is here for the mistakes — a key minted with a typo, or against the
        wrong environment, that never did anything worth keeping. If it did any
        work at all, leave it revoked.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="text-muted text-[12.5px] font-semibold">
          Type <span className="text-title font-mono">{name}</span> to confirm
        </span>
        <input
          value={typed}
          onChange={(e) => onType(e.target.value)}
          autoComplete="off"
          aria-label={`Type ${name} to confirm deletion`}
          className="bg-surface text-ink min-h-10 w-full rounded-[10px] px-3 py-2 text-[16px] outline-none sm:text-[13.5px] lg:min-h-0"
          style={{
            boxShadow: matches
              ? "inset 0 0 0 1px color-mix(in srgb, var(--red) 55%, transparent)"
              : "var(--ring)",
          }}
        />
      </label>
    </div>
  );
}
