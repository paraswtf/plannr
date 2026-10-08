"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Dialog } from "~/components/ui/dialog";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

/**
 * The last step: writing an approved plan onto the live timetable.
 *
 * Everything before this is reversible by deleting a draft. This is not, so the
 * dialog leads with the number of classes it is about to create and re-checks
 * every one of them against live data first — a plan approved on Tuesday can
 * still be overtaken by a booking made on Wednesday.
 */
export function ApplyDialog({
  planId,
  planName,
  onClose,
  onApplied,
}: {
  planId: string;
  planName: string;
  onClose: () => void;
  onApplied: () => void | Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ created: number } | null>(null);

  const preview = api.plans.applyPreview.useQuery({ id: planId });
  const apply = api.plans.applyToTimetable.useMutation({
    onSuccess: async (result) => {
      setDone({ created: result.created });
      await onApplied();
    },
    onError: (e) => setError(e.message),
  });

  const data = preview.data;
  const blocked = (data?.blocking.length ?? 0) > 0;

  const plural = (n: number, one: string, many: string) =>
    n === 1 ? one : many;

  return (
    <Dialog
      open
      width={620}
      icon="calendar"
      title={done ? "Added to the timetable" : `Apply “${planName}”`}
      onClose={onClose}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!data || blocked || apply.isPending}
              onClick={() => {
                setError(null);
                apply.mutate({ id: planId });
              }}
            >
              {apply.isPending
                ? "Scheduling…"
                : blocked
                  ? "Clashes have to be fixed first"
                  : `Schedule ${data?.willCreate ?? 0} ${plural(
                      data?.willCreate ?? 0,
                      "class",
                      "classes",
                    )}`}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <Callout tone="good" role="status">
          {done.created} recurring {done.created === 1 ? "class" : "classes"}{" "}
          {done.created === 1 ? "is" : "are"} now on the timetable.
        </Callout>
      ) : (
        <div className="flex flex-col gap-4">
          {error && (
            <Callout tone="bad" role="alert">
              {error}
            </Callout>
          )}

          {preview.isLoading && (
            <div
              role="status"
              aria-label="Checking the plan against the live timetable"
              className="flex flex-col gap-3"
            >
              <div className="flex gap-8">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-24" />
              </div>
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          )}

          {data && (
            <>
              {/* The two numbers this step is about lead, in the display face,
                  where they used to be two bold words inside a sentence. */}
              <div className="flex flex-wrap gap-x-10 gap-y-3">
                <Figure
                  value={data.willCreate}
                  label={`weekly recurring ${plural(data.willCreate, "class", "classes")}`}
                />
                <Figure
                  value={data.weeks}
                  label={`${plural(data.weeks, "week", "weeks")} each`}
                />
              </div>
              <p className="text-ink m-0 text-sm">
                They appear on the timetable immediately.
              </p>

              {/* In order of how much each one matters: what stops the apply,
                  then what it will leave out, then what it will bend, then
                  advice. They were three identical orange boxes, and nothing
                  said which of them could be ignored. */}
              {data.blocking.length > 0 && (
                <Callout
                  tone="bad"
                  title={`${data.blocking.length} ${plural(
                    data.blocking.length,
                    "session clashes",
                    "sessions clash",
                  )} with what is already scheduled.`}
                >
                  The timetable has changed since this plan was built. Revise it
                  into a new draft and regenerate.
                  <ul className="mt-2 mb-0 flex list-none flex-col gap-1 pl-0">
                    {data.blocking.slice(0, 6).map((b) => (
                      <li key={b.sessionId} className="text-xs">
                        <b className="text-title">{b.title}:</b> {b.messages[0]}
                      </li>
                    ))}
                  </ul>
                </Callout>
              )}

              {data.skipped > 0 && (
                <Callout tone="warn">
                  {data.skipped} {plural(data.skipped, "session", "sessions")}{" "}
                  could not be placed and will be left out. Fix or remove them
                  if they matter.
                </Callout>
              )}

              {data.coTaught.length > 0 && (
                <Callout tone="info">
                  {data.coTaught.length}{" "}
                  {plural(
                    data.coTaught.length,
                    "session names",
                    "sessions name",
                  )}{" "}
                  more than one teacher. A class carries one, so the first named
                  is recorded and the rest are noted on it:{" "}
                  {data.coTaught.slice(0, 3).join(", ")}
                  {data.coTaught.length > 3 && "…"}
                </Callout>
              )}

              {data.warnings.length > 0 && (
                <Callout tone="neutral">
                  {data.warnings.length} advisory{" "}
                  {plural(data.warnings.length, "warning", "warnings")}, mostly
                  rooms that are a tight fit: {data.warnings[0]?.messages[0]}
                </Callout>
              )}

              {!blocked && (
                <p className="text-muted m-0 text-sm">
                  Once applied, the plan is frozen as a record of what it
                  created. Changing the timetable afterwards is done from the
                  Timetable tab like any other class.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** One headline number and what it counts. */
function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-display text-title text-2xl font-semibold tracking-[-0.025em] tabular-nums">
        {value}
      </span>
      <span className="text-muted text-sm">{label}</span>
    </div>
  );
}
