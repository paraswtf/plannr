"use client";

import { useState } from "react";
import Link from "next/link";

import { Avatar } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Field, Textarea } from "~/components/ui/field";
import { Skeleton } from "~/components/ui/skeleton";
import {
  formatSessionWhen,
  PLAN_DECISION_LABEL,
  PLAN_DECISION_TONE,
  PLAN_STATUS_LABEL,
  PLAN_STATUS_TONE,
} from "~/lib/schedule-plan";
import { api, type RouterOutputs } from "~/trpc/react";

type Plan = RouterOutputs["plans"]["byId"];

/**
 * Where a draft is argued over and signed off.
 *
 * Two separate things live here on purpose. A *comment* is anyone's, and says
 * something; a *decision* is a named reviewer's, and moves the plan. A plan
 * reaches APPROVED only when every reviewer has approved — one "changes
 * requested" sends the whole thing back, which is what stops a timetable
 * reaching the live schedule with an unanswered objection attached to it.
 */
export function ReviewPanel({
  plan,
  onChanged,
}: {
  plan: Plan;
  onChanged: () => void | Promise<unknown>;
}) {
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const history = api.plans.history.useQuery({ id: plan.id });

  const comment = api.plans.comment.useMutation({
    onSuccess: async () => {
      setBody("");
      await onChanged();
    },
    onError: (e) => setError(e.message),
  });
  const review = api.plans.review.useMutation({
    onSuccess: async () => {
      setNote("");
      await onChanged();
    },
    onError: (e) => setError(e.message),
  });
  const resolve = api.plans.resolveComment.useMutation({
    onSuccess: () => onChanged(),
    onError: (e) => setError(e.message),
  });
  const removeComment = api.plans.deleteComment.useMutation({
    onSuccess: () => onChanged(),
    onError: (e) => setError(e.message),
  });

  const sessionTitle = (sessionId: string | null) => {
    if (!sessionId) return null;
    const session = plan.sessions.find((s) => s.id === sessionId);
    if (!session) return null;
    return `${session.title} · ${formatSessionWhen(
      session.dayOfWeek,
      session.startMinutes,
      session.durationMinutes,
    )}`;
  };

  const open = plan.comments.filter((c) => !c.resolvedAt);
  const resolved = plan.comments.filter((c) => c.resolvedAt);

  const approved = plan.reviewers.filter(
    (r) => r.decision === "APPROVED",
  ).length;

  const renderComment = (c: Plan["comments"][number]) => (
    <li
      key={c.id}
      className="py-3.5 shadow-[inset_0_-1px_0_var(--hair-soft)] first:pt-0 last:pb-0 last:shadow-none"
    >
      {/* Wraps: a long name, the timestamp and the resolved badge
          are three unbreakable things on one line, and a phone
          does not always have room for all three. */}
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Avatar name={c.authorName} size={24} />
        <span className="text-title text-sm font-semibold">{c.authorName}</span>
        <span className="text-faint text-xs tabular-nums">
          {new Intl.DateTimeFormat("en-GB", {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          }).format(c.createdAt)}
        </span>
        {c.resolvedAt && <Badge tone="green">Resolved</Badge>}
      </div>

      {sessionTitle(c.sessionId) && (
        // A badge never wraps and a subject may run to 160
        // characters, so left alone this one line would drag the
        // whole page sideways on a phone. It shrinks to the width
        // of the comment and trails off instead.
        <div className="mb-1.5 flex pl-8 [&>span]:min-w-0">
          <Badge tone="slate">
            <span className="truncate">{sessionTitle(c.sessionId)}</span>
          </Badge>
        </div>
      )}

      <p
        className={`m-0 pl-8 text-sm whitespace-pre-wrap ${c.resolvedAt ? "text-muted" : "text-ink"}`}
      >
        {c.body}
      </p>

      {/* The negative margin gives these text buttons a finger-sized
          hit area without opening a gap under every comment; the
          negative inset lines their words up with the body above. */}
      {/* Only the comment being acted on waits for its answer: the mutation
          is shared by the whole thread, so `isPending` alone froze every
          comment's buttons for one click. */}
      <div className="-mb-2 flex items-center gap-1 pl-5 lg:mt-1 lg:mb-0">
        <Button
          variant="ghost"
          size="sm"
          disabled={resolve.isPending && resolve.variables?.id === c.id}
          onClick={() => resolve.mutate({ id: c.id, resolved: !c.resolvedAt })}
        >
          {c.resolvedAt ? "Reopen" : "Mark resolved"}
        </Button>
        {c.isMine && (
          <Button
            variant="ghost"
            size="sm"
            icon="trash"
            disabled={
              removeComment.isPending && removeComment.variables?.id === c.id
            }
            onClick={() => removeComment.mutate({ id: c.id })}
          >
            Delete
          </Button>
        )}
      </div>
    </li>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-4">
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}

        {/* The one raised surface on the tab, because it is the one thing a
            reviewer came here to do. Approve is the view's primary in slate,
            not the hard-coded green it was: the colour of a button says how
            much it matters, and the word says what it does. Requesting
            changes sends the whole plan back, so it is the red one, quietly,
            until it is pressed. */}
        {plan.can.review && (
          <section
            aria-labelledby="review-decision-title"
            className="bg-surface rounded-[var(--radius-card)] p-[min(18px,4vw)] shadow-[var(--ring),var(--shadow-md)]"
          >
            <h2
              id="review-decision-title"
              className="font-display text-title text-md m-0 font-semibold tracking-[-0.01em]"
            >
              Your decision
            </h2>
            <p className="text-muted mt-1 mb-4 text-sm">
              You were asked to sign this timetable off. Approving it with
              everyone else lets its author put it on the live schedule.
            </p>
            <Field label="A note for the planner" optional className="mb-3">
              {(id) => (
                <Textarea
                  id={id}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="What you want the planner to know"
                  className="plr-scroll"
                />
              )}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                icon="check"
                disabled={review.isPending}
                onClick={() =>
                  review.mutate({
                    id: plan.id,
                    decision: "APPROVED",
                    note: note.trim() || undefined,
                  })
                }
              >
                Approve
              </Button>
              <Button
                variant="danger-quiet"
                icon="alert"
                disabled={review.isPending}
                onClick={() =>
                  review.mutate({
                    id: plan.id,
                    decision: "CHANGES_REQUESTED",
                    note: note.trim() || undefined,
                  })
                }
              >
                Request changes
              </Button>
            </div>
            {plan.myDecision && plan.myDecision !== "PENDING" && (
              <p className="text-muted mt-3 mb-0 text-xs">
                You already answered{" "}
                <b className="text-ink">
                  {PLAN_DECISION_LABEL[plan.myDecision]}
                </b>
                . Answering again replaces it.
              </p>
            )}
          </section>
        )}

        <Card
          title={`Feedback on version ${plan.version}`}
          pad={18}
          action={
            <span className="text-muted text-xs tabular-nums">
              {open.length} open
            </span>
          }
        >
          <div className="mb-5 flex flex-col gap-2">
            {/* Named for a screen reader rather than labelled on screen: the
                card's title already says what this box is for. */}
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              aria-label="Comment on this draft"
              placeholder="Leave a comment on this draft"
              className="plr-scroll"
            />
            <Button
              size="sm"
              disabled={!body.trim() || comment.isPending}
              onClick={() =>
                comment.mutate({ planId: plan.id, body: body.trim() })
              }
              className="self-start"
            >
              {comment.isPending ? "Posting…" : "Comment"}
            </Button>
          </div>

          {plan.comments.length === 0 ? (
            <EmptyState
              compact
              icon="inbox"
              title="No feedback on this draft yet"
              className="shadow-[inset_0_1px_0_var(--hair-soft)]"
            />
          ) : (
            // One thread divided by hairlines, not a card per comment inside
            // the card. Resolved comments follow under their own heading at
            // full contrast, where they used to be faded to 60%.
            <div className="flex flex-col gap-4 pt-4 shadow-[inset_0_1px_0_var(--hair-soft)]">
              {open.length > 0 && (
                <ul className="m-0 list-none p-0">{open.map(renderComment)}</ul>
              )}
              {resolved.length > 0 && (
                <div className={open.length > 0 ? "pt-2" : ""}>
                  <p className="text-muted text-2xs mt-0 mb-3 font-semibold">
                    Resolved ({resolved.length})
                  </p>
                  <ul className="m-0 list-none p-0">
                    {resolved.map(renderComment)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* For the author, who has nothing to decide, who has answered is the
          reason to open this tab, so on a phone the sign-off comes first
          instead of after every comment. */}
      <div
        className={`flex min-w-0 flex-col gap-4 ${plan.can.review ? "" : "max-lg:order-first"}`}
      >
        <Card
          title="Sign-off"
          pad={18}
          action={
            plan.reviewers.length > 0 ? (
              <span className="text-muted text-xs tabular-nums">
                {approved} of {plan.reviewers.length} approved
              </span>
            ) : undefined
          }
        >
          {plan.reviewers.length === 0 ? (
            <p className="text-muted m-0 text-sm">
              Not shared with anyone yet. Until it is, this draft is visible
              only to you.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {plan.reviewers.map((reviewer) => (
                <li key={reviewer.userId} className="flex items-start gap-2.5">
                  <Avatar name={reviewer.name} size={28} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="text-title block truncate text-sm font-semibold">
                      {reviewer.name}
                    </span>
                    {/* Omitted rather than named as missing: this row is a
                        glance at who is reviewing, and an address nobody has
                        sent is not part of that. */}
                    {reviewer.email && (
                      <span className="text-faint block truncate text-xs">
                        {reviewer.email}
                      </span>
                    )}
                    {reviewer.note && (
                      <span className="text-ink mt-1 block text-xs">
                        “{reviewer.note}”
                      </span>
                    )}
                  </span>
                  {/* A decision is a verdict, which is what a badge's dot is
                      for; the plan's own status badges have dropped theirs. */}
                  <Badge tone={PLAN_DECISION_TONE[reviewer.decision]} dot>
                    {PLAN_DECISION_LABEL[reviewer.decision]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Versions" pad={18}>
          <p className="text-muted mt-0 mb-3 text-sm">
            Each draft carries its own feedback and approvals. Revising starts
            both again.
          </p>
          {history.isLoading ? (
            <div
              role="status"
              aria-label="Loading versions"
              className="flex flex-col gap-2"
            >
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <div className="-mx-2.5 flex flex-col gap-0.5">
              {(history.data?.rows ?? []).map((version) => (
                <Link
                  key={version.id}
                  href={`/planner/${version.id}`}
                  aria-current={version.isCurrent ? "page" : undefined}
                  className={`plr-clip flex min-h-10 items-center gap-2.5 rounded-[8px] px-2.5 lg:min-h-9 ${
                    version.isCurrent
                      ? "bg-tint-selected"
                      : "hover:bg-tint-hover"
                  }`}
                >
                  <span className="text-title w-7 shrink-0 font-mono text-xs font-semibold">
                    v{version.version}
                  </span>
                  <Badge tone={PLAN_STATUS_TONE[version.status]}>
                    {PLAN_STATUS_LABEL[version.status]}
                  </Badge>
                  <span className="text-faint ml-auto text-xs tabular-nums">
                    {version.commentCount}{" "}
                    {version.commentCount === 1 ? "comment" : "comments"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
