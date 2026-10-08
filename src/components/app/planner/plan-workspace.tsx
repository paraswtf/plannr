"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import {
  Button,
  buttonClass,
  IconButton,
  type ButtonVariant,
} from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { Skeleton } from "~/components/ui/skeleton";
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
            : `Placed ${result.placed}, but ${result.unplaced} would not fit. See what is blocking them on the timetable.`,
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
        <PageBody>
          <WorkspaceSkeleton />
        </PageBody>
      </>
    );
  }

  if (plan.error || !plan.data) {
    return (
      <>
        <PageHeader title="Schedule builder" />
        <PageBody width="narrow">
          <Card pad={0}>
            <EmptyState
              icon="alert"
              title={
                plan.error?.data?.code === "NOT_FOUND"
                  ? "That plan does not exist, or it is still a private draft."
                  : (plan.error?.message ?? "That plan could not be opened.")
              }
              action={
                <Link
                  href="/planner"
                  className={buttonClass("secondary", "md")}
                >
                  <Icon name="chevronLeft" size={15} stroke={2} />
                  Back to all plans
                </Link>
              }
            />
          </Card>
        </PageBody>
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

  /*
   * One filled button per stage: the next thing this plan is waiting for. It
   * used to be a slate Regenerate beside a gradient Share, two loud fills
   * pulling against each other on every draft. An approved plan waits to be
   * applied; a drafted week waits to be shared; a draft with demand but no
   * week waits to be generated; a refused one waits to be revised. A plan in
   * review is waiting on other people, so nothing here is filled at all, and
   * neither is an empty draft, whose next step ("Add a subject") is the empty
   * state's own button below.
   */
  const primary: "apply" | "share" | "generate" | "revise" | null = data.can
    .apply
    ? "apply"
    : data.can.share && data.status === "DRAFT" && data.sessions.length > 0
      ? "share"
      : data.can.edit && data.status === "DRAFT" && data.requirements.length > 0
        ? "generate"
        : data.can.revise && data.status === "CHANGES_REQUESTED"
          ? "revise"
          : null;
  const variantFor = (action: NonNullable<typeof primary>): ButtonVariant =>
    primary === action ? "primary" : "secondary";

  const range = `Week of ${formatFullDate(data.weekStart, data.timeZone)}${
    data.repeatUntil
      ? ` until ${formatFullDate(data.repeatUntil, data.timeZone)}`
      : ""
  }`;

  return (
    <>
      <PageHeader
        title={data.name}
        // Two sentences rather than a sentence glued to a date by ". ·": the
        // stage hint says who can see the plan, the range says when it runs.
        subtitle={`${PLAN_STATUS_HINT[data.status]} ${range}.`}
        back={{ href: "/planner", label: "All plans" }}
        actions={
          // A plan can offer six actions at once, and on a phone that is more
          // than one row of the header. Each label keeps its leading word and
          // drops the qualifier below `sm`; the button's aria-label carries the
          // whole phrase, so nothing is lost to anyone reading it aloud.
          <>
            {data.can.edit && (
              <>
                <IconButton
                  icon="settings"
                  label="Plan settings"
                  variant="secondary"
                  onClick={() => setSettingsOpen(true)}
                />
                <Button
                  variant={variantFor("generate")}
                  icon="sparkles"
                  disabled={
                    generate.isPending || data.requirements.length === 0
                  }
                  onClick={() => generate.mutate({ id: data.id })}
                  aria-label={
                    data.sessions.length > 0
                      ? "Regenerate timetable"
                      : "Generate timetable"
                  }
                >
                  {generate.isPending ? (
                    "Working…"
                  ) : data.sessions.length > 0 ? (
                    "Regenerate"
                  ) : (
                    <span>
                      Generate
                      <span className="hidden sm:inline"> timetable</span>
                    </span>
                  )}
                </Button>
              </>
            )}

            {data.can.share && data.status === "DRAFT" && (
              <Button
                variant={variantFor("share")}
                onClick={() => setSharing(true)}
                aria-label="Share for approval"
              >
                <span>
                  Share
                  <span className="hidden sm:inline">&nbsp;for approval</span>
                </span>
              </Button>
            )}

            {data.can.share && data.status === "IN_REVIEW" && (
              <Button
                disabled={withdraw.isPending}
                onClick={() => withdraw.mutate({ id: data.id })}
              >
                {withdraw.isPending ? "Withdrawing…" : "Withdraw"}
              </Button>
            )}

            {data.can.revise && data.status !== "DRAFT" && (
              <Button
                variant={variantFor("revise")}
                disabled={revise.isPending}
                onClick={() => revise.mutate({ id: data.id })}
                aria-label="Revise as new draft"
              >
                {revise.isPending ? (
                  "Copying…"
                ) : (
                  <span>
                    Revise
                    <span className="hidden sm:inline"> as new draft</span>
                  </span>
                )}
              </Button>
            )}

            {data.can.apply && (
              <Button
                variant={variantFor("apply")}
                onClick={() => setApplying(true)}
                aria-label="Apply to timetable"
              >
                <span>
                  Apply
                  <span className="hidden sm:inline">&nbsp;to timetable</span>
                </span>
              </Button>
            )}
          </>
        }
      />

      <PageBody className="flex flex-col gap-5">
        {/* Who made it and where it stands, as one line of facts. The author is
            a name, so it is set in the body face rather than the mono it was
            in; mono is for times, codes and counts. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Badge tone={PLAN_STATUS_TONE[data.status]}>
            {PLAN_STATUS_LABEL[data.status]}
          </Badge>
          <span className="text-muted text-sm">
            {data.semester ? `${data.semester.name} · ` : ""}by{" "}
            {data.author.name}
            {data.version > 1 && `, version ${data.version}`}
          </span>
          {data.status === "IN_REVIEW" && pendingReviewers > 0 && (
            <span className="text-warn text-sm font-semibold">
              Waiting on {pendingReviewers}{" "}
              {pendingReviewers === 1 ? "person" : "people"}
            </span>
          )}
        </div>

        {data.status === "CHANGES_REQUESTED" && (
          <Callout tone="bad">
            A reviewer asked for changes. This draft is locked: take a copy with{" "}
            <b>Revise as new draft</b>, fix it there, and share it again for a
            fresh round of approvals.
          </Callout>
        )}
        {data.status === "APPLIED" && (
          <Callout tone="good">
            These classes are on the live timetable.{" "}
            <Link
              href="/timetable"
              className="font-semibold underline underline-offset-2"
            >
              Open the timetable
            </Link>
            .
          </Callout>
        )}
        {data.status === "APPROVED" && data.can.apply && (
          <Callout tone="good">
            Everyone signed off. <b>Apply to timetable</b> will schedule{" "}
            {placed} recurring {placed === 1 ? "class" : "classes"}.
          </Callout>
        )}

        <Segmented
          items={[
            {
              value: "demand" as const,
              label: `Demand (${data.requirements.length})`,
            },
            {
              value: "timetable" as const,
              label:
                unplaced > 0 ? `Timetable (${unplaced} unplaced)` : "Timetable",
            },
            {
              value: "review" as const,
              label: openComments > 0 ? `Review (${openComments})` : "Review",
            },
          ]}
          value={tab}
          onChange={setTab}
          size="sm"
          ariaLabel="Stage"
        />

        {tab === "demand" && <DemandPanel plan={data} onChanged={refresh} />}
        {tab === "timetable" && (
          <TimetablePanel plan={data} onChanged={refresh} />
        )}
        {tab === "review" && <ReviewPanel plan={data} onChanged={refresh} />}
      </PageBody>

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
        // Pinned to both edges on a phone: these messages run to a couple of
        // lines, and anchored to the right alone the box grew off the left of
        // the screen instead of wrapping.
        //
        // Reduced motion swaps the travel for a fade in globals.css.
        <div
          role="status"
          className="plr-toast bg-surface fixed right-4 bottom-4 left-4 z-40 flex items-start gap-2.5 rounded-[12px] py-3 pr-2 pl-4 shadow-[var(--ring),var(--shadow-float)] sm:right-8 sm:bottom-8 sm:left-auto sm:items-center"
        >
          <Icon
            name={flash.bad ? "alert" : "checkCircle"}
            size={18}
            stroke={2}
            className={`mt-px shrink-0 sm:mt-0 ${flash.bad ? "text-bad" : "text-good"}`}
          />
          <span className="text-title min-w-0 flex-1 text-sm font-semibold sm:max-w-[360px] sm:flex-none">
            {flash.text}
          </span>
          {/* Finger-sized until the sidebar's breakpoint rather than `sm`, which
              a tablet held upright is already past. */}
          <IconButton
            icon="x"
            label="Dismiss"
            size="sm"
            iconSize={13}
            onClick={() => setFlash(null)}
            className="-my-2 shrink-0 sm:my-0"
          />
        </div>
      )}
    </>
  );
}

/** The workspace's shape while the plan loads: meta line, stages, a table. */
function WorkspaceSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading the plan"
      className="flex flex-col gap-5"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-3.5 w-48" />
      </div>
      <Skeleton className="h-10 w-72 max-w-full rounded-[11px]" />
      <div className="bg-surface rounded-[var(--radius-card)] shadow-[var(--ring),var(--shadow-card)]">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-6 px-4 py-4 shadow-[inset_0_-1px_0_var(--hair-soft)] last:shadow-none"
          >
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3.5 w-48 max-w-full" />
            <Skeleton className="ml-auto hidden h-3.5 w-24 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
