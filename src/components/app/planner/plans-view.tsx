"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Button, buttonClass } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { EmptyState } from "~/components/ui/empty-state";
import {
  pickerPage,
  SearchSelect,
  useDebounced,
} from "~/components/ui/entity-picker";
import { Field, Input } from "~/components/ui/field";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { Skeleton } from "~/components/ui/skeleton";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import {
  PLAN_STATUS_LABEL,
  PLAN_STATUS_TONE,
  type PlanStatusName,
} from "~/lib/schedule-plan";
import { api } from "~/trpc/react";

/**
 * The schedule builder's front door.
 *
 * Two things live here that nowhere else in the app does: a plan that only its
 * author can see, and a plan waiting on *this* person's sign-off. The scope
 * tabs are built around that, because "what am I holding up?" is the question a
 * reviewer opens this screen to answer.
 *
 * So the page leads with that answer. Plans waiting on the reader come first,
 * as their own short queue, and everything else is one dense list under it.
 * The row of three stat cards that used to open the page is gone: it took a
 * phone's whole first screen, and its numbers were counted from the current
 * page of the current tab, so "Needs my review" turned "Plans" into 1 and "On
 * the timetable" into 0.
 */
export function PlansView({ permissions }: { permissions: string }) {
  const bits = new PermissionBitField(BigInt(permissions));
  const canBuild = bits.has(PermissionFlags.ManageSchedulePlans);

  const [scope, setScope] = useState<"all" | "mine" | "shared" | "review">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const debounced = useDebounced(query);
  useEffect(() => setPage(1), [debounced, scope]);

  const plans = api.plans.list.useQuery(
    { scope, query: debounced || undefined, page, pageSize: 24 },
    { placeholderData: (prev) => prev },
  );

  const rows = plans.data?.rows ?? [];
  const total = plans.data?.total ?? 0;
  /** The envelope reports where the page sits, and leaves this to the reader. */
  const hasMore = page < (plans.data?.pageCount ?? 1);

  // The queue is the reviewer's to-do list, so it is shown where the list
  // beneath it is broader than that to-do: not on "Needs my review", where the
  // whole list already is the queue, and not on "Mine", since nobody signs off
  // their own plan.
  //
  // It has a query of its own, because the list's page and search box would
  // otherwise decide what is in it: a plan waiting on the reader on page two,
  // or one the search text does not match, has to be found just the same.
  const queueScope = scope === "all" || scope === "shared";
  const queue = api.plans.list.useQuery(
    { scope: "review", page: 1, pageSize: 100 },
    { enabled: queueScope },
  );
  const awaitingMe = queue.data?.rows ?? [];
  const showQueue = queueScope && awaitingMe.length > 0;

  return (
    <>
      <PageHeader
        title="Schedule builder"
        subtitle="Draft a term's timetable from the lectures each group needs, then share it for sign-off"
        actions={
          canBuild ? (
            <Button
              variant="primary"
              icon="plus"
              onClick={() => setCreating(true)}
            >
              New plan
            </Button>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        {showQueue && (
          <SignOffQueue plans={awaitingMe} total={queue.data?.total ?? 0} />
        )}

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Segmented
              items={[
                { value: "all" as const, label: "All" },
                { value: "mine" as const, label: "Mine" },
                { value: "shared" as const, label: "Shared" },
                { value: "review" as const, label: "Needs my review" },
              ]}
              value={scope}
              onChange={setScope}
              size="sm"
            />
            <Input
              icon="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, term or author…"
              aria-label="Search plans"
              className="w-full sm:w-64"
            />
            {/* A count, so tabular, but set in the body face: it is a phrase,
                not a code, and mono made "7 plans" look like a log line. */}
            <span className="text-muted text-sm tabular-nums sm:ml-auto">
              {total} {total === 1 ? "plan" : "plans"}
            </span>
          </div>

          {plans.isLoading ? (
            <PlanListSkeleton />
          ) : rows.length > 0 ? (
            <PlanList plans={rows} />
          ) : (
            <Card pad={0}>
              {/* The existing sentences stay; where one was the whole message
                  it is now the title, so the box does not say it twice. The
                  New plan here is secondary: the header's is already the
                  page's one filled button. */}
              <EmptyState
                icon={scope === "review" ? "checkCircle" : "sparkles"}
                title={
                  debounced
                    ? "No plans match that search"
                    : scope === "review"
                      ? "Nothing is waiting on your review."
                      : canBuild
                        ? "No plans yet"
                        : "No plans have been shared with you yet."
                }
                action={
                  canBuild && scope !== "review" && !debounced ? (
                    <Button icon="plus" onClick={() => setCreating(true)}>
                      New plan
                    </Button>
                  ) : undefined
                }
              >
                {debounced
                  ? "Try a shorter name, a term or an author, or clear the search to see every plan."
                  : scope !== "review" && canBuild
                    ? "Start one, paste in what each group needs, and the builder will lay out the week."
                    : undefined}
              </EmptyState>
            </Card>
          )}
        </section>

        {(plans.data?.pageCount ?? 1) > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button
              size="sm"
              icon="chevronLeft"
              disabled={page === 1}
              onClick={() => setPage((n) => n - 1)}
            >
              Previous
            </Button>
            <span className="text-muted text-xs tabular-nums">
              Page {page} of {plans.data?.pageCount}
            </span>
            <Button
              size="sm"
              iconAfter="chevronRight"
              disabled={!hasMore}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </PageBody>

      {creating && <NewPlanDialog onClose={() => setCreating(false)} />}
    </>
  );
}

type PlanRow = {
  id: string;
  name: string;
  status: PlanStatusName;
  version: number;
  termName: string | null;
  isMine: boolean;
  authorName: string;
  updatedAt: Date;
  requirementCount: number;
  sessionCount: number;
  commentCount: number;
  reviewerCount: number;
  approvedCount: number;
  awaitingMe: boolean;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** "Autumn 2026 · by Ritu Bhosale, v2": one middle dot, the rest commas. */
function planMeta(plan: PlanRow) {
  return `${plan.termName ?? "No term"} · ${
    plan.isMine ? "yours" : `by ${plan.authorName}`
  }${plan.version > 1 ? `, v${plan.version}` : ""}`;
}

/**
 * Plans waiting on this reader's sign-off.
 *
 * Warn-washed, because each one is a decision somebody else is waiting on, and
 * it is the one block on the page that should be found before it is looked
 * for. A row opens the plan, the same as in the list below.
 */
function SignOffQueue({ plans, total }: { plans: PlanRow[]; total: number }) {
  return (
    <section
      aria-labelledby="plans-queue-title"
      className="bg-warn-wash rounded-[var(--radius-card)] p-1.5 shadow-[inset_0_0_0_1px_var(--warn-line)]"
    >
      <div className="flex items-center gap-2 px-3 pt-2 pb-2.5">
        <Icon name="alert" size={16} stroke={2} className="text-warn" />
        <h2
          id="plans-queue-title"
          className="font-display text-title text-md font-semibold tracking-[-0.01em]"
        >
          Waiting on your sign-off
        </h2>
        <span className="text-warn text-sm font-semibold tabular-nums">
          {total}
        </span>
      </div>
      {/* Concentric with the wash around it: 14px outside, 6px of padding, 8px
          here, so the white plate reads as sitting in the tray. */}
      <ul className="bg-surface overflow-hidden rounded-[8px] shadow-[var(--ring)]">
        {plans.map((plan) => (
          <li
            key={plan.id}
            className="shadow-[inset_0_-1px_0_var(--hair-soft)] last:shadow-none"
          >
            <Link
              href={`/planner/${plan.id}`}
              className="plr-clip hover:bg-tint-hover flex items-center gap-3 px-3.5 py-3 focus-visible:-outline-offset-2"
            >
              <span className="min-w-0 flex-1">
                <span className="text-title block text-base font-semibold">
                  {plan.name}
                </span>
                <span className="text-muted block text-sm">
                  {planMeta(plan)}
                </span>
              </span>
              <span className="text-muted hidden text-sm tabular-nums sm:inline">
                {plan.approvedCount} of {plan.reviewerCount} approved
              </span>
              <span
                aria-hidden
                className={buttonClass(
                  "secondary",
                  "sm",
                  "pointer-events-none",
                )}
              >
                Review
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Every plan as one row each, in a single panel.
 *
 * It used to be a grid of identical cards, each truncating its name at about
 * 26 characters and ending in an "Open →" that repeated what the whole card
 * already did. A row gives the name the width it needs and lines the status,
 * sign-off and contents up in columns that can be scanned down. Below `xl`
 * the columns fold into a second line under the name: the fixed columns
 * and their gaps take 576px whatever the screen, so at `md` on a laptop or a
 * landscape tablet they left the name, which this list exists to show, about
 * 100px and wrapped it over five lines beside half-empty columns. From 1280
 * up the name keeps about 350px beside the open sidebar, and gains the rest.
 */
function PlanList({ plans }: { plans: PlanRow[] }) {
  const columns =
    "xl:grid-cols-[minmax(0,1fr)_150px_140px_190px_16px] xl:gap-x-5";
  return (
    // Clipped, so a hovered first or last row keeps the panel's corners; the
    // rows draw their focus ring inside themselves for the same reason.
    <div className="bg-surface overflow-hidden rounded-[var(--radius-card)] shadow-[var(--ring),var(--shadow-card)]">
      <div
        aria-hidden
        className={`text-muted text-2xs hidden px-5 py-2.5 font-semibold shadow-[inset_0_-1px_0_var(--hair)] xl:grid ${columns}`}
      >
        <span>Plan</span>
        <span>Status</span>
        <span>Sign-off</span>
        <span>Contents</span>
        <span />
      </div>
      <ul>
        {plans.map((plan) => (
          <li
            key={plan.id}
            className="shadow-[inset_0_-1px_0_var(--hair-soft)] last:shadow-none"
          >
            <PlanRowLink plan={plan} columns={columns} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlanRowLink({ plan, columns }: { plan: PlanRow; columns: string }) {
  const signOff =
    plan.reviewerCount > 0 ? (
      <span
        className={
          plan.approvedCount === plan.reviewerCount ? "text-good" : "text-ink"
        }
      >
        {plan.approvedCount} of {plan.reviewerCount} approved
      </span>
    ) : (
      <span className="text-faint">Not shared yet</span>
    );

  return (
    <Link
      href={`/planner/${plan.id}`}
      className={`plr-clip hover:bg-tint-hover grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3.5 focus-visible:-outline-offset-2 sm:px-5 ${columns}`}
    >
      <span className="min-w-0">
        <span className="text-title block text-base font-semibold text-balance">
          {plan.name}
        </span>
        <span className="text-muted block text-sm">{planMeta(plan)}</span>
        {/* What the desktop columns say, folded into one line below `xl`. */}
        <span className="mt-1 block text-xs tabular-nums xl:hidden">
          {signOff}
          <span className="text-faint">
            {" "}
            · {plural(plan.sessionCount, "session", "sessions")}
          </span>
        </span>
      </span>

      <span className="flex flex-col items-end gap-1 xl:items-start">
        <Badge tone={PLAN_STATUS_TONE[plan.status]}>
          {PLAN_STATUS_LABEL[plan.status]}
        </Badge>
        {plan.awaitingMe && <Badge tone="red">Needs you</Badge>}
      </span>

      <span className="hidden text-sm tabular-nums xl:block">{signOff}</span>

      <span className="text-muted hidden text-sm tabular-nums xl:block">
        {plural(plan.requirementCount, "subject", "subjects")},{" "}
        {plural(plan.sessionCount, "session", "sessions")}
        {plan.commentCount > 0 && (
          <span className="text-faint block text-xs">
            {plural(plan.commentCount, "comment", "comments")}
          </span>
        )}
      </span>

      <Icon
        name="chevronRight"
        size={16}
        className="text-faint hidden xl:block"
      />
    </Link>
  );
}

/** Rows the shape of the list, so nothing jumps when the plans arrive. */
function PlanListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading plans"
      className="bg-surface rounded-[var(--radius-card)] shadow-[var(--ring),var(--shadow-card)]"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-4 shadow-[inset_0_-1px_0_var(--hair-soft)] last:shadow-none sm:px-5"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-56 max-w-full" />
            <Skeleton className="h-3 w-36 max-w-full" />
          </span>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

function NewPlanDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const [semesterId, setTermId] = useState("");
  const [termQuery, setTermQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const terms = api.groups.termList.useQuery({
    query: useDebounced(termQuery) || undefined,
    pageSize: 20,
    includeIds: semesterId ? [semesterId] : undefined,
  });
  const selected = terms.data?.rows.find((t) => t.id === semesterId);

  const create = api.plans.create.useMutation({
    onSuccess: async (plan) => {
      await utils.plans.invalidate();
      router.push(`/planner/${plan.id}`);
    },
    onError: (e) => setError(e.message),
  });

  const ready = name.trim().length > 0;

  return (
    <Dialog
      open
      title="New schedule plan"
      icon="sparkles"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready || create.isPending}
            onClick={() =>
              create.mutate({
                name: name.trim(),
                semesterId: semesterId || undefined,
              })
            }
          >
            {create.isPending ? "Creating…" : "Create draft"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}

        <Field label="Plan name">
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Sem III, Autumn 2026"
            />
          )}
        </Field>

        <Field
          label="Term"
          optional
          hint="Picking a term fills in the weeks the plan runs for. You can change them afterwards."
        >
          {(id) => (
            <SearchSelect
              id={id}
              value={
                selected
                  ? { id: selected.id, label: selected.name, hint: null }
                  : null
              }
              onChange={(id) => setTermId(id ?? "")}
              page={pickerPage(terms.data, (rows) =>
                rows.map((t) => ({
                  id: t.id,
                  label: t.name,
                  card: {
                    label: t.name,
                    avatar: {
                      kind: "icon" as const,
                      name: "calendar" as const,
                    },
                    title: t.name,
                    // A range, so a plain hyphen rather than the en dash it was.
                    subtitle: `${new Intl.DateTimeFormat("en-GB", {
                      day: "numeric",
                      month: "short",
                    }).format(t.startDate)} - ${new Intl.DateTimeFormat(
                      "en-GB",
                      {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      },
                    ).format(t.endDate)}`,
                  },
                })),
              )}
              loading={terms.isLoading}
              query={termQuery}
              onQueryChange={setTermQuery}
              placeholder="Search terms…"
              emptyOption="No term"
              listId="new-plan-term"
            />
          )}
        </Field>

        <p className="text-muted m-0 text-sm">
          The draft starts private. Nobody else sees it until you share it for
          approval.
        </p>
      </div>
    </Dialog>
  );
}
