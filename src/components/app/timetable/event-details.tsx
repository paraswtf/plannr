"use client";

import { useState } from "react";
import Link from "next/link";

import { Badge } from "~/components/ui/badge";
import { Button, buttonClass } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { type IconName } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { ASSIGNMENT_TYPE_META, type AssignmentType } from "~/lib/assignments";
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
    subtitle: `${formatDayLabel(event.start, timeZone)} · ${formatHourLabel(event.start, timeZone)}-${formatHourLabel(event.end, timeZone)}`,
  };
}

/**
 * The footer, or nothing at all.
 *
 * A function rather than a component on purpose: `Drawer` and `Dialog` both
 * draw their footer chrome on `footer && …`, so a component returning `null`
 * would still be truthy and both surfaces would grow an empty strip.
 *
 * The register is the one primary in either frame: slate, like every screen's
 * one main action, where it used to wear the brand gradient — white type on
 * the gradient's orange end fell to about 2:1. Cancelling lives in the body as
 * a quiet danger zone, so the footer never holds two loud buttons at once.
 */
export function eventActions(
  event: GridEvent,
  canMarkAttendance: boolean,
): React.ReactNode | undefined {
  if (!canMarkAttendance) return undefined;
  return (
    <Link
      href={`/attendance/${event.occurrenceId}`}
      className={buttonClass("primary", "md")}
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
    <div className="flex flex-col gap-5">
      {/*
       * What it is, in one quiet row. Every chip is the same slate tint now:
       * the kind used to be orange — a near neighbour of the gold that means
       * "yours" on the grid — and "Repeats" green, which everywhere else means
       * something went right. Facts about a block are not states, so none of
       * them gets a state's colour. The room is a code, so it is set in the
       * mono face every other room code in the app is.
       */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="slate">
          <span className="font-mono">{event.roomCode ?? "Room"}</span>
        </Badge>
        <Badge tone="slate">
          {event.kind === "CLASS" ? "Class" : "Booking"}
        </Badge>
        {event.isRecurring && <Badge tone="slate">Repeats</Badge>}
        <span className="text-muted ml-1 text-xs tabular-nums">
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
          <span className="text-muted text-sm">No group attending</span>
        )}
      </Detail>

      {event.facultyName && (
        <Detail label="Taught by">
          <span className="text-title text-base font-medium">
            {event.facultyName}
          </span>
        </Detail>
      )}

      {event.assignments && event.assignments.length > 0 && (
        <Detail label="Tests and presentations">
          <ul className="flex flex-col gap-1.5">
            {event.assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2">
                {/* Somebody else's test in a class this teacher takes: named,
                    so they know it is happening, but not a link to a page
                    that would only say it does not exist. */}
                {a.canOpen === false ? (
                  <span className="text-title text-base font-medium">
                    {a.title}
                  </span>
                ) : (
                  <Link
                    href={`/assignments/${a.id}`}
                    className="text-slate-ink text-base font-medium hover:underline"
                  >
                    {a.title}
                  </Link>
                )}
                <span className="text-muted text-xs">
                  {ASSIGNMENT_TYPE_META[a.type as AssignmentType]?.label ??
                    "Assignment"}
                  {a.teams.length > 0 && ` · ${a.teams.join(", ")}`}
                </span>
              </li>
            ))}
          </ul>
        </Detail>
      )}

      {event.attendanceMarked && (
        <Callout tone="good">Register taken for this sitting.</Callout>
      )}

      {canEdit && (
        <CancelPanel event={event} onClose={onClose} onChanged={onChanged} />
      )}

      {/*
       * The only sentence in here that describes an action, so it leaves with
       * the action: a reader who cannot move a block should not be told to try
       * and then find that the drag does nothing. Suppressed in the modal
       * whatever the permission, because the calendar it names is the thing the
       * modal is laid over — and, from CSS alone, on a device with no fine
       * pointer anywhere, because a finger cannot drag this grid at all (only a
       * mouse, a trackpad or a pen can). `any-pointer`, not `pointer`: an iPad
       * with a trackpad attached reports a coarse *primary* pointer and can
       * still drag, and it is the one reader who would never find out.
       */}
      {canEdit && !overlay && (
        <p className="text-faint m-0 hidden text-xs any-pointer-fine:block">
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
    /*
     * A danger zone rather than a card inside the panel: a hairline above and
     * the space of a new group, which is enough to say "this part is
     * different" without boxing it. The way in is quiet red, and only the
     * confirming step is filled — the order every destructive action in the
     * app takes.
     */
    <div className="flex flex-col gap-3 pt-5 shadow-[inset_0_1px_0_var(--hair-soft)]">
      {/*
       * Named for what it is. A booking — a placement talk, a club's hour —
       * was being offered as "Cancel this lecture".
       */}
      <span className="text-title text-sm font-semibold">
        {event.kind === "CLASS" ? "Cancel this lecture" : "Cancel this booking"}
      </span>

      {error && (
        <Callout tone="bad" role="alert">
          {error}
        </Callout>
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
        <Button
          variant="danger-quiet"
          className="self-start"
          onClick={() => setConfirmCancel(true)}
        >
          Cancel…
        </Button>
      ) : (
        // The question and its two answers only sit on one line where the panel
        // is wide; on a phone the sentence would be squeezed to a word per line
        // to make room for them.
        <div className="flex flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span className="text-title text-sm font-medium">
            {event.isRecurring && scope !== "occurrence"
              ? scope === "series"
                ? "Cancel every date of this series?"
                : "Cancel this date and every one after it?"
              : "Cancel this one date?"}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button onClick={() => setConfirmCancel(false)}>Keep</Button>
            <Button
              variant="danger"
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate({
                  id: event.eventId,
                  scope: event.isRecurring ? scope : "series",
                  originalStart: event.originalStart,
                })
              }
            >
              {cancel.isPending ? "Cancelling…" : "Cancel it"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A label over its value. The label is the quieter of the two by ink and
 * weight, not by a half-pixel of size: 12px semibold muted over a 14px value
 * in the title ink.
 */
function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted text-xs font-semibold">{label}</span>
      {children}
    </div>
  );
}
