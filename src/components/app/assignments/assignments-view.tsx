"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PageBody } from "~/components/app/shell/page-body";
import { PageHeader } from "~/components/app/shell/page-header";
import { Badge, type BadgeTone } from "~/components/ui/badge";
import { Button, IconButton } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Segmented } from "~/components/ui/segmented";
import { Skeleton } from "~/components/ui/skeleton";
import { ASSIGNMENT_TYPE_META } from "~/lib/assignments";
import { DEFAULT_TIMEZONE, formatDayLabel, formatHourLabel } from "~/lib/dates";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { errorMessage } from "~/lib/error-message";
import { api, type RouterOutputs } from "~/trpc/react";
import { CreateAssignmentDialog } from "./create-assignment-dialog";

const TZ = DEFAULT_TIMEZONE;
const PAGE_SIZE = 20;

type Row = RouterOutputs["assignments"]["list"]["rows"][number];
type When = "upcoming" | "past";

/** "4 Nov", for a presentation's window. */
const dayMonth = (instant: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: TZ,
  }).format(instant);

/**
 * When it is held. A test: its day and start time. A presentation: the days
 * it runs over, where `endsAt` is the end of the last slot or the midnight
 * after the window's last day, so a millisecond back lands on the right day.
 */
function whenOf(row: Row): { day: string; time: string | null } | null {
  if (!row.startsAt) return null;
  if (row.type === "PRESENTATION") {
    const first = dayMonth(row.startsAt);
    const last = row.endsAt
      ? dayMonth(new Date(row.endsAt.getTime() - 1))
      : first;
    return { day: first === last ? first : `${first} to ${last}`, time: null };
  }
  return {
    day: formatDayLabel(row.startsAt, TZ),
    time: formatHourLabel(row.startsAt, TZ),
  };
}

const SITTING_WORDS: Record<
  "pending" | "cancelled" | "lost",
  { label: string; tone: BadgeTone }
> = {
  pending: { label: "Class waiting for approval", tone: "orange" },
  cancelled: { label: "Class called off", tone: "red" },
  lost: { label: "Class no longer on the timetable", tone: "red" },
};

const PAPER_WORDS: Record<Row["paper"], { label: string; tone: BadgeTone }> = {
  none: { label: "No paper", tone: "neutral" },
  locked: { label: "Paper locked", tone: "neutral" },
  open: { label: "Paper open", tone: "green" },
  closed: { label: "Answers closed", tone: "neutral" },
};

const MINE_WORDS = {
  "not started": { label: "Not started", tone: "neutral" },
  "in progress": { label: "In progress", tone: "slate" },
  // The time ran out before they pressed Hand in; what they had saved is
  // what gets marked, as the teacher's roster says.
  "handed in at the close": { label: "Handed in at the close", tone: "slate" },
  submitted: { label: "Submitted", tone: "green" },
} as const satisfies Record<string, { label: string; tone: BadgeTone }>;

/**
 * What the row needs to say about where it stands. Decided per row: somebody
 * who sets work can also sit in a group, so one page can hold both kinds.
 */
function Status({ row }: { row: Row }) {
  const meta = ASSIGNMENT_TYPE_META[row.type];
  const sitting =
    row.state === "pending" || row.state === "cancelled" || row.state === "lost"
      ? SITTING_WORDS[row.state]
      : null;

  if ("submissions" in row && row.submissions) {
    const paper = meta.isTest ? PAPER_WORDS[row.paper] : null;
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        {sitting && <Badge tone={sitting.tone}>{sitting.label}</Badge>}
        {paper && <Badge tone={paper.tone}>{paper.label}</Badge>}
        {meta.answeredInApp && (
          <span className="text-muted font-mono text-xs tabular-nums">
            {row.submissions.submitted} of {row.submissions.total} answered
          </span>
        )}
      </span>
    );
  }

  const mine =
    "mine" in row && row.mine && meta.answeredInApp
      ? MINE_WORDS[row.mine]
      : null;
  const marksOut = "marksPublished" in row && row.marksPublished;
  // A student hears that their class moved off the timetable, but not that it
  // waits for approval: that is the teacher's to chase.
  const lostClass = sitting && row.state !== "pending" ? sitting : null;
  if (!marksOut && !mine && !lostClass) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {lostClass && <Badge tone={lostClass.tone}>{lostClass.label}</Badge>}
      {marksOut ? (
        <Badge tone="green">Marks out</Badge>
      ) : (
        mine && <Badge tone={mine.tone}>{mine.label}</Badge>
      )}
    </span>
  );
}

