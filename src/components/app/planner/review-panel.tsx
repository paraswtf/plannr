"use client";

import { useState } from "react";
import Link from "next/link";

import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
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

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-4">
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

        {plan.can.review && (
          <Card title="Your decision" pad={18}>
            <p className="text-muted mt-0 mb-3 text-[13px]">
              You were asked to sign this timetable off. Approving it with
              everyone else lets its author put it on the live schedule.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="What you want the planner to know (optional)"
              className="bg-surface plr-scroll mb-2.5 w-full resize-y rounded-[10px] px-3 py-2 text-[13px] outline-none"
              style={{ boxShadow: "var(--ring)" }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={review.isPending}
                onClick={() =>
                  review.mutate({
                    id: plan.id,
                    decision: "APPROVED",
                    note: note.trim() || undefined,
                  })
                }
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white"
                style={{ background: "#4e7d3a" }}
              >
                <Icon name="check" size={14} color="#fff" stroke={3} />
                Approve
              </button>
              <button
                type="button"
                disabled={review.isPending}
                onClick={() =>
                  review.mutate({
                    id: plan.id,
                    decision: "CHANGES_REQUESTED",
                    note: note.trim() || undefined,
                  })
                }
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold"
                style={{ boxShadow: "var(--ring)", color: "var(--red)" }}
              >
                <Icon name="alert" size={14} color="var(--red)" />
                Request changes
              </button>
            </div>
            {plan.myDecision && plan.myDecision !== "PENDING" && (
              <p className="text-faint mt-2.5 mb-0 text-[12px]">
                You already answered{" "}
                <b>
                  {PLAN_DECISION_LABEL[plan.myDecision]}
                </b>
                . Answering again replaces it.
              </p>
            )}
          </Card>
        )}

        <Card
          title={`Feedback on version ${plan.version}`}
          pad={18}
          action={
            <span className="text-faint font-mono text-[11.5px]">
              {open.length} open
            </span>
          }
        >
          <div className="mb-4 flex flex-col gap-2.5">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Leave a comment on this draft"
              className="bg-surface plr-scroll w-full resize-y rounded-[10px] px-3 py-2 text-[13px] outline-none"
              style={{ boxShadow: "var(--ring)" }}
            />
            <button
              type="button"
              disabled={!body.trim() || comment.isPending}
              onClick={() =>
                comment.mutate({ planId: plan.id, body: body.trim() })
              }
              className="self-start rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white"
              style={{
                background: "var(--slate)",
                opacity: body.trim() && !comment.isPending ? 1 : 0.5,
                cursor:
                  body.trim() && !comment.isPending ? "pointer" : "not-allowed",
              }}
            >
              Comment
            </button>
          </div>

          {plan.comments.length === 0 ? (
            <p className="text-muted m-0 text-[13px]">
              No feedback on this draft yet.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {[...open, ...resolved].map((c) => (
                <div
                  key={c.id}
                  className="rounded-[10px] p-3"
                  style={{
                    boxShadow: "var(--ring)",
                    opacity: c.resolvedAt ? 0.6 : 1,
                  }}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ background: "var(--slate)" }}
                    >
                      {c.authorName.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-title text-[12.5px] font-semibold">
                      {c.authorName}
                    </span>
                    <span className="text-faint font-mono text-[11px]">
                      {new Intl.DateTimeFormat("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(c.createdAt)}
                    </span>
                    {c.resolvedAt && <Badge tone="green">resolved</Badge>}
                  </div>

                  {sessionTitle(c.sessionId) && (
                    <div className="mb-1.5">
                      <Badge tone="slate">{sessionTitle(c.sessionId)}</Badge>
                    </div>
                  )}

                  <p className="text-ink m-0 text-[13px] whitespace-pre-wrap">
                    {c.body}
                  </p>

                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        resolve.mutate({ id: c.id, resolved: !c.resolvedAt })
                      }
                      className="text-slate cursor-pointer text-[12px] font-semibold"
                    >
                      {c.resolvedAt ? "Reopen" : "Mark resolved"}
                    </button>
                    {c.isMine && (
                      <button
                        type="button"
                        onClick={() => removeComment.mutate({ id: c.id })}
                        className="cursor-pointer text-[12px] font-semibold"
                        style={{ color: "var(--red)" }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card title="Sign-off" pad={18}>
          {plan.reviewers.length === 0 ? (
            <p className="text-muted m-0 text-[13px]">
              Not shared with anyone yet. Until it is, this draft is visible only
              to you.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {plan.reviewers.map((reviewer) => (
                <div key={reviewer.userId} className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: "var(--slate)" }}
                  >
                    {reviewer.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-title block truncate text-[12.5px] font-semibold">
                      {reviewer.name}
                    </span>
                    {/* Omitted rather than named as missing: this row is a
                        glance at who is reviewing, and an address nobody has
                        sent is not part of that. */}
                    {reviewer.email && (
                      <span className="text-faint block truncate text-[11px]">
                        {reviewer.email}
                      </span>
                    )}
                    {reviewer.note && (
                      <span className="text-muted mt-1 block text-[11.5px] italic">
                        “{reviewer.note}”
                      </span>
                    )}
                  </span>
                  <Badge
                    tone={
                      PLAN_DECISION_TONE[reviewer.decision]
                    }
                    dot
                  >
                    {PLAN_DECISION_LABEL[reviewer.decision]}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Versions" pad={18}>
          <p className="text-muted mt-0 mb-2.5 text-[12.5px]">
            Each draft carries its own feedback and approvals — revising starts
            both again.
          </p>
          <div className="flex flex-col gap-1.5">
            {(history.data ?? []).map((version) => (
              <Link
                key={version.id}
                href={`/planner/${version.id}`}
                className="flex items-center gap-2 rounded-[10px] px-2.5 py-2"
                style={
                  version.isCurrent
                    ? { background: "rgba(68,88,121,0.08)" }
                    : undefined
                }
              >
                <span className="text-title w-8 shrink-0 font-mono text-[12px] font-bold">
                  v{version.version}
                </span>
                <Badge tone={PLAN_STATUS_TONE[version.status]}>
                  {PLAN_STATUS_LABEL[version.status]}
                </Badge>
                <span className="text-faint ml-auto font-mono text-[11px]">
                  {version.commentCount} comments
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
