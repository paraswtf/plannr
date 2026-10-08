"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
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
 *
 * This list is where a series' clashes are resolved, so the form does not list
 * the same dates a second time in its red summary: the verdict by the Book
 * button counts them, and this says which they are, in the verdict's tone.
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

  // Red while any date still in the series is a hard clash, which is exactly
  // when the verdict by the Book button reads red and counts them: this list
  // is that verdict's detail (the red summary leaves these dates to it), so
  // the two have to be the same message. Once every such date is skipped or
  // the clash is only a pending request, it is a note again, in amber.
  const blocking = draft.hardConflicts.some(
    (c) => c.candidate && c.clashesWith,
  );
  const tone = blocking ? "bad" : "warn";

  return (
    // One note holding a row per date, separated by hairlines: these were
    // white cards inside a tinted box, a card in a card, and each row squeezed
    // its description down to "Mid-s…" to make room for the buttons.
    <Callout
      tone={tone}
      title={
        <span className="flex items-baseline justify-between gap-3">
          <span>
            {dated.length} of {draft.dates.length} dates clash
          </span>
          <span className="text-faint shrink-0 text-xs font-normal">
            <span className="font-mono tabular-nums">
              {draft.skipped.length}
            </span>{" "}
            skipped
          </span>
        </span>
      }
    >
      {error && (
        <p role="alert" className="text-bad mt-1 text-xs font-medium">
          {error}
        </p>
      )}

      <ul className="mt-2 flex flex-col">
        {dated.map((conflict) => {
          const at = conflict.candidate!.start;
          const other = conflict.clashesWith!;
          const key = `${other.occurrenceId}:${at.getTime()}`;
          const skipped = draft.isSkipped(at);
          const isGone = cancelled.includes(key);

          return (
            // Two lines: what clashes on that date, written out in full, and
            // under it whatever can be done about it, on the trailing edge.
            <li
              key={key}
              // The hairline in the note's own tone, as the Callout's ring is.
              className={`flex flex-col gap-2 py-2.5 last:pb-0 ${blocking ? "shadow-[inset_0_1px_0_var(--bad-line)]" : "shadow-[inset_0_1px_0_var(--warn-line)]"}`}
            >
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-title font-mono text-xs font-semibold tabular-nums">
                  {formatDayLabel(at, timeZone)}
                </span>
                <span
                  className={`min-w-0 text-sm ${skipped || isGone ? "text-muted" : "text-ink"}`}
                >
                  {skipped
                    ? "Skipped. This date will not be booked."
                    : isGone
                      ? `${other.title} cancelled for this date.`
                      : `${other.title} · ${formatHourLabel(other.start, timeZone)}`}
                </span>
                {isGone && (
                  <Icon
                    name="checkCircle"
                    size={15}
                    stroke={2}
                    className="text-good self-center"
                  />
                )}
              </p>

              {skipped ? (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => draft.unskipDate(at)}
                  >
                    Undo
                  </Button>
                </div>
              ) : isGone ? null : confirming === key ? (
                // The question on its own line, then the answer and the way
                // back together, the confirming step last.
                <div className="flex flex-col gap-2">
                  <p className="text-ink text-sm font-medium">
                    Cancel {other.title} on this date?
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirming(null)}
                    >
                      No
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={cancel.isPending}
                      onClick={async () => {
                        setError(null);
                        try {
                          await cancel.mutateAsync({
                            id: other.eventId,
                            scope: "occurrence",
                            originalStart: other.originalStart,
                            reason:
                              "Cancelled to free the room for another class",
                          });
                          setCancelled((current) => [...current, key]);
                          setConfirming(null);
                          await onCancelled();
                        } catch (cause) {
                          setError((cause as Error).message);
                          setConfirming(null);
                        }
                      }}
                    >
                      {cancel.isPending ? "Cancelling…" : "Yes, cancel it"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" onClick={() => draft.skipDate(at)}>
                    Skip this date
                  </Button>
                  {/* The way towards taking someone's room, not the step itself. */}
                  {canCancelOthers && (
                    <Button
                      variant="danger-quiet"
                      size="sm"
                      onClick={() => setConfirming(key)}
                    >
                      Cancel theirs
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Callout>
  );
}
