"use client";

import { useState } from "react";
import Link from "next/link";

import { Badge } from "~/components/ui/badge";
import { Icon, type IconName } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { formatDayLabel, formatDuration, formatHourLabel } from "~/lib/dates";
import { api } from "~/trpc/react";
import type { GridEvent } from "./timetable-grid";

/**
 * What a class says about itself, and what may be done to it.
 *
 * Two surfaces show this: the drawer a click opens, and the modal a press-and-
 * hold or a right-click opens. They are the same content in two frames, so it
 * lives here once — the moment they were two copies, one of them would grow a
 * button the other did not have.
 *
 * The split between what everybody sees and what only some do is the point of
 * the file. The badges, the cohorts, the lecturer and the duration are
 * unconditional: none of that was ever privileged, it was merely unreachable,
 * because until now a click on a block did nothing at all for most people. The
 * actions — cancelling, taking the register — keep the permissions they always
 * had, and somebody holding neither simply gets no footer. A disabled "Take the
 * register" would be an invitation to nothing.
 */

export interface EventDetailProps {
  event: GridEvent;
  timeZone: string;
  /** Whether this viewer may cancel it. */
  canEdit: boolean;
  /** Whether to offer the register at all. */
  canMarkAttendance: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<unknown>;
}

/** The three header values both frames take as props, computed in one place. */
export function eventHeading(
  event: GridEvent,
  timeZone: string,
): { icon: IconName; title: string; subtitle: string } {
  return {
    icon: event.kind === "CLASS" ? "book" : "calendar",
    title: event.title,
    subtitle: `${formatDayLabel(event.start, timeZone)} · ${formatHourLabel(event.start, timeZone)}–${formatHourLabel(event.end, timeZone)}`,
  };
}

/**
 * The footer, or nothing at all.
 *
 * A function rather than a component on purpose: `Drawer` and `Dialog` both
 * draw their footer chrome on `footer && …`, so a component returning `null`
 * would still be truthy and both surfaces would grow an empty strip.
 */
export function eventActions(
  event: GridEvent,
  canMarkAttendance: boolean,
): React.ReactNode | undefined {
  if (!canMarkAttendance) return undefined;
  return (
    <Link
      href={`/attendance/${event.occurrenceId}`}
      className="rounded-[var(--radius-btn)] px-5 py-2.5 text-[14px] font-semibold text-white"
      style={{ background: "var(--grad-brand)" }}
    >
      {event.attendanceMarked ? "Update register" : "Take the register"}
    </Link>
  );
}

