"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button, IconButton } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { formatDayLabel, formatHourLabel, fromWallTime } from "~/lib/dates";
import { errorMessage } from "~/lib/error-message";
import { api } from "~/trpc/react";

import {
  ChooseSittingDialog,
  STATE_COPY,
  TZ,
  timeRange,
  type AssignmentDetailData,
  type DetailSitting,
} from "./sitting-card";

type Team = AssignmentDetailData["teams"][number];

interface Row {
  team: Team;
  slot: DetailSitting | null;
  /** The teams sharing this slot's class, in presenting order. */
  shared: DetailSitting[];
  /** Where this team comes among them. */
  index: number;
  /** When this team should start, when the class is shared and minutes are set. */
  estimate: Date | null;
}

/** A YYYY-MM-DD day's local midnight in the institution's time. */
export function dayStart(day: string, offsetDays = 0) {
  const [y, m, d] = day.split("-").map(Number);
  return fromWallTime(
    {
      year: y!,
      month: m!,
      day: d! + offsetDays,
      hour: 0,
      minute: 0,
      second: 0,
    },
    TZ,
  );
}

export function buildRows(detail: AssignmentDetailData): Row[] {
  const slots = detail.sittings.filter((s) => s.teamId !== null);
  return detail.teams.map((team) => {
    const slot = slots.find((s) => s.teamId === team.id) ?? null;
    const shared = slot?.exceptionId
      ? slots
          .filter((s) => s.exceptionId === slot.exceptionId)
          .sort((a, b) => a.position - b.position)
      : slot
        ? [slot]
        : [];
    const index = slot ? shared.findIndex((s) => s.id === slot.id) : -1;
    const estimate =
      slot && detail.minutesPerTeam && shared.length > 1
        ? new Date(
            slot.startsAt.getTime() + index * detail.minutesPerTeam * 60_000,
          )
        : null;
    return { team, slot, shared, index, estimate };
  });
}

/**
 * One row per team: the class it presents in, and the ways to book, move,
 * clear and reorder it. Below md the rows become stacked cards.
 */
