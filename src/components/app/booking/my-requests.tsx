"use client";

import { Badge, type BadgeTone } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { formatHourLabel } from "~/lib/dates";
import { api } from "~/trpc/react";

/**
 * What happened to the things this person asked for.
 *
 * Asking and being told are two halves of the same feature: a booking that
 * waits for approval is worse than no booking at all if nobody ever says how it
 * went. Until there is an outbox to mail people from, this is where they find
 * out — including the reason, which is the part that makes a refusal something
 * other than a wall.
 */

const TZ = "Asia/Kolkata";

// The times in the same "2pm" shape as the rest of the screen (this list was
// the one place it said "14:00"), and the range with a plain hyphen.
const when = (start: Date, end: Date) =>
  `${start.toLocaleString("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  })}, ${formatHourLabel(start, TZ)}-${formatHourLabel(end, TZ)}`;

/** A detail line starts like a sentence, whichever clause came first. */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const STATE: Record<string, { tone: BadgeTone; label: string }> = {
  PENDING: { tone: "orange", label: "Waiting" },
  CONFIRMED: { tone: "green", label: "Booked" },
  APPROVED: { tone: "green", label: "Approved" },
  REJECTED: { tone: "red", label: "Refused" },
  CANCELLED: { tone: "neutral", label: "Cancelled" },
  WITHDRAWN: { tone: "neutral", label: "Withdrawn" },
};

export function MyRequests() {
  const bookings = api.events.myBookings.useQuery();
  const changes = api.events.myRequests.useQuery();
  const utils = api.useUtils();
  const withdraw = api.events.withdrawChange.useMutation({
    onSuccess: () => utils.events.invalidate(),
  });

  const rows = [
    ...(bookings.data?.rows ?? []).map((booking) => ({
      key: `b-${booking.id}`,
      title: booking.title,
      detail: `Room ${booking.room.code} · ${when(booking.startTime, booking.endTime)}`,
      status: booking.status,
      note: booking.decisionNote,
      at: booking.createdAt,
      requestId: null as string | null,
    })),
    ...(changes.data?.rows ?? []).map((request) => ({
      key: `c-${request.id}`,
      title: request.cancelling
        ? `Call off ${request.event.title}`
        : `Change to ${request.event.title}`,
      detail:
        [
          request.newRoom ? `move to ${request.newRoom.code}` : null,
          request.newStartTime
            ? `move to ${when(request.newStartTime, request.newEndTime ?? request.newStartTime)}`
            : null,
          request.newTitle ? `rename to "${request.newTitle}"` : null,
        ]
          .filter(Boolean)
          .join(", ") || `Room ${request.event.room.code}`,
      status: request.status,
      note: request.decisionNote,
      at: request.createdAt,
      requestId: request.status === "PENDING" ? request.id : null,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  if (rows.length === 0) return null;

  return (
    <Card title="Your requests" className="mt-6">
      {/*
       * A status list: what was asked for on the left, read down one edge, and
       * how it went on the right. The badge used to lead each row, and badges
       * of different widths ("Waiting", "Withdrawn") started every title at a
       * different x, so the list could not be scanned.
       */}
      <ul className="-my-3 flex flex-col">
        {rows.slice(0, 8).map((row) => {
          const state = STATE[row.status] ?? STATE.PENDING!;
          return (
            <li
              key={row.key}
              className="flex items-start gap-3 py-3 not-first:shadow-[inset_0_1px_0_var(--hair-soft)]"
            >
              <div className="min-w-0 flex-1">
                <p className="text-title text-base font-semibold">
                  {row.title}
                </p>
                <p className="text-muted mt-0.5 text-sm">
                  {sentence(row.detail)}
                </p>
                {/*
                 * The reason, when there is one, is the part of a refusal that
                 * makes it something other than a wall: set as a quotation in
                 * the body's ink, not a faint italic aside.
                 */}
                {row.note && (
                  <p className="text-ink mt-2 pl-3 text-sm shadow-[inset_2px_0_0_var(--hair)]">
                    “{row.note}”
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge tone={state.tone}>{state.label}</Badge>
                {row.requestId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    // Pulled into the row's edge so the word lines up with the
                    // badge above it; the hit area stays the button's own.
                    className="-mr-3"
                    onClick={() => withdraw.mutate({ id: row.requestId! })}
                    disabled={withdraw.isPending}
                  >
                    Withdraw
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {withdraw.error && (
        <Callout tone="bad" role="alert" className="mt-4">
          {withdraw.error.message}
        </Callout>
      )}
    </Card>
  );
}
