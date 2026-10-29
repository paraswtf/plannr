"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Badge, type BadgeTone } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { Dialog } from "~/components/ui/dialog";
import { EmptyState } from "~/components/ui/empty-state";
import { Segmented } from "~/components/ui/segmented";
import { Skeleton } from "~/components/ui/skeleton";
import { ASSIGNMENT_TYPE_META, type AssignmentType } from "~/lib/assignments";
import { DEFAULT_TIMEZONE, formatDayLabel, formatHourLabel } from "~/lib/dates";
import { errorMessage } from "~/lib/error-message";
import { api, type RouterOutputs } from "~/trpc/react";

import { SubmissionMarker } from "./submission-marker";

const TZ = DEFAULT_TIMEZONE;
const POLL_MS = 30_000;

type Row = RouterOutputs["submissions"]["roster"]["rows"][number];
type Filter = "all" | "in" | "out";

const STATUS: Record<Row["status"], { label: string; tone: BadgeTone }> = {
  "not started": { label: "Not started", tone: "neutral" },
  "in progress": { label: "Answering", tone: "orange" },
  submitted: { label: "Handed in", tone: "green" },
  "handed in at the close": { label: "Handed in at the close", tone: "slate" },
};

const handedIn = (row: Row) =>
  row.status === "submitted" || row.status === "handed in at the close";

/** "Tue 4 Nov, 10am" in the institution's time. */
const at = (d: Date) => `${formatDayLabel(d, TZ)}, ${formatHourLabel(d, TZ)}`;

