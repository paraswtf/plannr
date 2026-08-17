"use client";

import { useState } from "react";

import { Dialog } from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
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

  return (
    <Dialog
      open
      width={620}
      icon="calendar"
      title={done ? "Added to the timetable" : `Apply “${planName}”`}
      onClose={onClose}
      footer={
        done ? (
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-10 items-center rounded-lg px-3.5 text-[13px] font-semibold text-white lg:min-h-0 lg:py-2"
            style={{ background: "var(--slate)" }}
          >
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="text-muted flex min-h-10 cursor-pointer items-center rounded-lg px-3.5 text-[13px] font-semibold lg:min-h-0 lg:py-2"
              style={{ boxShadow: "var(--ring)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!data || blocked || apply.isPending}
              onClick={() => {
                setError(null);
                apply.mutate({ id: planId });
              }}
              className="flex min-h-10 items-center rounded-lg px-3.5 text-[13px] font-semibold text-white lg:min-h-0 lg:py-2"
              style={{
                background: "var(--grad-brand)",
                opacity: !data || blocked || apply.isPending ? 0.5 : 1,
                cursor:
                  !data || blocked || apply.isPending
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {apply.isPending
                ? "Scheduling…"
                : blocked
                  ? "Clashes have to be fixed first"
                  : `Schedule ${data?.willCreate ?? 0} classes`}
            </button>
          </>
        )
      }
    >
      {done ? (
        <div
          className="flex items-center gap-2.5 rounded-xl p-4"
          style={{
            background: "rgba(78,125,58,0.08)",
            boxShadow: "inset 0 0 0 1px rgba(78,125,58,0.3)",
          }}
        >
          <Icon name="checkCircle" size={19} color="#4e7d3a" stroke={2} />
          <span className="text-[13.5px] font-semibold text-[#3f6a2e]">
            {done.created} recurring {done.created === 1 ? "class" : "classes"}{" "}
            are now on the timetable.
          </span>
        </div>
      ) : (
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

          {preview.isLoading && (
            <p className="text-muted m-0 text-[13px]">
              Checking the plan against the live timetable…
            </p>
          )}

          {data && (
            <>
              <p className="text-ink m-0 text-[13.5px]">
                This will create <b>{data.willCreate}</b> weekly recurring{" "}
                {data.willCreate === 1 ? "class" : "classes"}, each repeating
                for <b>{data.weeks}</b> {data.weeks === 1 ? "week" : "weeks"}.
                They appear on the timetable immediately.
              </p>

              {data.skipped > 0 && (
                <Notice tone="orange">
                  {data.skipped} session{data.skipped === 1 ? "" : "s"} could
                  not be placed and will be left out. Fix or remove them if they
                  matter.
                </Notice>
              )}

              {data.coTaught.length > 0 && (
                <Notice tone="orange">
                  {data.coTaught.length} session
                  {data.coTaught.length === 1 ? "" : "s"} name more than one
                  teacher. A class carries one, so the first named is recorded
                  and the rest are noted on it:{" "}
                  {data.coTaught.slice(0, 3).join(", ")}
                  {data.coTaught.length > 3 && "…"}
                </Notice>
              )}

              {data.blocking.length > 0 && (
                <Notice tone="red">
                  <b>
                    {data.blocking.length} session
                    {data.blocking.length === 1 ? "" : "s"} clash with what is
                    already scheduled.
                  </b>{" "}
                  The timetable has changed since this plan was built. Revise it
                  into a new draft and regenerate.
                  <ul className="mt-2 mb-0 flex list-none flex-col gap-1 pl-0">
                    {data.blocking.slice(0, 6).map((b) => (
                      <li key={b.sessionId} className="text-[12px]">
                        <b>{b.title}</b> — {b.messages[0]}
                      </li>
                    ))}
                  </ul>
                </Notice>
              )}

              {data.warnings.length > 0 && (
                <Notice tone="orange">
                  {data.warnings.length} advisory warning
                  {data.warnings.length === 1 ? "" : "s"}, mostly rooms that are
                  a tight fit: {data.warnings[0]?.messages[0]}
                </Notice>
              )}

              {!blocked && (
                <p className="text-faint m-0 text-[12.5px]">
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

function Notice({
  tone,
  children,
}: {
  tone: "orange" | "red";
  children: React.ReactNode;
}) {
  const tones = {
    orange: {
      background: "rgba(246,167,59,0.10)",
      boxShadow: "inset 0 0 0 1px rgba(246,167,59,0.35)",
      color: "#8a5a10",
    },
    red: {
      background: "rgba(220,56,72,0.07)",
      boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)",
      color: "#b02636",
    },
  };
  return (
    <div className="rounded-xl p-3 text-[12.5px]" style={tones[tone]}>
      {children}
    </div>
  );
}