export function SlotsTable({ detail }: { detail: AssignmentDetailData }) {
  const utils = api.useUtils();
  const rows = buildRows(detail);
  const [booking, setBooking] = useState<Team | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The timetable's blocks name the teams presenting in a class, and the
  // picker says what each class already holds.
  const refresh = () =>
    Promise.all([
      utils.assignments.byId.invalidate({ id: detail.id }),
      utils.assignments.list.invalidate(),
      utils.assignments.sittingsFor.invalidate(),
      utils.timetable.invalidate(),
    ]);

  const setSlot = api.assignments.setSlot.useMutation({
    onSuccess: async (result) => {
      toast.success(
        result.pending
          ? `Slot booked for ${booking?.name ?? "the team"}. The class waits for approval.`
          : `Slot booked for ${booking?.name ?? "the team"}. Its members have been told.`,
      );
      setBooking(null);
      await refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const clearSlot = api.assignments.clearSlot.useMutation({
    onSuccess: async () => {
      toast.success("Slot cleared.");
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reorder = api.assignments.reorderSlots.useMutation({
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const move = (row: Row, by: -1 | 1) => {
    const exceptionId = row.slot?.exceptionId;
    if (!exceptionId) return;
    const order = row.shared.map((s) => s.teamId!);
    const at = row.index;
    const to = at + by;
    if (to < 0 || to >= order.length) return;
    [order[at], order[to]] = [order[to]!, order[at]!];
    reorder.mutate({ id: detail.id, exceptionId, teamIds: order });
  };

  const busy = clearSlot.isPending || reorder.isPending;
  const from = detail.window ? dayStart(detail.window.start) : undefined;
  const to = detail.window ? dayStart(detail.window.end, 1) : undefined;

  const actions = (row: Row) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {row.slot && row.shared.length > 1 && (
        <>
          <IconButton
            icon="chevronLeft"
            className="rotate-90"
            size="sm"
            label={`Move ${row.team.name} earlier`}
            disabled={busy || row.index === 0 || !row.slot.exceptionId}
            onClick={() => move(row, -1)}
          />
          <IconButton
            icon="chevronDown"
            size="sm"
            label={`Move ${row.team.name} later`}
            disabled={
              busy ||
              row.index === row.shared.length - 1 ||
              !row.slot.exceptionId
            }
            onClick={() => move(row, 1)}
          />
        </>
      )}
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          setError(null);
          setBooking(row.team);
        }}
      >
        {row.slot ? "Change" : "Book a slot"}
      </Button>
      {row.slot && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            clearSlot.mutate({ id: detail.id, teamId: row.team.id })
          }
        >
          Clear
        </Button>
      )}
    </div>
  );

  const slotCell = (row: Row) => {
    if (!row.slot)
      return <span className="text-faint text-sm">No slot yet</span>;
    const state = row.slot.state !== "ok" ? row.slot.state : null;
    return (
      <div className="flex flex-col gap-1">
        <span className="text-ink flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-title font-semibold">
            {formatDayLabel(row.slot.startsAt, TZ)}
          </span>
          <span className="font-mono text-xs tabular-nums">
            {timeRange(row.slot.startsAt, row.slot.endsAt)}
          </span>
          {row.slot.roomCode && (
            <span className="text-muted font-mono text-xs">
              {row.slot.roomCode}
            </span>
          )}
        </span>
        {row.shared.length > 1 && (
          <span className="text-faint text-xs">
            {ordinal(row.index + 1)} of {row.shared.length} in this class
            {row.estimate && (
              <>
                , from about{" "}
                <span className="font-mono tabular-nums">
                  {formatHourLabel(row.estimate, TZ)}
                </span>
              </>
            )}
          </span>
        )}
        {state && (
          <span>
            <Badge tone={STATE_COPY[state].tone}>
              {STATE_COPY[state].badge}
            </Badge>
          </span>
        )}
      </div>
    );
  };

  return (
    <Card pad={0}>
      <h2 className="font-display text-title text-md px-4 pt-4 pb-2 font-semibold tracking-[-0.01em] md:px-5">
        Slots
      </h2>
      {rows.length === 0 ? (
        <div className="px-4 pb-4 md:px-5">
          <EmptyState compact icon="calendar" title="No teams to book">
            Make and save the teams first. Each team then gets a slot of its
            own.
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Phone: one card per team. */}
          <ul className="flex flex-col md:hidden">
            {rows.map((row) => (
              <li
                key={row.team.id}
                className="flex flex-col gap-2 px-4 py-3 shadow-[0_1px_0_var(--hair-soft)] last:shadow-none"
              >
                <div className="text-title text-base font-semibold">
                  {row.team.name}
                </div>
                {row.team.topic && (
                  <div className="text-muted text-sm">{row.team.topic}</div>
                )}
                {slotCell(row)}
                {actions(row)}
              </li>
            ))}
          </ul>

          {/* Wider: a table. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="text-muted text-2xs font-semibold shadow-[0_1px_0_var(--hair)]">
                  <th className="px-5 py-2.5 font-semibold">Team</th>
                  <th className="px-3 py-2.5 font-semibold">Slot</th>
                  <th className="px-5 py-2.5 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.team.id}
                    className="align-top shadow-[0_1px_0_var(--hair-soft)] last:shadow-none"
                  >
                    <td className="px-5 py-3">
                      <div className="text-title text-sm font-semibold">
                        {row.team.name}
                      </div>
                      {row.team.topic && (
                        <div className="text-muted text-xs">
                          {row.team.topic}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">{slotCell(row)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">{actions(row)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {booking && (
        <ChooseSittingDialog
          open
          onClose={() => setBooking(null)}
          title={`Book a slot for ${booking.name}`}
          subtitle={
            detail.window
              ? `Classes from ${formatDayLabel(dayStart(detail.window.start), TZ)} to ${formatDayLabel(dayStart(detail.window.end), TZ)}`
              : undefined
          }
          assignmentId={detail.id}
          groupId={detail.group.id}
          courseId={detail.course?.id ?? null}
          from={from}
          to={to}
          saveLabel="Book this slot"
          saving={setSlot.isPending}
          error={error}
          onSave={(choice) => {
            setError(null);
            setSlot.mutate({
              id: detail.id,
              teamId: booking.id,
              sitting: choice,
            });
          }}
        />
      )}
    </Card>
  );
}

function ordinal(n: number) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