function WhenCell({ row }: { row: Row }) {
  const when = whenOf(row);
  if (!when) return <span className="text-faint text-sm">No class yet</span>;
  return (
    <span className="flex flex-col">
      <span className="text-title text-sm font-medium">{when.day}</span>
      {when.time && (
        <span className="text-muted font-mono text-xs tabular-nums">
          {when.time}
        </span>
      )}
    </span>
  );
}

function WhatCell({ row }: { row: Row }) {
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <Link
        href={`/assignments/${row.id}`}
        onClick={(e) => e.stopPropagation()}
        className="text-title hover:text-slate-ink text-base font-semibold"
      >
        {row.title}
      </Link>
      <Badge tone="slate">{ASSIGNMENT_TYPE_META[row.type].label}</Badge>
    </span>
  );
}

function GroupCell({ row }: { row: Row }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-title text-sm font-medium">{row.group.label}</span>
      {row.course && (
        <span className="text-muted truncate text-xs">{row.course.title}</span>
      )}
    </span>
  );
}

export function AssignmentsView({ permissions }: { permissions: string }) {
  const router = useRouter();
  const canSet = new PermissionBitField(BigInt(permissions)).has(
    PermissionFlags.ManageOwnAssignments,
  );

  const [when, setWhen] = useState<When>("upcoming");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const list = api.assignments.list.useQuery(
    { when, page, pageSize: PAGE_SIZE },
    { placeholderData: (prev) => prev },
  );

  // Back to the last page with anything on it, once the server has answered
  // for this page and it turned out to be past the end.
  useEffect(() => {
    const d = list.data;
    if (d?.page === page && page > d.pageCount) setPage(d.pageCount);
  }, [list.data, page]);

  const rows = list.data?.rows ?? [];
  const loadingFirst = list.isLoading && rows.length === 0;
  const failed = Boolean(list.error) && rows.length === 0;
  const stale = list.isPlaceholderData ? "opacity-60" : "";
  const empty = !list.isLoading && !failed && rows.length === 0;

  return (
    <>
      <PageHeader
        title="Assignments"
        subtitle={
          canSet
            ? "Tests and presentations you have set"
            : "Your tests and presentations"
        }
        actions={
          canSet ? (
            <Button
              variant="primary"
              icon="plus"
              onClick={() => setCreating(true)}
            >
              New assignment
            </Button>
          ) : undefined
        }
      />
      <PageBody>
        <div className="mb-5">
          <Segmented
            items={[
              { value: "upcoming" as const, label: "Upcoming" },
              { value: "past" as const, label: "Past" },
            ]}
            value={when}
            onChange={(next) => {
              setWhen(next);
              setPage(1);
            }}
          />
        </div>

        {failed && (
          <Callout
            tone="bad"
            className="mb-4"
            title="Could not load assignments"
          >
            {errorMessage(list.error, "")} Reload the page to try again.
          </Callout>
        )}

        {loadingFirst && (
          <Card pad={8}>
            <ListSkeleton />
          </Card>
        )}

        {empty && (
          <Card>
            <Empty when={when} canSet={canSet} />
          </Card>
        )}

        {rows.length > 0 && (
          <>
            {/* Phone: each assignment is a stacked card that opens it. */}
            <Card pad={8} className={`md:hidden ${stale}`}>
              {rows.map((row) => (
                <Link
                  key={row.id}
                  href={`/assignments/${row.id}`}
                  className="hover:bg-tint-hover active:bg-tint flex min-h-12 flex-col gap-2 rounded-[10px] px-3 py-3 shadow-[inset_0_-1px_0_var(--hair-soft)] transition-colors duration-150 last:shadow-none"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-title min-w-0 text-base font-semibold">
                      {row.title}
                    </span>
                    <Badge tone="slate" className="shrink-0">
                      {ASSIGNMENT_TYPE_META[row.type].label}
                    </Badge>
                  </span>
                  <span className="text-muted flex flex-wrap items-baseline gap-x-2 text-sm">
                    <MobileWhen row={row} />
                    <span>
                      {row.group.label}
                      {row.course ? ` · ${row.course.title}` : ""}
                    </span>
                  </span>
                  <Status row={row} />
                </Link>
              ))}
            </Card>

            {/* Desk: a table, whose rows open the assignment. */}
            <Card pad={8} className={`hidden md:block ${stale}`}>
              <div className="plr-scroll overflow-x-auto">
                <table className="w-full min-w-155 border-collapse">
                  <thead>
                    <tr>
                      <Th className="w-40">When</Th>
                      <Th>What</Th>
                      <Th>Group and course</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => router.push(`/assignments/${row.id}`)}
                        className="hover:bg-tint-hover cursor-pointer transition-colors duration-150 last:[&>td]:shadow-none"
                      >
                        <Td>
                          <WhenCell row={row} />
                        </Td>
                        <Td>
                          <WhatCell row={row} />
                        </Td>
                        <Td>
                          <GroupCell row={row} />
                        </Td>
                        <Td>
                          <Status row={row} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Pager
              page={page}
              pageCount={list.data?.pageCount ?? 1}
              onChange={(p) => {
                setPage(p);
                window.scrollTo({ top: 0 });
              }}
            />
          </>
        )}
      </PageBody>

      {creating && (
        <CreateAssignmentDialog onClose={() => setCreating(false)} />
      )}
    </>
  );
}

