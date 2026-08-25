"use client";

import { Badge, type BadgeTone } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
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

const when = (start: Date, end: Date) =>
  `${start.toLocaleString("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  })}, ${start.toLocaleString("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  })}–${end.toLocaleString("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  })}`;

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
    <Card title="Your requests" className="mt-5">
      <ul className="flex flex-col gap-3">
        {rows.slice(0, 8).map((row) => {
          const state = STATE[row.status] ?? STATE.PENDING!;
          return (
            <li
              key={row.key}
              className="flex flex-wrap items-center gap-x-3 gap-y-1"
            >
              <Badge tone={state.tone} dot>
                {state.label}
              </Badge>
              <span className="text-[14px] font-semibold">{row.title}</span>
              <span className="text-muted text-[13px]">{row.detail}</span>
              {row.note && (
                <span className="text-muted w-full text-[12.5px] italic">
                  “{row.note}”
                </span>
              )}
              {row.requestId && (
                <button
                  type="button"
                  onClick={() => withdraw.mutate({ id: row.requestId! })}
                  disabled={withdraw.isPending}
                  className="text-muted cursor-pointer text-[12.5px] underline disabled:opacity-50"
                >
                  withdraw
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
