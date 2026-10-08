"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Callout } from "~/components/ui/callout";
import { Dialog } from "~/components/ui/dialog";
import { Field, Input } from "~/components/ui/field";
import { Icon, type IconName } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { Skeleton } from "~/components/ui/skeleton";
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
    /*
     * Rolling and revoking are things done to the key, not fields of the form,
     * so they sit with the key's identity at the top rather than under the
     * whole scope list, where they used to be off the bottom of the dialog on
     * every screen. On both tabs, because they belong to the key rather than
     * to either view of it — and because a row that came and went with the
     * tab moved the tabs themselves under the pointer that had just switched
     * them. Never on a revoked key, which the router refuses to roll.
     */
    const lifecycle = !revoked ? (
      <>
        <Button
          size="sm"
          icon="rotate"
          disabled={busy}
          onClick={() => setConfirm("roll")}
        >
          Roll the secret
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon="x"
          disabled={busy}
          onClick={() => setConfirm("revoke")}
        >
          Revoke
        </Button>
      </>
    ) : null;

    body = (
      <div className="flex flex-col gap-4">
        <Summary apiKey={apiKey} actions={lifecycle} />

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
          <KeyFields
            draft={draft}
            onChange={setDraft}
            catalog={catalog}
            granterPermissions={granterPermissions}
            currentExpiry={apiKey.expiresAt}
            allowKeep
            disabled={busy}
          />
        )}
      </div>
    );

    footer =
      tab === "usage" || revoked ? (
        // A dismissal, not the thing the view is for, so it does not wear the
        // primary: there is nothing to commit on Usage or on a revoked key.
        <Button onClick={onClose}>Close</Button>
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
      // Held at one height across the tabs: a short Usage view used to shrink
      // the centred panel and drop the title and tabs from under the pointer
      // that had just clicked them. Confirmations are short and stay so.
      tall={!confirm}
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
function Summary({
  apiKey,
  actions,
}: {
  apiKey: ApiKey;
  /** Roll and Revoke, beside the facts or under them, when the key can take them. */
  actions: React.ReactNode;
}) {
  const status = STATUS_BADGE[apiKey.status];
  const life = apiKey.revokedAt
    ? `revoked ${formatFullDate(apiKey.revokedAt, DEFAULT_TIMEZONE)}`
    : apiKey.expiresAt
      ? `expires ${formatFullDate(apiKey.expiresAt, DEFAULT_TIMEZONE)}`
      : "never expires";

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
          <span className="text-muted font-mono text-xs break-all">
            {tokenHandle(apiKey.prefix, apiKey.last4)}
          </span>
        </div>
        {/* A sentence, so the body face; the one middle dot divides who made
            it from how long it has left. */}
        <span className="text-muted text-xs">
          Created {relativeTime(apiKey.createdAt)}
          {apiKey.createdBy?.name ? ` by ${apiKey.createdBy.name}` : ""} ·{" "}
          {life}
        </span>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
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
      <Notice
        tone="red"
        title={`This key was switched off${when} and cannot be edited, rolled or brought back.`}
      >
        Its record is kept so that everything it scheduled still says who
        scheduled it. An integration that is wanted again needs a new key.
      </Notice>

      {apiKey.description && (
        <p className="text-muted text-sm">{apiKey.description}</p>
      )}

      <div>
        <div className="text-title mb-2 text-xs font-semibold">
          Scopes it held
        </div>
        <div className="flex flex-wrap gap-1.5">
          {apiKey.scopes.map((scope) => (
            <Badge key={scope}>{labels.get(scope) ?? scope}</Badge>
          ))}
        </div>
      </div>

      {/* The way towards the irreversible step, so the quiet red: the filled
          one is on the confirmation, behind the typed name. */}
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

  if (usage.error) {
    return (
      <Callout tone="bad" title="Could not read the counters.">
        {usage.error.message}
      </Callout>
    );
  }

  if (!usage.data) {
    // The shape of the figures that are coming, so nothing moves when they
    // land, and one announcement for the whole region rather than per bar.
    return (
      <div
        role="status"
        aria-label="Reading the counters…"
        className="bg-tint-hover grid grid-cols-1 rounded-[12px] sm:grid-cols-3"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className={`flex flex-col gap-2.5 p-4 ${CELL_RULE[i]}`}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
    );
  }

  const { rateLimit } = usage.data;
  // Amber only once the headroom is nearly gone, so a busy key does not read
  // as a problem while it is comfortably inside its allowance.
  const tight = rateLimit.remaining / rateLimit.perMinute < 0.2;

  return (
    <div className="flex flex-col gap-3">
      {/*
       * Three figures on one plate, divided by hairlines, rather than three
       * cards: this already sits on a floating dialog, and a card on a card is
       * elevation that means nothing.
       */}
      <div className="bg-tint-hover grid grid-cols-1 rounded-[12px] sm:grid-cols-3">
        <Figure
          label="Requests"
          icon="swap"
          value={usage.data.requestCount.toLocaleString()}
          note="Since the key was minted"
          className={CELL_RULE[0]}
        />
        <Figure
          label="Events created"
          icon="calendar"
          value={usage.data.eventsCreated.toLocaleString()}
          note="Lectures and bookings it owns"
          className={CELL_RULE[1]}
        />
        <Figure
          label="This minute"
          icon="clock"
          value={`${rateLimit.usedThisWindow}/${rateLimit.perMinute}`}
          warn={tight}
          note={
            rateLimit.windowStartedAt
              ? `Resets in ${rateLimit.resetsInSeconds}s`
              : "Window is clear"
          }
          className={CELL_RULE[2]}
        />
      </div>

      <p className="text-ink text-sm">
        {usage.data.lastUsedAt
          ? `Last used ${relativeTime(usage.data.lastUsedAt)}${
              usage.data.lastUsedIp ? ` from ${usage.data.lastUsedIp}` : ""
            }.`
          : "Never used. Nothing has presented this key yet."}
      </p>

      <p className="text-muted text-xs">
        Request counts say how chatty an integration is. Events created say how
        much of the timetable it owns, and deleting the key takes that record
        with it.
      </p>
    </div>
  );
}

/**
 * The hairline before each figure after the first: across the top when they
 * stack on a phone, down the left side once they stand in a row.
 */
const CELL_RULE = [
  "",
  "max-sm:shadow-[inset_0_1px_0_var(--hair-soft)] sm:shadow-[inset_1px_0_0_var(--hair-soft)]",
  "max-sm:shadow-[inset_0_1px_0_var(--hair-soft)] sm:shadow-[inset_1px_0_0_var(--hair-soft)]",
];

/** One of the usage numbers: the figure leads, its label and note step down. */
function Figure({
  label,
  icon,
  value,
  note,
  warn = false,
  className = "",
}: {
  label: string;
  icon: IconName;
  value: string;
  note: string;
  /** The allowance is nearly spent: the figure takes the warning ink. */
  warn?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col p-4 ${className}`}>
      <span className="text-muted flex items-center gap-1.5 text-xs font-medium">
        <Icon name={icon} size={13} stroke={2} />
        {label}
      </span>
      <span
        className={`font-display mt-1.5 text-xl font-semibold tracking-[-0.02em] tabular-nums ${
          warn ? "text-warn" : "text-title"
        }`}
      >
        {value}
      </span>
      <span className="text-faint mt-1 text-xs">{note}</span>
    </div>
  );
}

function RollConfirmation({ name }: { name: string }) {
  return (
    <div className="flex flex-col gap-3.5">
      <Notice
        tone="orange"
        title="The current token stops working the instant you press the button."
      >
        Anything still using it starts failing until it is given the
        replacement.
      </Notice>
      <p className="text-muted text-sm">
        Rolling is the answer to “the token is in a git commit”. The key keeps
        its name, its scopes, its history and its principal, so every lecture{" "}
        <strong className="text-title font-semibold">{name}</strong> has ever
        scheduled still points at the thing that scheduled it. Only the secret
        changes.
      </p>
      <p className="text-muted text-sm">
        The new key is shown once, on the next screen. Have somewhere to put it.
      </p>
    </div>
  );
}

function RevokeConfirmation({ name }: { name: string }) {
  return (
    <div className="flex flex-col gap-3.5">
      <Notice tone="red" title="Revoking is a full stop, not a pause.">
        <strong className="font-semibold">{name}</strong> cannot be edited,
        rolled or switched back on afterwards.
      </Notice>
      <p className="text-muted text-sm">
        Everything the key ever did is kept: the row stays, and the events it
        scheduled and the changes it requested go on naming it. What stops is
        the token: the next request it makes is refused.
      </p>
      <p className="text-muted text-sm">
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
      <Notice
        tone="red"
        title="This erases the key, its service principal, and the record of everything it did."
      >
        Every event it scheduled loses its author, and every change it requested
        is deleted outright. There is no undo.
      </Notice>
      <p className="text-muted text-sm">
        This is here for the mistakes: a key minted with a typo, or against the
        wrong environment, that never did anything worth keeping. If it did any
        work at all, leave it revoked.
      </p>
      <Field
        label={
          <>
            Type <span className="font-mono">{name}</span> to confirm
          </>
        }
      >
        {(id) => (
          /*
           * Once the name matches, a red halo rises round the field: the
           * gesture is complete and the button below is armed. A halo rather
           * than recolouring the field's own ring, which stays the slate focus
           * ring while it is being typed in.
           */
          <div
            className={`rounded-[var(--radius-btn)] transition-shadow duration-150 ${
              matches ? "shadow-[0_0_0_3px_var(--bad-halo)]" : ""
            }`}
          >
            <Input
              id={id}
              value={typed}
              onChange={(e) => onType(e.target.value)}
              autoComplete="off"
              aria-label={`Type ${name} to confirm deletion`}
            />
          </div>
        )}
      </Field>
    </div>
  );
}