function MobileWhen({ row }: { row: Row }) {
  const when = whenOf(row);
  if (!when) return <span className="text-faint">No class yet</span>;
  return (
    <span className="text-title font-medium">
      {when.day}
      {when.time && (
        <span className="text-muted ml-1.5 font-mono text-xs tabular-nums">
          {when.time}
        </span>
      )}
    </span>
  );
}

function Empty({ when, canSet }: { when: When; canSet: boolean }) {
  if (when === "past") {
    return (
      <EmptyState icon="pencil" title="Nothing here yet">
        {canSet
          ? "Tests and presentations move here once they are over."
          : "Your tests and presentations move here once they are over, with your marks when they are out."}
      </EmptyState>
    );
  }
  return canSet ? (
    <EmptyState icon="pencil" title="No upcoming tests or presentations">
      Tests and presentations you set appear here until they are over. Use New
      assignment to set one for a group you teach.
    </EmptyState>
  ) : (
    <EmptyState icon="pencil" title="No tests or presentations coming up">
      Your tests and presentations will appear here when a teacher sets them.
    </EmptyState>
  );
}

function ListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading assignments"
      className="flex flex-col"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-3 py-3">
          <Skeleton className="h-8 w-24 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-48 max-w-full" />
            <Skeleton className="h-3 w-28 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`text-muted text-2xs px-3 py-2 text-left font-semibold shadow-[inset_0_-1px_0_var(--hair)] ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children?: React.ReactNode }) {
  return (
    <td className="text-ink px-3 py-2.5 align-middle text-sm shadow-[inset_0_-1px_0_var(--hair-soft)]">
      {children}
    </td>
  );
}

/** Previous, where we are, next. Hidden when everything fits on one page. */
function Pager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav
      aria-label="Pages"
      className="mt-4 flex items-center justify-center gap-3"
    >
      <IconButton
        icon="chevronLeft"
        label="Previous page"
        variant="secondary"
        size="sm"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      />
      <span className="text-muted text-xs">
        Page <span className="font-mono tabular-nums">{page}</span> of{" "}
        <span className="font-mono tabular-nums">{pageCount}</span>
      </span>
      <IconButton
        icon="chevronRight"
        label="Next page"
        variant="secondary"
        size="sm"
        disabled={page === pageCount}
        onClick={() => onChange(page + 1)}
      />
    </nav>
  );
}
