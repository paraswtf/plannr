"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { SearchSelect, useDebounced } from "~/components/ui/entity-picker";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { Stat } from "~/components/ui/stat";
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
 */
export function PlansView({ permissions }: { permissions: string }) {
  const bits = new PermissionBitField(BigInt(permissions));
  const canBuild = bits.has(PermissionFlags.ManageSchedulePlans);

  const [scope, setScope] = useState<"all" | "mine" | "shared" | "review">("all");
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
  const awaitingMe = rows.filter((p) => p.awaitingMe).length;

  return (
    <>
      <PageHeader
        title="Schedule builder"
        subtitle="Draft a term's timetable from the lectures each group needs, then share it for sign-off"
        actions={
          canBuild ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="cursor-pointer rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold text-white"
              style={{ background: "var(--grad-brand)" }}
            >
              + New plan
            </button>
          ) : undefined
        }
      />

      <div className="px-9 pt-2 pb-10">
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Plans"
            value={plans.data?.total ?? 0}
            note="drafts and shared plans you can open"
            icon="sparkles"
            tone="slate"
          />
          <Stat
            label="Waiting on you"
            value={awaitingMe}
            note={
              awaitingMe > 0
                ? "shared with you for approval"
                : "nothing needs your sign-off"
            }
            icon="check"
            tone={awaitingMe > 0 ? "orange" : "green"}
            delta={awaitingMe > 0 ? "review" : undefined}
            deltaTone="red"
          />
          <Stat
            label="On the timetable"
            value={rows.filter((p) => p.status === "APPLIED").length}
            note="plans already applied"
            icon="calendar"
            tone="green"
          />
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-3">
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
          <div className="relative w-64">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
              <Icon name="search" size={15} color="var(--faint)" />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search plans…"
              className="bg-surface w-full rounded-[10px] py-2 pr-3 pl-9 text-[13.5px] outline-none"
              style={{ boxShadow: "var(--ring)" }}
            />
          </div>
          <span className="text-faint ml-auto font-mono text-[12px]">
            {plans.data?.total ?? 0} plans
          </span>
        </div>

        {rows.length > 0 ? (
          <div className="grid [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))] gap-4">
            {rows.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        ) : (
          <Card>
            <p className="text-muted m-0 text-[14px]">
              {plans.isLoading
                ? "Loading…"
                : scope === "review"
                  ? "Nothing is waiting on your review."
                  : canBuild
                    ? "No plans yet. Start one, paste in what each group needs, and the builder will lay out the week."
                    : "No plans have been shared with you yet."}
            </p>
          </Card>
        )}

        {(plans.data?.pageCount ?? 1) > 1 && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((n) => n - 1)}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
              style={{ boxShadow: "var(--ring)", opacity: page === 1 ? 0.4 : 1 }}
            >
              Previous
            </button>
            <span className="text-faint font-mono text-[12px]">
              page {page} of {plans.data?.pageCount}
            </span>
            <button
              type="button"
              disabled={!plans.data?.hasMore}
              onClick={() => setPage((n) => n + 1)}
              className="cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
              style={{
                boxShadow: "var(--ring)",
                opacity: plans.data?.hasMore ? 1 : 0.4,
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>

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

function PlanCard({ plan }: { plan: PlanRow }) {
  return (
    <Link href={`/planner/${plan.id}`} className="block">
      <Card hover pad={18} className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="font-display text-title block truncate text-[16px] font-bold">
              {plan.name}
            </span>
            <span className="text-faint block truncate text-[12px]">
              {plan.termName ?? "No term"} ·{" "}
              {plan.isMine ? "yours" : `by ${plan.authorName}`}
              {plan.version > 1 && ` · v${plan.version}`}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <Badge tone={PLAN_STATUS_TONE[plan.status]} dot>
              {PLAN_STATUS_LABEL[plan.status]}
            </Badge>
            {plan.awaitingMe && <Badge tone="red">needs you</Badge>}
          </span>
        </div>

        <div className="text-muted flex flex-wrap items-center gap-3 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="layers" size={14} color="var(--faint)" />
            {plan.requirementCount}{" "}
            {plan.requirementCount === 1 ? "subject" : "subjects"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="calendar" size={14} color="var(--faint)" />
            {plan.sessionCount} sessions
          </span>
          {plan.commentCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="book" size={14} color="var(--faint)" />
              {plan.commentCount}
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between pt-1">
          {plan.reviewerCount > 0 ? (
            <Badge
              tone={
                plan.approvedCount === plan.reviewerCount ? "green" : "orange"
              }
              dot
            >
              {plan.approvedCount} of {plan.reviewerCount} approved
            </Badge>
          ) : (
            <span className="text-faint text-[12px]">Not shared yet</span>
          )}
          <span className="text-slate text-[13px] font-bold">Open →</span>
        </div>
      </Card>
    </Link>
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
          <button
            type="button"
            onClick={onClose}
            className="text-muted cursor-pointer rounded-lg px-3.5 py-2 text-[13px] font-semibold"
            style={{ boxShadow: "var(--ring)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready || create.isPending}
            onClick={() =>
              create.mutate({ name: name.trim(), semesterId: semesterId || undefined })
            }
            className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white"
            style={{
              background: "var(--grad-brand)",
              opacity: ready && !create.isPending ? 1 : 0.5,
              cursor: ready && !create.isPending ? "pointer" : "not-allowed",
            }}
          >
            {create.isPending ? "Creating…" : "Create draft"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {error && (
          <div
            className="rounded-xl p-3 text-[13px] font-medium text-[#b02636]"
            style={{
              background: "rgba(220,56,72,0.07)",
              boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)",
            }}
          >
            {error}
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[13px] font-semibold">Plan name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="e.g. Sem III — Autumn 2026"
            className="bg-surface w-full rounded-[10px] px-3 py-2 text-[13.5px] outline-none"
            style={{ boxShadow: "var(--ring)" }}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[13px] font-semibold">Term</span>
          <SearchSelect
            value={
              selected
                ? { id: selected.id, label: selected.name, hint: null }
                : null
            }
            onChange={(id) => setTermId(id ?? "")}
            page={
              terms.data && {
                ...terms.data,
                rows: terms.data.rows.map((t) => ({
                  id: t.id,
                  label: t.name,
                  card: {
                    label: t.name,
                    avatar: { kind: "icon" as const, name: "calendar" as const },
                    title: t.name,
                    subtitle: `${new Intl.DateTimeFormat("en-GB", {
                      day: "numeric",
                      month: "short",
                    }).format(t.startDate)} – ${new Intl.DateTimeFormat("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }).format(t.endDate)}`,
                  },
                })),
              }
            }
            loading={terms.isLoading}
            query={termQuery}
            onQueryChange={setTermQuery}
            placeholder="Search terms…"
            emptyOption="No term"
            listId="new-plan-term"
          />
          <span className="text-faint text-[11.5px]">
            Picking a term fills in the weeks the plan runs for. You can change
            them afterwards.
          </span>
        </label>

        <p className="text-muted m-0 text-[12.5px]">
          The draft starts private. Nobody else sees it until you share it for
          approval.
        </p>
      </div>
    </Dialog>
  );
}
