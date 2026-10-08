"use client";

import { useMemo, useState, type ReactNode } from "react";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Icon } from "~/components/ui/icon";
import { DEFAULT_TIMEZONE, formatFullDate } from "~/lib/dates";
import { api } from "~/trpc/react";
import { Button, relativeTime, tokenHandle } from "./controls";
import { CreateKeyDialog } from "./create-key-dialog";
import {
  KeyDialog,
  STATUS_BADGE,
  type ApiKey,
  type ApiKeyPage,
} from "./key-dialog";
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

/**
 * The keys the server component already fetched, wrapped in the envelope they
 * arrived in — which is what React Query needs to seed its cache with now that
 * `apiKeys.list` answers with a page rather than an array.
 *
 * Written out here rather than imported from `~/server/api/pagination`, whose
 * `wholeList` is precisely this: that module sits behind the server boundary,
 * and hauling it across to fill in five fields would put zod in the browser for
 * nothing. The page is the whole estate either way — the procedure's default is
 * set past any plausible number of keys, and this screen never asks for a
 * second page.
 */
const seed = (rows: ApiKey[]): ApiKeyPage => ({
  rows,
  total: rows.length,
  page: 1,
  pageSize: rows.length,
  pageCount: 1,
});

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
    initialData: seed(initialKeys),
  });
  // Memoised only because `ordered` below depends on it: a fresh `[]` every
  // render would re-sort on every keystroke anywhere in the tree.
  const keys = useMemo(() => list.data?.rows ?? [], [list.data]);

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

      {/*
       * The list first, the explanation beside it. Somebody opening this
       * screen has come to audit the keys and act on one; "what a key is" is
       * read once, and as the first card it pushed the list below the fold on
       * every screen (most of a phone's height of prose before the first
       * row). From `lg` it is an aside in its own column; below, it follows
       * the list.
       */}
      <PageBody
        width="wide"
        className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8"
      >
        <Card
          title="Keys"
          action={
            // The words are the ones read out, in the body face with tabular
            // figures; the mono face is for the handles and counts in rows.
            <span className="text-faint text-xs tabular-nums">
              {keys.length === 0
                ? "none yet"
                : `${live} active of ${keys.length}`}
            </span>
          }
        >
          {ordered.length === 0 ? (
            <EmptyState
              compact
              icon="key"
              title="No keys yet."
              action={
                // Not "Create key": that is the header's button, and the one
                // a person (or a test) reaches for by name.
                <Button icon="plus" onClick={() => setCreating(true)}>
                  Create the first key
                </Button>
              }
            >
              Nothing outside Plannr can read or change the timetable until one
              is minted. That is the right default, so mint one only when there
              is something waiting for it.
            </EmptyState>
          ) : (
            <div className="-mx-2 flex flex-col">
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

        <About />
      </PageBody>

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
 * The first thing anyone new to this screen needs to understand, and the
 * thing everybody else has already read — hence beside the list, not above it.
 *
 * Written as prose rather than a bulleted feature list because the three
 * surprising properties of a key — that it is not you, that it holds its own
 * scopes, and that there are things it can never do — are each a consequence
 * of the one before, and a list would present them as unrelated trivia.
 */
function About() {
  return (
    // Plain prose on the paper rather than a card: it is reading matter, not a
    // panel to act in, and a second white box beside the list would compete
    // with it. A hairline above marks where it starts when it follows the list
    // on a narrower screen.
    <aside className="flex flex-col gap-3 pt-5 shadow-[inset_0_1px_0_var(--hair-soft)] lg:pt-1 lg:shadow-none">
      <h2 className="font-display text-title text-md font-semibold tracking-[-0.01em]">
        What a key is
      </h2>
      <div className="text-muted flex max-w-[60ch] flex-col gap-3 text-sm leading-relaxed">
        <p>
          An API key lets something that is not a person use Plannr: the room
          display in the foyer, the college website, a script that files next
          term&rsquo;s lectures. The app sends the key as an{" "}
          <span className="text-ink font-mono text-xs">
            Authorization: Bearer
          </span>{" "}
          header on every request to{" "}
          <span className="text-ink font-mono text-xs">/api/v1</span>, and
          Plannr answers it exactly as it would answer a signed-in person with
          the same permissions.
        </p>
        <p>
          It does not act as you. Every key gets an account of its own (a
          service principal, hidden from the people screen, carrying the
          key&rsquo;s name), so &ldquo;scheduled by&rdquo; on the lectures it
          books, and the audit trail behind every change it requests, names the
          integration rather than whoever minted it. That record survives the
          key being switched off.
        </p>
        <p>
          A key can do only what its scopes say, and you can grant only scopes
          you hold yourself. Administrator cannot be granted at all: it means
          &ldquo;and everything added in future releases too&rdquo;, which is
          not a promise anybody can make on behalf of an app they no longer
          control.
        </p>
        <p>
          Two things a key can never do, however it is scoped. It cannot call
          the <span className="text-ink font-mono text-xs">my …</span> endpoints
          (my week, my day, my attendance), because it has no week of its own;
          an integration names the room, group or member of faculty it is asking
          about. And it cannot manage keys, including itself, so a leaked token
          can neither mint a quiet replacement nor switch off every other
          integration the college has.
        </p>
      </div>

      <div className="flex flex-col items-start">
        <DocLink href="/api/v1/openapi.json">
          Every endpoint, as OpenAPI
        </DocLink>
        <DocLink href="/api/v1/me">Check what a caller is</DocLink>
      </div>
    </aside>
  );
}

/*
 * A text link with an arrow, not a tinted pill: the pills read as one more
 * scope chip, and the chips beside them read as things to press. Tall enough
 * to hit with a thumb below `lg`, where the pointer is a finger.
 */
function DocLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-slate-ink inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline lg:min-h-8"
    >
      {children}
      <Icon name="arrowRight" size={14} stroke={2} />
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
  const [use, life] = metaFor(apiKey);

  return (
    <button
      type="button"
      onClick={onOpen}
      // The hairline between rows is a pseudo-element inset to the content,
      // not the row's own edge, so the hover wash can be a rounded tile of its
      // own without carrying a line across its top.
      className={`group hover:bg-tint-hover relative flex w-full cursor-pointer items-start gap-3 rounded-[10px] px-2 py-3.5 text-left transition-colors duration-150 focus-visible:outline-offset-[-2px] ${
        first
          ? ""
          : "before:bg-hair-soft before:absolute before:inset-x-2 before:top-0 before:h-px"
      }`}
      style={{
        // Still legible, plainly retired. A revoked key is history rather than
        // noise — somebody arrives here looking for one — so it is dimmed
        // only so far: its meta lines are small, and at the old 55% they
        // fell below anything readable.
        opacity: revoked ? 0.7 : 1,
      }}
    >
      <span
        className={`bg-tint mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] ${
          revoked ? "text-faint" : "text-slate"
        }`}
      >
        <Icon name="key" size={16} stroke={1.9} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-title text-base font-semibold">
              {apiKey.name}
            </span>
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
          </span>
          {/* Under the name at every width: flung to the far edge it was a
              long eye-jump from the name on a laptop and a stray on a phone. */}
          <span className="text-muted font-mono text-xs break-all">
            {tokenHandle(apiKey.prefix, apiKey.last4)}
          </span>
        </span>

        {apiKey.description && (
          <span className="text-muted text-sm">{apiKey.description}</span>
        )}

        <span className="flex flex-wrap items-center gap-1.5">
          {shown.map((scope) => (
            <Badge key={scope} tone="slate">
              {labels.get(scope) ?? scope}
            </Badge>
          ))}
          {/* The last chip of the row rather than loose text after it, so on
              a phone it wraps with the chips instead of being left alone. */}
          {hidden > 0 && <Badge>+{hidden} more</Badge>}
        </span>

        <span className="text-faint flex flex-col text-xs tabular-nums">
          <span>{use}</span>
          <span>{life}</span>
        </span>
      </span>

      <Icon
        name="chevronRight"
        size={16}
        stroke={2}
        className="text-faint group-hover:text-muted mt-2 shrink-0 transition-colors"
      />
    </button>
  );
}

/**
 * The two lines that answer "is anything still using this, and how much?",
 * and "who made it, and how long has it got?". Two, so no line carries more
 * than one middle dot, and so a phone wraps each fact whole rather than
 * starting a line on a dot.
 */
function metaFor(apiKey: ApiKey): [string, ReactNode] {
  const requests = `${apiKey.requestCount.toLocaleString()} request${apiKey.requestCount === 1 ? "" : "s"}`;
  const used = apiKey.lastUsedAt
    ? `used ${relativeTime(apiKey.lastUsedAt)}`
    : "never used";

  const by = apiKey.createdBy?.name
    ? `By ${apiKey.createdBy.name}`
    : "By a deleted account";
  // The date is one unit: at 390px "expires Wed, 28 Oct 2026" would otherwise
  // break between the weekday and the day, leaving "Wed," orphaned.
  const date = (when: Date) => (
    <span className="whitespace-nowrap">
      {formatFullDate(when, DEFAULT_TIMEZONE)}
    </span>
  );
  let life: ReactNode;
  if (apiKey.revokedAt) {
    life = <>revoked {date(apiKey.revokedAt)}</>;
  } else if (apiKey.expiresAt) {
    const verb = apiKey.status === "expired" ? "expired" : "expires";
    life = (
      <>
        {verb} {date(apiKey.expiresAt)}
      </>
    );
  } else {
    life = "never expires";
  }

  return [
    `${requests} · ${used}`,
    <>
      {by} · {life}
    </>,
  ];
}
