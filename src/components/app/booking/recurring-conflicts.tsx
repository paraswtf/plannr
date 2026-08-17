"use client";

import { useState } from "react";

import { Icon } from "~/components/ui/icon";
import { formatDayLabel, formatHourLabel } from "~/lib/dates";
import type { BookingDraft } from "./use-booking-draft";

/**
 * The dates of a repeating booking that clash, and the two ways out of each.
 *
 * A weekly booking that hits something on three Tuesdays out of twelve should
 * not be all-or-nothing. Each clashing date offers to drop that one date from
 * the new series, or to cancel the booking already there — and the second one
 * asks first, because it takes someone else's room away.
 */
export function RecurringConflicts({
  draft,
  timeZone,
  canCancelOthers,
  onCancelled,
}: {
  draft: BookingDraft;
  timeZone: string;
  /** Whether this user may cancel other people's events. */
  canCancelOthers: boolean;
  onCancelled: () => void | Promise<unknown>;
}) {
  // Which row is asking "are you sure" about taking the other booking out.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const dated = draft.allConflicts.filter((c) => c.candidate && c.clashesWith);
  if (draft.repeat === "none" || dated.length === 0) return null;

  const cancel = draft.cancelClashingOccurrence;

  return (
    <div
      className="flex flex-col gap-2 rounded-xl p-3"
      style={{
        background: "rgba(246,167,59,0.08)",
        boxShadow: "inset 0 0 0 1px rgba(246,167,59,0.4)",
      }}
    >
      <div className="flex items-center gap-2">
        <Icon name="alert" size={16} color="var(--orange)" stroke={2} />
        <span className="text-ink text-[13px] font-bold">
          {dated.length} of {draft.dates.length} dates clash
        </span>
        <span className="text-faint ml-auto font-mono text-[11.5px]">
          {draft.skipped.length} skipped
        </span>
      </div>

      {error && (
        <div className="text-[12px] font-medium text-[#b02636]">{error}</div>
      )}

      {dated.map((conflict) => {
        const at = conflict.candidate!.start;
        const other = conflict.clashesWith!;
        const key = `${other.occurrenceId}:${at.getTime()}`;
        const skipped = draft.isSkipped(at);
        const isGone = cancelled.includes(key);

        return (
          <div
            key={key}
            className="bg-surface flex flex-wrap items-center gap-2 rounded-[10px] px-2.5 py-2"
            style={{ boxShadow: "var(--ring)" }}
          >
            <span className="text-title font-mono text-[12px] font-bold">
              {formatDayLabel(at, timeZone)}
            </span>
            <span className="text-muted min-w-0 flex-1 truncate text-[12px]">
              {skipped
                ? "Skipped — this date will not be booked."
                : isGone
                  ? `${other.title} cancelled for this date.`
                  : `${other.title} · ${formatHourLabel(other.start, timeZone)}`}
            </span>

            {skipped ? (
              <button
                type="button"
                onClick={() => draft.unskipDate(at)}
                className="text-slate inline-flex min-h-10 cursor-pointer items-center rounded-lg px-2.5 text-[12px] font-semibold lg:min-h-0 lg:py-1"
              >
                Undo
              </button>
            ) : isGone ? (
              <Icon name="checkCircle" size={15} color="#4e7d3a" stroke={2} />
            ) : confirming === key ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-ink text-[12px]">
                  Cancel {other.title} on this date?
                </span>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="text-muted inline-flex min-h-10 cursor-pointer items-center rounded-lg px-2.5 text-[12px] font-semibold lg:min-h-0 lg:px-2 lg:py-1"
                >
                  No
                </button>
                <button
                  type="button"
                  disabled={cancel.isPending}
                  onClick={async () => {
                    setError(null);
                    try {
                      await cancel.mutateAsync({
                        id: other.eventId,
                        scope: "occurrence",
                        originalStart: other.originalStart,
                        reason: "Cancelled to free the room for another class",
                      });
                      setCancelled((current) => [...current, key]);
                      setConfirming(null);
                      await onCancelled();
                    } catch (cause) {
                      setError((cause as Error).message);
                      setConfirming(null);
                    }
                  }}
                  className="inline-flex min-h-10 cursor-pointer items-center rounded-lg px-2.5 text-[12px] font-semibold text-white lg:min-h-0 lg:py-1"
                  style={{ background: "var(--red)" }}
                >
                  {cancel.isPending ? "Cancelling…" : "Yes, cancel it"}
                </button>
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => draft.skipDate(at)}
                  className="text-slate inline-flex min-h-10 cursor-pointer items-center rounded-lg px-2.5 text-[12px] font-semibold lg:min-h-0 lg:py-1"
                  style={{ boxShadow: "var(--ring)" }}
                >
                  Skip this date
                </button>
                {canCancelOthers && (
                  <button
                    type="button"
                    onClick={() => setConfirming(key)}
                    className="inline-flex min-h-10 cursor-pointer items-center rounded-lg px-2.5 text-[12px] font-semibold text-[#b02636] lg:min-h-0 lg:py-1"
                    style={{ boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)" }}
                  >
                    Cancel theirs
                  </button>
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