export function EventDetails({
  event,
  canEdit,
  onClose,
  onChanged,
  /**
   * Whether this frame is laid over the calendar rather than beside it. The
   * only thing it changes is the footnote about dragging: true in a drawer,
   * nonsense in a modal that is covering the grid it names.
   */
  overlay = false,
}: EventDetailProps & { overlay?: boolean }) {
  const minutes = Math.round(
    (event.end.getTime() - event.start.getTime()) / 60_000,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="slate">{event.roomCode ?? "Room"}</Badge>
        <Badge tone={event.kind === "CLASS" ? "orange" : "neutral"}>
          {event.kind === "CLASS" ? "Class" : "Booking"}
        </Badge>
        {event.isRecurring && <Badge tone="green">Repeats</Badge>}
        <span className="text-faint font-mono text-[11.5px]">
          {formatDuration(minutes)}
        </span>
      </div>

      <Detail label="Groups">
        {event.groupNames && event.groupNames.length > 0 ? (
          <span className="flex flex-wrap gap-1.5">
            {event.groupNames.map((name) => (
              <Badge key={name} tone="slate">
                {name}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-faint text-[13px]">No group attending</span>
        )}
      </Detail>

      {event.facultyName && (
        <Detail label="Taught by">
          <span className="text-title text-[13.5px]">{event.facultyName}</span>
        </Detail>
      )}

      {event.attendanceMarked && (
        <div
          className="flex items-center gap-2.5 rounded-xl p-3"
          style={{
            background: "rgba(78,125,58,0.08)",
            boxShadow: "inset 0 0 0 1px rgba(78,125,58,0.3)",
          }}
        >
          <Icon name="checkCircle" size={17} color="#4e7d3a" stroke={2} />
          <span className="text-[12.5px] font-semibold text-[#3f6a2e]">
            Register taken for this sitting.
          </span>
        </div>
      )}

      {canEdit && (
        <CancelPanel event={event} onClose={onClose} onChanged={onChanged} />
      )}

      {/*
       * The only sentence in here that describes an action, so it leaves with
       * the action: a reader who cannot move a block should not be told to try
       * and then find that the drag does nothing. Suppressed in the modal
       * whatever the permission, because the calendar it names is the thing the
       * modal is laid over.
       */}
      {canEdit && !overlay && (
        <p className="text-faint m-0 text-[11.5px]">
          Drag the block on the calendar to move it to another time or room.
        </p>
      )}
    </div>
  );
}

type Scope = "occurrence" | "following" | "series";

const SCOPES = [
  { value: "occurrence" as const, label: "Only this one" },
  { value: "following" as const, label: "This and after" },
  { value: "series" as const, label: "Every one" },
];

/**
 * Cancelling, and the question a repeating class raises when you do.
 *
 * It owns its own state — the scope, the confirmation, the failure — so that
 * `EventDetails` holds none and either frame can mount it without becoming the
 * owner of anything. The error sits inside the panel rather than above it,
 * which is where the control that caused it is.
 */
function CancelPanel({
  event,
  onClose,
  onChanged,
}: {
  event: GridEvent;
  onClose: () => void;
  onChanged: () => void | Promise<unknown>;
}) {
  const [scope, setScope] = useState<Scope>("occurrence");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = api.events.cancel.useMutation({
    onSuccess: async () => {
      await onChanged();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <div
      className="flex flex-col gap-2.5 rounded-xl p-3"
      style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}
    >
      <span className="text-ink text-[13px] font-semibold">
        Cancel this lecture
      </span>

      {error && (
        <div
          className="rounded-lg p-2.5 text-[12.5px] font-medium text-[#b02636]"
          style={{
            background: "rgba(220,56,72,0.07)",
            boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)",
          }}
        >
          {error}
        </div>
      )}

      {/*
       * Three labelled scopes are wider than the panel is on a phone. The strip
       * scrolls inside itself, so it needs no help here — a scroller wrapped
       * around it would only clip the chosen pill's shadow, at every width.
       */}
      {event.isRecurring && (
        <Segmented items={SCOPES} value={scope} onChange={setScope} size="sm" />
      )}

      {!confirmCancel ? (
        <button
          type="button"
          onClick={() => setConfirmCancel(true)}
          className="min-h-10 cursor-pointer rounded-lg px-3 text-[12.5px] font-semibold text-[#b02636] lg:min-h-0 lg:py-1.5"
          style={{ boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)" }}
        >
          Cancel…
        </button>
      ) : (
        // The question and its two answers only sit on one line where the panel
        // is wide; on a phone the sentence would be squeezed to a word per line
        // to make room for them.
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span className="text-ink text-[12.5px]">
            {event.isRecurring && scope !== "occurrence"
              ? scope === "series"
                ? "Cancel every date of this series?"
                : "Cancel this date and every one after it?"
              : "Cancel this one date?"}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="text-muted min-h-10 cursor-pointer rounded-lg px-3 text-[12.5px] font-semibold lg:min-h-0 lg:py-1.5"
            >
              Keep
            </button>
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate({
                  id: event.eventId,
                  scope: event.isRecurring ? scope : "series",
                  originalStart: event.originalStart,
                })
              }
              className="min-h-10 cursor-pointer rounded-lg px-3 text-[12.5px] font-semibold text-white lg:min-h-0 lg:py-1.5"
              style={{ background: "var(--red)" }}
            >
              {cancel.isPending ? "Cancelling…" : "Cancel it"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-ink text-[13px] font-semibold">{label}</span>
      {children}
    </div>
  );
}
