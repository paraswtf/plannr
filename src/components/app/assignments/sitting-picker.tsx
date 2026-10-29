"use client";

import { Badge } from "~/components/ui/badge";
import { Callout } from "~/components/ui/callout";
import { EmptyState } from "~/components/ui/empty-state";
import { Icon } from "~/components/ui/icon";
import { Skeleton } from "~/components/ui/skeleton";
import { DEFAULT_TIMEZONE, formatDayLabel, formatHourLabel } from "~/lib/dates";
import { errorMessage } from "~/lib/error-message";
import { api, type RouterOutputs } from "~/trpc/react";

/**
 * One of a group's own classes, as `assignments.create`, `setSitting` and
 * `setSlot` take it in `sitting`. `originalStart` is the sitting's original
 * start, not where it stands now: the server finds a moved class by it.
 */
export interface SittingChoice {
  eventId: string;
  originalStart: Date;
}

type Sitting = RouterOutputs["assignments"]["sittingsFor"]["rows"][number];

const sameSitting = (a: SittingChoice | null, b: Sitting) =>
  !!a &&
  a.eventId === b.eventId &&
  a.originalStart.getTime() === b.originalStart.getTime();

/**
 * The coming classes of a group a test (or a presentation team's slot) can be
 * held in, listed by day, with time, room and whatever is already pinned
 * there. Classes still waiting for approval are marked.
 *
 * Props:
 * - `groupId`, `courseId`: whose classes; `courseId` narrows to one course.
 * - `value`, `onChange`: the chosen class, or null for none.
 * - `from`, `to`: the span to list (the server defaults to the next 60 days).
 *   Pass stable values (state or `useMemo`), since they are part of the query.
 * - `currentAssignmentId`: an assignment being edited, so its own pin reads
 *   as "this one" rather than as something else in the way.
 *
 * Only call it for someone who can set work: the query refuses anyone else.
 */
export function SittingPicker({
  groupId,
  courseId,
  value,
  onChange,
  from,
  to,
  currentAssignmentId,
  timeZone = DEFAULT_TIMEZONE,
}: {
  groupId: string;
  courseId?: string | null;
  value: SittingChoice | null;
  onChange: (choice: SittingChoice) => void;
  from?: Date;
  to?: Date;
  currentAssignmentId?: string;
  timeZone?: string;
}) {
  const sittings = api.assignments.sittingsFor.useQuery({
    groupId,
    courseId: courseId ?? undefined,
    from,
    to,
  });

  if (sittings.isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading classes"
        className="flex flex-col gap-2"
      >
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (sittings.error) {
    return (
      <Callout tone="bad" title="Could not load the classes">
        {errorMessage(sittings.error, "")} Close this and try again.
      </Callout>
    );
  }

  const rows = sittings.data?.rows ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState icon="calendar" title="No classes coming up" compact>
        There are no classes for this group that you teach in the coming weeks.
        Schedule a new class instead.
      </EmptyState>
    );
  }

  // Grouped by the day they fall on, in the institution's time; the rows
  // already come soonest first.
  const days: { label: string; rows: Sitting[] }[] = [];
  for (const row of rows) {
    const label = formatDayLabel(row.start, timeZone);
    const last = days[days.length - 1];
    if (last?.label === label) last.rows.push(row);
    else days.push({ label, rows: [row] });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Class"
      className="plr-scroll flex max-h-80 flex-col gap-4 overflow-y-auto rounded-[12px] p-1"
    >
      {days.map((day) => (
        <div key={day.label} className="flex flex-col gap-1">
          <p className="text-muted text-2xs px-2 font-semibold">{day.label}</p>
          {day.rows.map((row) => {
            const chosen = sameSitting(value, row);
            const others = row.pinned.filter(
              (p) => p.assignmentId !== currentAssignmentId,
            );
            return (
              <button
                key={`${row.eventId}:${row.originalStart.getTime()}`}
                type="button"
                role="radio"
                aria-checked={chosen}
                onClick={() =>
                  onChange({
                    eventId: row.eventId,
                    originalStart: row.originalStart,
                  })
                }
                className={`flex min-h-12 w-full cursor-pointer items-start gap-3 rounded-[10px] px-3 py-2 text-left transition-[background-color,box-shadow] duration-150 ease-out ${
                  chosen
                    ? "bg-tint-selected shadow-[inset_0_0_0_1.5px_var(--slate)]"
                    : "bg-surface hover:bg-tint-hover shadow-[inset_0_0_0_1px_var(--card-ring)]"
                }`}
              >
                <span className="text-title w-28 shrink-0 pt-px font-mono text-xs tabular-nums">
                  {formatHourLabel(row.start, timeZone)}-
                  {formatHourLabel(row.end, timeZone)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-title block truncate text-sm font-semibold">
                    {row.courseTitle ?? row.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-muted font-mono text-xs">
                      {row.roomCode}
                    </span>
                    {row.pending && (
                      <Badge tone="orange">Waiting for approval</Badge>
                    )}
                    {others.length > 0 && (
                      <span className="text-faint text-xs">
                        Already holds {others.map((p) => p.title).join(", ")}
                      </span>
                    )}
                  </span>
                </span>
                {chosen && (
                  <Icon
                    name="check"
                    size={16}
                    stroke={2.2}
                    className="text-slate mt-0.5 shrink-0"
                  />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
