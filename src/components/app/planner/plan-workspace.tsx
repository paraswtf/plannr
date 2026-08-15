"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { formatFullDate } from "~/lib/dates";
import {
  PLAN_STATUS_HINT,
  PLAN_STATUS_LABEL,
  PLAN_STATUS_TONE,
} from "~/lib/schedule-plan";
import { api } from "~/trpc/react";
import { ApplyDialog } from "./apply-dialog";
import { DemandPanel } from "./demand-panel";
import { PlanSettingsDialog } from "./plan-settings-dialog";
import { ReviewPanel } from "./review-panel";
import { ShareDialog } from "./share-dialog";
import { TimetablePanel } from "./timetable-panel";

/**
 * One plan, from demand to sign-off.
 *
 * The three tabs are the three stages a plan goes through, in order, and the
 * header carries the two irreversible actions — sharing and applying — because
 * they belong to the plan as a whole rather than to any one tab.
 */
// What this viewer may do comes from the server on the plan itself (`can`),
// not from their permission bits alone: the same person can edit one plan and
// only read another, because authorship and the plan's stage both matter.
export function PlanWorkspace({ planId }: { planId: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [tab, setTab] = useState<"demand" | "timetable" | "review">("demand");
  const [sharing, setSharing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flash, setFlash] = useState<{ text: string; bad?: boolean } | null>(
    null,
  );

  const plan = api.plans.byId.useQuery({ id: planId });

  const refresh = async () => {
    await utils.plans.invalidate();
  };

  const generate = api.plans.generate.useMutation({
    onSuccess: async (result) => {
      await refresh();
      setTab("timetable");
      setFlash({
        text:
          result.unplaced === 0
            ? `Laid out ${result.placed} sessions with no clashes.`
            : `Placed ${result.placed}, but ${result.unplaced} would not fit — see what is blocking them.`,
        bad: result.unplaced > 0,
      });
    },
    onError: (e) => setFlash({ text: e.message, bad: true }),
  });

  const withdraw = api.plans.withdraw.useMutation({
    onSuccess: async () => {
      await refresh();
      setFlash({ text: "Pulled back out of review. It is private again." });
    },
    onError: (e) => setFlash({ text: e.message, bad: true }),
  });

  const revise = api.plans.revise.useMutation({
    onSuccess: async (copy) => {
      await refresh();
      router.push(`/planner/${copy.id}`);
    },
    onError: (e) => setFlash({ text: e.message, bad: true }),
  });

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 6_000);
    return () => clearTimeout(id);
  }, [flash]);

  if (plan.isLoading) {
    return (
      <>
        <PageHeader title="Schedule builder" />
        <div className="px-9 pt-2 pb-10">
          <Card>
            <p className="text-muted m-0 text-[14px]">Loading the plan…</p>
          </Card>
        </div>
      </>
    );
  }

  if (plan.error || !plan.data) {
    return (
      <>
        <PageHeader title="Schedule builder" />
        <div className="px-9 pt-2 pb-10">
          <Card>
            <p className="text-title m-0 text-[14px] font-semibold">
              {plan.error?.data?.code === "NOT_FOUND"
                ? "That plan does not exist, or it is still a private draft."
                : (plan.error?.message ?? "That plan could not be opened.")}
            </p>
            <Link
              href="/planner"
              className="text-slate mt-3 inline-block text-[13px] font-bold"
            >
              ← Back to all plans
            </Link>
          </Card>
        </div>
      </>
    );
  }

  const data = plan.data;
  const placed = data.sessions.filter((s) => s.dayOfWeek !== null).length;
  const unplaced = data.sessions.length - placed;
  const openComments = data.comments.filter((c) => !c.resolvedAt).length;
  const pendingReviewers = data.reviewers.filter(
    (r) => r.decision === "PENDING",
  ).length;

  return (
    <>
      <PageHeader
        title={data.name}
        subtitle={`${PLAN_STATUS_HINT[data.status]} · week of ${formatFullDate(
          data.weekStart,
          data.timeZone,
        )}${data.repeatUntil ? ` until ${formatFullDate(data.repeatUntil, data.timeZone)}` : ""}`}
        actions={
          <>
            <Link
              href="/planner"
              className="text-muted rounded-[var(--radius-btn)] px-3 py-2 text-[13px] font-semibold"
              style={{ boxShadow: "var(--ring)" }}
            >
              All plans
            </Link>

            {data.can.edit && (
              <>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Plan settings"
                  title="Plan settings"
                  className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-[var(--radius-btn)]"
                  style={{ boxShadow: "var(--ring)" }}
                >
                  <Icon name="settings" size={15} color="var(--muted)" />
                </button>
                <button
                  type="button"
                  disabled={generate.isPending || data.requirements.length === 0}
                  onClick={() => generate.mutate({ id: data.id })}
                  className="flex items-center gap-2 rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold text-white"
                  style={{
                    background: "var(--slate)",
                    opacity:
                      generate.isPending || data.requirements.length === 0
                        ? 0.5
                        : 1,
                    cursor:
                      generate.isPending || data.requirements.length === 0
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  <Icon name="sparkles" size={15} color="#fff" />
                  {generate.isPending
                    ? "Working…"
                    : data.sessions.length > 0
                      ? "Regenerate"
                      : "Generate timetable"}
                </button>
              </>
            )}

            {data.can.share && data.status === "DRAFT" && (
              <button
                type="button"
                onClick={() => setSharing(true)}
                className="cursor-pointer rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold text-white"
                style={{ background: "var(--grad-brand)" }}
              >
                Share for approval
              </button>
            )}

            {data.can.share && data.status === "IN_REVIEW" && (
              <button
                type="button"
                onClick={() => withdraw.mutate({ id: data.id })}
                className="text-muted cursor-pointer rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold"
                style={{ boxShadow: "var(--ring)" }}
              >
                Withdraw
              </button>
            )}

            {data.can.revise && data.status !== "DRAFT" && (
              <button
                type="button"
                disabled={revise.isPending}
                onClick={() => revise.mutate({ id: data.id })}
                className="text-muted cursor-pointer rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold"
                style={{ boxShadow: "var(--ring)" }}
              >
                {revise.isPending ? "Copying…" : "Revise as new draft"}
              </button>
            )}

            {data.can.apply && (
              <button
                type="button"
                onClick={() => setApplying(true)}
                className="cursor-pointer rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold text-white"
                style={{ background: "var(--grad-brand)" }}
              >
                Apply to timetable
              </button>
            )}
          </>
        }
      />

      <div className="px-9 pt-2 pb-10">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Badge tone={PLAN_STATUS_TONE[data.status]} dot>
            {PLAN_STATUS_LABEL[data.status]}
          </Badge>
          {data.version > 1 && <Badge tone="neutral">version {data.version}</Badge>}
          {data.semester && <Badge tone="slate">{data.semester.name}</Badge>}
          <span className="text-faint font-mono text-[12px]">
            by {data.author.name}
          </span>
          {data.status === "IN_REVIEW" && pendingReviewers > 0 && (
            <span className="text-muted text-[12.5px]">
              waiting on {pendingReviewers}{" "}
              {pendingReviewers === 1 ? "person" : "people"}
            </span>
          )}
        </div>

        {data.status === "CHANGES_REQUESTED" && (
          <Banner tone="red">
            A reviewer asked for changes. This draft is locked — take a copy with{" "}
            <b>Revise as new draft</b>, fix it there, and share it again for a
            fresh round of approvals.
          </Banner>
        )}
        {data.status === "APPLIED" && (
          <Banner tone="green">
            These classes are on the live timetable.{" "}
            <Link href="/timetable" className="font-bold underline">
              Open the timetable
            </Link>
            .
          </Banner>
        )}
        {data.status === "APPROVED" && data.can.apply && (
          <Banner tone="green">
            Everyone signed off. <b>Apply to timetable</b> will schedule{" "}
            {placed} recurring {placed === 1 ? "class" : "classes"}.
          </Banner>
        )}

        <div className="mb-5">
          <Segmented
            items={[
              {
                value: "demand" as const,
                label: `Demand (${data.requirements.length})`,
              },
              {
                value: "timetable" as const,
                label: unplaced > 0 ? `Timetable (${unplaced} unplaced)` : "Timetable",
              },
              {
                value: "review" as const,
                label: openComments > 0 ? `Review (${openComments})` : "Review",
              },
            ]}
            value={tab}
            onChange={setTab}
            size="sm"
          />
        </div>

        {tab === "demand" && <DemandPanel plan={data} onChanged={refresh} />}
        {tab === "timetable" && (
          <TimetablePanel plan={data} onChanged={refresh} />
        )}
        {tab === "review" && <ReviewPanel plan={data} onChanged={refresh} />}
      </div>

      {sharing && (
        <ShareDialog
          planId={data.id}
          existingReviewerIds={data.reviewers.map((r) => r.userId)}
          onClose={() => setSharing(false)}
          onShared={async () => {
            await refresh();
            setTab("review");
            setFlash({ text: "Shared. The reviewers can see it now." });
          }}
        />
      )}

      {applying && (
        <ApplyDialog
          planId={data.id}
          planName={data.name}
          onClose={() => setApplying(false)}
          onApplied={refresh}
        />
      )}

      {settingsOpen && (
        <PlanSettingsDialog
          plan={data}
          onClose={() => setSettingsOpen(false)}
          onSaved={refresh}
        />
      )}

      {flash && (
        <div
          className="plr-toast fixed right-8 bottom-8 z-40 flex items-center gap-2.5 rounded-xl px-4 py-3"
          style={{
            background: "var(--surface)",
            boxShadow: "var(--ring), var(--shadow-float)",
          }}
        >
          <Icon
            name={flash.bad ? "alert" : "checkCircle"}
            size={18}
            color={flash.bad ? "var(--red)" : "#4e7d3a"}
            stroke={2}
          />
          <span className="text-title max-w-[360px] text-[13.5px] font-semibold">
            {flash.text}
          </span>
          <button
            type="button"
            onClick={() => setFlash(null)}
            aria-label="Dismiss"
            className="ml-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg"
          >
            <Icon name="x" size={13} color="var(--muted)" />
          </button>
        </div>
      )}
    </>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "red" | "green";
  children: React.ReactNode;
}) {
  const tones = {
    red: {
      background: "rgba(220,56,72,0.07)",
      boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)",
      color: "#b02636",
    },
    green: {
      background: "rgba(78,125,58,0.08)",
      boxShadow: "inset 0 0 0 1px rgba(78,125,58,0.3)",
      color: "#3f6a2e",
    },
  };
  return (
    <div className="mb-5 rounded-xl p-3.5 text-[13px]" style={tones[tone]}>
      {children}
    </div>
  );
}
