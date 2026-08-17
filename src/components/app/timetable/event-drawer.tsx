"use client";

import { useState } from "react";
import Link from "next/link";

import { Badge } from "~/components/ui/badge";
import { Drawer } from "~/components/ui/drawer";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { formatDayLabel, formatDuration, formatHourLabel } from "~/lib/dates";
import { api } from "~/trpc/react";
import type { GridEvent } from "./timetable-grid";

/**
 * What clicking a booked block opens.
 *
 * Which of the two things it is depends on what the person may do: a scheduler
 * gets the lecture's details with the register a button away, and someone whose
 * only business here is the register is sent straight to it — that routing
 * happens on the timetable, not in here.
 */

type Scope = "occurrence" | "following" | "series";

const SCOPES = [
  { value: "occurrence" as const, label: "Only this one" },
  { value: "following" as const, label: "This and after" },
  { value: "series" as const, label: "Every one" },
];

export function EventDrawer({
  event,
  timeZone,
  canEdit,
  canMarkAttendance,
  onClose,
  onChanged,
}: {
  event: GridEvent;
  timeZone: string;
  canEdit: boolean;
  /** Whether to offer the register at all. */
  canMarkAttendance: boolean;
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

  const minutes = Math.round(
    (event.end.getTime() - event.start.getTime()) / 60_000,
  );

  return (
    <Drawer
      open
      icon={event.kind === "CLASS" ? "book" : "calendar"}
      title={event.title}
      subtitle={`${formatDayLabel(event.start, timeZone)} · ${formatHourLabel(event.start, timeZone)}–${formatHourLabel(event.end, timeZone)}`}
      onClose={onClose}
      footer={
        canMarkAttendance ? (
          <Link
            href={`/attendance/${event.occurrenceId}`}
            className="rounded-[var(--radius-btn)] px-5 py-2.5 text-[14px] font-semibold text-white"
            style={{ background: "var(--grad-brand)" }}
          >
            {event.attendanceMarked ? "Update register" : "Take the register"}
          </Link>
        ) : undefined
      }
    >
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
            <span className="text-title text-[13.5px]">
              {event.facultyName}
            </span>
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

        {error && (
          <div
            className="rounded-xl p-3 text-[12.5px] font-medium text-[#b02636]"
            style={{
              background: "rgba(220,56,72,0.07)",
              boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)",
            }}
          >
            {error}
          </div>
        )}

        {canEdit && (
          <div
            className="flex flex-col gap-2.5 rounded-xl p-3"
            style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}
          >
            <span className="text-ink text-[13px] font-semibold">
              Cancel this lecture
            </span>
            {/*
             * Three labelled scopes are wider than the panel is on a phone.
             * The strip scrolls inside itself, so it needs no help here — a
             * scroller wrapped around it would only clip the chosen pill's
             * shadow, at every width.
             */}
            {event.isRecurring && (
              <Segmented
                items={SCOPES}
                value={scope}
                onChange={setScope}
                size="sm"
              />
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
              // The question and its two answers only sit on one line where the
              // panel is wide; on a phone the sentence would be squeezed to a
              // word per line to make room for them.
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
        )}

        <p className="text-faint m-0 text-[11.5px]">
          Drag the block on the calendar to move it to another time or room.
        </p>
      </div>
    </Drawer>
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