export function MarkingView({
  assignmentId,
  type,
  title,
}: {
  assignmentId: string;
  type: AssignmentType;
  title: string;
}) {
  const roster = api.submissions.roster.useQuery(
    { assignmentId },
    {
      // While students may still answer, look again now and then, so the
      // roster follows them and Publish turns on once the last answers are in.
      refetchInterval: (q) =>
        q.state.data?.window && !q.state.data.canPublish ? POLL_MS : false,
    },
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const all = roster.data?.rows ?? [];
    if (filter === "in") return all.filter(handedIn);
    if (filter === "out") return all.filter((r) => !handedIn(r));
    return all;
  }, [roster.data, filter]);
  // Next and previous walk the students in view who have answers to mark.
  const markable = rows.filter((r) => r.submissionId);
  const index = markable.findIndex((r) => r.submissionId === openId);

  const header = (
    <PageHeader
      title={openId ? "Marking" : title}
      back={
        openId
          ? undefined
          : { href: `/assignments/${assignmentId}`, label: "Test" }
      }
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Badge tone="slate">{ASSIGNMENT_TYPE_META[type].label}</Badge>
          {openId && <span>{title}</span>}
        </span>
      }
    />
  );

  if (openId) {
    return (
      <>
        {header}
        <PageBody width="narrow">
          <SubmissionMarker
            key={openId}
            submissionId={openId}
            totalMarks={roster.data?.totalMarks ?? null}
            onBack={() => setOpenId(null)}
            onPrevious={
              index > 0
                ? () => setOpenId(markable[index - 1]!.submissionId)
                : undefined
            }
            onNext={
              index >= 0 && index < markable.length - 1
                ? () => setOpenId(markable[index + 1]!.submissionId)
                : undefined
            }
            position={
              index >= 0 ? { at: index + 1, of: markable.length } : undefined
            }
          />
        </PageBody>
      </>
    );
  }

  return (
    <>
      {header}
      <PageBody width="wide">
        {roster.isLoading ? (
          <div
            role="status"
            aria-label="Loading the roster"
            className="flex flex-col gap-3"
          >
            <Skeleton className="h-10" />
            <Skeleton className="h-64" />
          </div>
        ) : !roster.data ? (
          <Card pad={0}>
            <EmptyState
              icon="alert"
              title="The roster could not be loaded."
              action={
                <Button
                  variant="secondary"
                  onClick={() => void roster.refetch()}
                >
                  Try again
                </Button>
              }
            >
              {errorMessage(roster.error)}
            </EmptyState>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <PublishBar
              assignmentId={assignmentId}
              publishedAt={roster.data.marksPublishedAt}
              handedIn={roster.data.rows.filter(handedIn).length}
              total={roster.data.total}
              opened={roster.data.window !== null}
              canPublish={roster.data.canPublish}
              finalAt={roster.data.answersFinalAt}
              markedByKey={roster.data.markedByKey}
            />
            <Segmented<Filter>
              ariaLabel="Which students"
              value={filter}
              onChange={setFilter}
              items={[
                { value: "all", label: "All" },
                { value: "in", label: "Handed in" },
                { value: "out", label: "Not handed in" },
              ]}
            />
            {rows.length === 0 ? (
              <Card pad={0}>
                <EmptyState icon="users" title="Nobody here.">
                  {roster.data.rows.length === 0
                    ? "The group has no students yet."
                    : filter === "in"
                      ? "Nobody has handed in yet."
                      : "Everybody has handed in."}
                </EmptyState>
              </Card>
            ) : (
              <RosterList
                rows={rows}
                totalMarks={roster.data.totalMarks}
                onOpen={setOpenId}
              />
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}

function Score({ row, totalMarks }: { row: Row; totalMarks: number | null }) {
  if (row.score === null) {
    return (
      <span className="text-faint">{row.marked ? "0" : "Not marked"}</span>
    );
  }
  return (
    <span className="font-mono tabular-nums">
      {row.score}
      {totalMarks !== null && (
        <span className="text-faint"> of {totalMarks}</span>
      )}
    </span>
  );
}

/** A table on wider screens, stacked cards on a phone. */
function RosterList({
  rows,
  totalMarks,
  onOpen,
}: {
  rows: Row[];
  totalMarks: number | null;
  onOpen: (submissionId: string) => void;
}) {
  return (
    <>
      <Card pad={0} className="hidden overflow-hidden sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted text-2xs text-left font-semibold shadow-[0_1px_0_var(--hair-soft)]">
              <th className="px-4 py-2.5 font-semibold">Student</th>
              <th className="px-4 py-2.5 font-semibold">PRN</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Handed in at</th>
              <th className="px-4 py-2.5 text-right font-semibold">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const open = row.submissionId;
              return (
                <tr
                  key={row.studentId}
                  className={`shadow-[0_1px_0_var(--hair-soft)] last:shadow-none ${
                    open ? "hover:bg-tint-hover cursor-pointer" : ""
                  }`}
                  onClick={open ? () => onOpen(open) : undefined}
                >
                  <td className="px-4 py-2.5">
                    {open ? (
                      <button
                        type="button"
                        className="text-title text-left font-semibold hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(open);
                        }}
                      >
                        {row.name}
                      </button>
                    ) : (
                      <span className="text-title font-semibold">
                        {row.name}
                      </span>
                    )}
                  </td>
                  <td className="text-faint px-4 py-2.5 font-mono text-xs">
                    {row.prn}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS[row.status].tone}>
                      {STATUS[row.status].label}
                    </Badge>
                  </td>
                  <td className="text-muted px-4 py-2.5 font-mono text-xs tabular-nums">
                    {row.submittedAt ? at(row.submittedAt) : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {row.submissionId ? (
                      <Score row={row} totalMarks={totalMarks} />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <ul className="flex flex-col gap-2 sm:hidden">
        {rows.map((row) => {
          const open = row.submissionId;
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-title min-w-0 truncate text-base font-semibold">
                  {row.name}
                </span>
                {open && <Score row={row} totalMarks={totalMarks} />}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS[row.status].tone}>
                  {STATUS[row.status].label}
                </Badge>
                <span className="text-faint font-mono text-xs">{row.prn}</span>
                {row.submittedAt && (
                  <span className="text-faint font-mono text-xs tabular-nums">
                    {at(row.submittedAt)}
                  </span>
                )}
              </div>
            </>
          );
          return (
            <li key={row.studentId}>
              {open ? (
                <Card hover onClick={() => onOpen(open)} className="w-full">
                  <div className="flex flex-col gap-1.5 text-left">{body}</div>
                </Card>
              ) : (
                <Card>
                  <div className="flex flex-col gap-1.5">{body}</div>
                </Card>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Publishing the marks: the roster's one primary action, once nobody can
 * answer any more. Marks out while a classmate is still answering would tell
 * them the key, so the server refuses until then and the button waits too.
 */
function PublishBar({
  assignmentId,
  publishedAt,
  handedIn,
  total,
  opened,
  canPublish,
  finalAt,
  markedByKey,
}: {
  assignmentId: string;
  publishedAt: Date | null;
  handedIn: number;
  total: number;
  /** The paper has been opened to students. */
  opened: boolean;
  canPublish: boolean;
  /** When the last answers are in, grace included. */
  finalAt: Date | null;
  /** Answers not marked by hand are marked by the key as the marks go out. */
  markedByKey: boolean;
}) {
  const utils = api.useUtils();
  const [confirming, setConfirming] = useState(false);
  const publish = api.submissions.publish.useMutation({
    onSuccess: async () => {
      setConfirming(false);
      toast.success("Marks published. Students have been told.");
      await utils.submissions.roster.invalidate({ assignmentId });
    },
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted text-sm">
        <span className="font-mono tabular-nums">
          {handedIn} of {total}
        </span>{" "}
        handed in.{" "}
        {publishedAt ? (
          <>
            Marks published{" "}
            <span className="font-mono tabular-nums">{at(publishedAt)}</span>.
            Marks you save now show to students straight away.
          </>
        ) : !opened ? (
          "You can publish marks once the paper has been opened and has closed."
        ) : !canPublish ? (
          <>
            You can publish marks once the paper has closed and the last answers
            are in
            {finalAt && (
              <>
                , at{" "}
                <span className="font-mono tabular-nums">{at(finalAt)}</span>
              </>
            )}
            .
          </>
        ) : (
          "Students see their marks once you publish them."
        )}
      </p>
      {!publishedAt && (
        <Button
          variant="primary"
          disabled={!canPublish}
          onClick={() => setConfirming(true)}
        >
          Publish marks
        </Button>
      )}

      <Dialog
        open={confirming}
        title="Publish the marks?"
        icon="bell"
        onClose={() => {
          setConfirming(false);
          publish.reset();
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirming(false);
                publish.reset();
              }}
            >
              Not yet
            </Button>
            <Button
              variant="primary"
              disabled={publish.isPending}
              onClick={() => publish.mutate({ assignmentId })}
            >
              {publish.isPending ? "Publishing" : "Publish and tell students"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-ink text-sm">
            Every student who answered sees their marks and your feedback, and
            is told that their marks are out.{" "}
            {markedByKey
              ? "Every question is a choice question, so answers you have not marked are marked by the key as the marks go out."
              : "Students you have not marked yet see no score until you mark them."}
          </p>
          {publish.error && (
            <Callout tone="bad">{errorMessage(publish.error)}</Callout>
          )}
        </div>
      </Dialog>
    </div>
  );
}
