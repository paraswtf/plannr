"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { DEFAULT_TIMEZONE, formatFullDate } from "~/lib/dates";
import { api } from "~/trpc/react";
import { Button, relativeTime, tokenHandle } from "./controls";
import { CreateKeyDialog } from "./create-key-dialog";
import { KeyDialog, STATUS_BADGE, type ApiKey } from "./key-dialog";
import { SecretDialog } from "./secret-dialog";
import type { ScopeCatalog } from "./scope-picker";

/**
 * The institution's API keys, in one list.
 *
 * The screen is arranged around the thing that goes wrong: somebody mints a key
 * for an integration, and eighteen months later nobody remembers what it was
 * for, whether anything still uses it, or how much of the timetable it could
 * rewrite if it leaked. So every row leads with the answers — what it is
 * allowed to do, when it last did anything, and how much — and the dialog
 * behind it says the same in numbers.
 */

/** Scope chips beyond this crowd the row out; the dialog lists all of them. */
const SCOPES_PER_ROW = 4;

export function ApiKeysView({
  initialKeys,
  catalog,
  permissions,
}: {
  initialKeys: ApiKey[];
  catalog: ScopeCatalog;
  /** The viewer's own permissions, decimal — what they may grant to a key. */
  permissions: string;
}) {
  const [creating, setCreating] = useState(false);
  const [openKeyId, setOpenKeyId] = useState<string | null>(null);
  /**
   * The plaintext token, for exactly as long as the dialog showing it is up.
   * Nothing else in this tree ever holds it, and closing the dialog drops it.
   */
  const [secret, setSecret] = useState<{
    name: string;
    token: string;
    rolled: boolean;
  } | null>(null);

  const list = api.apiKeys.list.useQuery(undefined, {
    initialData: initialKeys,
  });
  // Memoised only because `ordered` below depends on it: a fresh `[]` every
  // render would re-sort on every keystroke anywhere in the tree.
  const keys = useMemo(() => list.data ?? [], [list.data]);

  const labels = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of catalog) {
      for (const scope of group.scopes) map.set(scope.name, scope.label);
    }
    return map;
  }, [catalog]);

  // Revoked keys sink rather than disappear. They are kept because the audit
  // trail needs them, and hiding them would make "why does last term's booking
  // name a key I cannot find?" unanswerable — but a college that has rotated
  // through a dozen would otherwise open this screen on a list of the dead.
  const ordered = useMemo(
    () =>
      [...keys].sort((a, b) => {
        const revoked =
          Number(a.status === "revoked") - Number(b.status === "revoked");
        return revoked !== 0 ? revoked : +b.createdAt - +a.createdAt;
      }),
    [keys],
  );

  const live = keys.filter((key) => key.status === "active").length;
  const openKey = keys.find((key) => key.id === openKeyId) ?? null;

  return (
    <>
      <PageHeader
        title="API keys"
        subtitle="Credentials for the apps that talk to Plannr on their own"
        actions={
          <Button
            variant="primary"
            icon="plus"
            onClick={() => setCreating(true)}
          >
            Create key
          </Button>
        }
      />

      <div className="flex flex-col gap-6 px-4 pt-2 pb-8 sm:px-6 lg:gap-7 lg:px-9 lg:pb-10">
        <About />

        <Card
          title="Keys"
          action={
            <span className="text-faint font-mono text-[11.5px]">
              {keys.length === 0
                ? "none yet"
                : `${live} active of ${keys.length}`}
            </span>
          }
        >
          {ordered.length === 0 ? (
            <p className="text-muted m-0 text-[14px]">
              No keys yet. Nothing outside Plannr can read or change the
              timetable until one is minted — which is the right default, so
              mint one only when there is something waiting for it.
            </p>
          ) : (
            <div className="flex flex-col">
              {ordered.map((key, i) => (
                <KeyRow
                  key={key.id}
                  apiKey={key}
                  labels={labels}
                  first={i === 0}
                  onOpen={() => setOpenKeyId(key.id)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/*
       * The secret is shown alone. It is the one dialog in the app that must
       * not be closed by accident, and rendering it over an editor would give
       * somebody a second panel to click back to and a scrim they think they
       * can dismiss.
       */}
      {secret ? (
        <SecretDialog
          name={secret.name}
          token={secret.token}
          rolled={secret.rolled}
          onClose={() => setSecret(null)}
        />
      ) : (
        <>
          {creating && (
            <CreateKeyDialog
              catalog={catalog}
              granterPermissions={permissions}
              onClose={() => setCreating(false)}
              onMinted={(minted) => {
                setCreating(false);
                setSecret({ ...minted, rolled: false });
              }}
            />
          )}
          {openKey && (
            <KeyDialog
              apiKey={openKey}
              catalog={catalog}
              granterPermissions={permissions}
              onClose={() => setOpenKeyId(null)}
              onRolled={(rolled) => {
                setOpenKeyId(null);
                setSecret({ ...rolled, rolled: true });
              }}
            />
          )}
        </>
      )}
    </>
  );
}

/**
 * The first thing anyone reading this screen needs to understand.
 *
 * Written as prose rather than a bulleted feature list because the three
 * surprising properties of a key — that it is not you, that it holds its own
 * scopes, and that there are things it can never do — are each a consequence
 * of the one before, and a list would present them as unrelated trivia.
 */
function About() {
  return (
    <Card title="What a key is">
      <div className="flex flex-col gap-3 text-[13.5px] leading-relaxed">
        <p className="text-muted m-0">
          An API key lets something that is not a person use Plannr — the room
          display in the foyer, the college website, a script that files next
          term&rsquo;s lectures. The app sends the key as an{" "}
          <span className="text-ink font-mono text-[12.5px]">
            Authorization: Bearer
          </span>{" "}
          header on every request to{" "}
          <span className="text-ink font-mono text-[12.5px]">/api/v1</span>, and
          Plannr answers it exactly as it would answer a signed-in person with
          the same permissions.
        </p>
        <p className="text-muted m-0">
          It does not act as you. Every key gets an account of its own — a
          service principal, hidden from the people screen, carrying the
          key&rsquo;s name — so &ldquo;scheduled by&rdquo; on the lectures it
          books, and the audit trail behind every change it requests, names the
          integration rather than whoever minted it. That record survives the
          key being switched off.
        </p>
        <p className="text-muted m-0">
          A key can do only what its scopes say, and you can grant only scopes
          you hold yourself. Administrator cannot be granted at all: it means
          &ldquo;and everything added in future releases too&rdquo;, which is
          not a promise anybody can make on behalf of an app they no longer
          control.
        </p>
        <p className="text-muted m-0">
          Two things a key can never do, however it is scoped. It cannot call
          the <span className="text-ink font-mono text-[12.5px]">my …</span>{" "}
          endpoints — my week, my day, my attendance — because it has no week of
          its own; an integration names the room, group or member of faculty it
          is asking about. And it cannot manage keys, including itself, so a
          leaked token can neither mint a quiet replacement nor switch off every
          other integration the college has.
        </p>

        <div className="mt-1 flex flex-wrap gap-2">
          <DocLink href="/api/v1/openapi.json">
            Every endpoint, as OpenAPI
          </DocLink>
          <DocLink href="/api/v1/me">Check what a caller is</DocLink>
        </div>
      </div>
    </Card>
  );
}

function DocLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-slate inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
      style={{ background: "rgba(68,88,121,0.08)" }}
    >
      {children}
      <Icon name="arrowRight" size={13} stroke={2.2} color="currentColor" />
    </a>
  );
}

function KeyRow({
  apiKey,
  labels,
  first,
  onOpen,
}: {
  apiKey: ApiKey;
  labels: Map<string, string>;
  first: boolean;
  onOpen: () => void;
}) {
  const status = STATUS_BADGE[apiKey.status];
  const revoked = apiKey.status === "revoked";
  const shown = apiKey.scopes.slice(0, SCOPES_PER_ROW);
  const hidden = apiKey.scopes.length - shown.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full cursor-pointer items-start gap-3 px-1 py-3.5 text-left"
      style={{
        boxShadow: first ? undefined : "inset 0 1px 0 var(--hair-soft)",
        // Still legible, plainly retired. A revoked key is history rather than
        // noise — somebody arrives here looking for one.
        opacity: revoked ? 0.55 : 1,
      }}
    >
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: "var(--card-soft)" }}
      >
        <Icon name="key" size={16} color="var(--slate)" stroke={1.9} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-title text-[14px] font-semibold">
            {apiKey.name}
          </span>
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
          {/* Only flung to the far end once it shares a line: a lone
              right-aligned handle on a phone reads as a stray. */}
          <span className="text-faint font-mono text-[11.5px] break-all sm:ml-auto">
            {tokenHandle(apiKey.prefix, apiKey.last4)}
          </span>
        </span>

        {apiKey.description && (
          <span className="text-muted text-[12.5px]">{apiKey.description}</span>
        )}

        <span className="flex flex-wrap items-center gap-1.5">
          {shown.map((scope) => (
            <Badge key={scope} tone="slate">
              {labels.get(scope) ?? scope}
            </Badge>
          ))}
          {hidden > 0 && (
            <span className="text-faint font-mono text-[11px]">
              +{hidden} more
            </span>
          )}
        </span>

        <span className="text-faint font-mono text-[11.5px]">
          {metaFor(apiKey)}
        </span>
      </span>
    </button>
  );
}

/** The one line that answers "is anything still using this, and how much?". */
function metaFor(apiKey: ApiKey): string {
  const parts = [
    apiKey.createdBy?.name
      ? `by ${apiKey.createdBy.name}`
      : "by a deleted account",
    apiKey.lastUsedAt
      ? `used ${relativeTime(apiKey.lastUsedAt)}`
      : "never used",
    `${apiKey.requestCount.toLocaleString()} request${apiKey.requestCount === 1 ? "" : "s"}`,
  ];

  if (apiKey.revokedAt) {
    parts.push(`revoked ${formatFullDate(apiKey.revokedAt, DEFAULT_TIMEZONE)}`);
  } else if (apiKey.expiresAt) {
    const verb = apiKey.status === "expired" ? "expired" : "expires";
    parts.push(`${verb} ${formatFullDate(apiKey.expiresAt, DEFAULT_TIMEZONE)}`);
  } else {
    parts.push("never expires");
  }

  return parts.join(" · ");
}
