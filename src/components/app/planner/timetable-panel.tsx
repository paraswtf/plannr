"use client";

import { useMemo, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { Select } from "~/components/ui/select";
import { formatDuration } from "~/lib/dates";
import {
  formatSessionWhen,
  formatSlot,
  ISO_WEEKDAYS,
  WEEKDAY_LABEL,
} from "~/lib/schedule-plan";
import { api, type RouterOutputs } from "~/trpc/react";
import { PlanWeekGrid, type PlanGridSession } from "./plan-week-grid";

type Plan = RouterOutputs["plans"]["byId"];
type Session = Plan["sessions"][number];

/**
 * The proposed week, and the one place a planner argues with it.
 *
 * The grid shows everything by default, which is honest but busy, so a filter
 * narrows it to one group, room or teacher — the three lenses a timetable is
 * actually read through. Picking a session opens a panel that can move it; the
 * server re-checks the move against the rest of the plan and the live
 * timetable, so a bad drop is refused with a reason rather than accepted and
 * discovered later.
 */
export function TimetablePanel({
  plan,
  onChanged,
}: {
  plan: Plan;
  onChanged: () => void | Promise<unknown>;
}) {
  const [lens, setLens] = useState<"all" | "group" | "room" | "faculty">("all");
  const [lensValue, setLensValue] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const placed = plan.sessions.filter((s) => s.dayOfWeek !== null);
  const unplaced = plan.sessions.filter((s) => s.dayOfWeek === null);

  const options = useMemo(() => {
    if (lens === "group") {
      const seen = new Map<string, string>();
      for (const s of plan.sessions) seen.set(s.groupId, s.groupLabel);
      return [...seen].map(([value, label]) => ({ value, label }));
    }
    if (lens === "room") {
      const seen = new Map<string, string>();
      for (const s of plan.sessions) {
        if (s.roomId && s.roomCode) seen.set(s.roomId, s.roomCode);
      }
      return [...seen].map(([value, label]) => ({ value, label }));
    }
    if (lens === "faculty") {
      const seen = new Map<string, string>();
      for (const s of plan.sessions) {
        s.facultyIds.forEach((id, i) => seen.set(id, s.facultyNames[i] ?? id));
      }
      return [...seen].map(([value, label]) => ({ value, label }));
    }
    return [];
  }, [lens, plan.sessions]);

  const visible = placed.filter((s) => {
    if (lens === "all" || !lensValue) return true;
    if (lens === "group") return s.groupId === lensValue;
    if (lens === "room") return s.roomId === lensValue;
    return s.facultyIds.includes(lensValue);
  });

  const gridSessions: PlanGridSession[] = visible.map((s) => ({
    id: s.id,
    title: s.title,
    groupLabel: s.groupLabel,
    roomCode: s.roomCode,
    facultyNames: s.facultyNames,
    dayOfWeek: s.dayOfWeek,
    startMinutes: s.startMinutes,
    durationMinutes: s.durationMinutes,
    pinned: s.pinned,
    commentCount: s.commentCount,
  }));

  const selected = plan.sessions.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          ariaLabel="View by"
          size="sm"
          value={lens}
          options={[
            { value: "all", label: "Everything" },
            { value: "group", label: "One group" },
            { value: "room", label: "One room" },
            { value: "faculty", label: "One teacher" },
          ]}
          onChange={(next) => {
            setLens(next);
            setLensValue("");
          }}
        />
        {lens !== "all" && (
          <div className="w-56">
            <Select
              ariaLabel="Filter"
              size="sm"
              value={lensValue}
              placeholder="Pick one…"
              options={[{ value: "", label: "All of them" }, ...options]}
              onChange={setLensValue}
            />
          </div>
        )}
        <span className="text-faint ml-auto font-mono text-[12px]">
          {placed.length} placed
          {unplaced.length > 0 && ` · ${unplaced.length} unplaced`}
        </span>
      </div>

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

      {plan.sessions.length === 0 ? (
        <Card>
          <p className="text-muted m-0 text-[14px]">
            Nothing has been laid out yet. Add the demand, then hit{" "}
            <b>Generate timetable</b>.
          </p>
        </Card>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[1fr_320px]">
          <PlanWeekGrid
            sessions={gridSessions}
            workingDays={plan.settings.workingDays}
            dayStartMinutes={plan.settings.dayStartMinutes}
            dayEndMinutes={plan.settings.dayEndMinutes}
            selectedId={selectedId}
            onSelect={(s) => {
              setError(null);
              setSelectedId(s.id === selectedId ? null : s.id);
            }}
          />

          <div className="flex flex-col gap-4">
            {selected ? (
              <SessionPanel
                plan={plan}
                session={selected}
                onClose={() => setSelectedId(null)}
                onChanged={onChanged}
                onError={setError}
              />
            ) : (
              <Card title="The week" pad={18}>
                <p className="text-muted m-0 text-[13px]">
                  Pick a session to see it in full, move it, or pin it so
                  regenerating leaves it alone.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <Legend
                    swatch="color-mix(in srgb, var(--slate) 11%, #fff)"
                    label="Proposed session"
                  />
                  <Legend swatch="var(--orange)" dot label="Pinned by hand" />
                </div>
              </Card>
            )}

            {unplaced.length > 0 && (
              <Card
                title={`Could not be placed (${unplaced.length})`}
                pad={18}
              >
                <div className="flex flex-col gap-2.5">
                  {unplaced.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => setSelectedId(session.id)}
                      className="cursor-pointer rounded-[10px] p-2.5 text-left"
                      style={{
                        background: "rgba(220,56,72,0.05)",
                        boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.22)",
                      }}
                    >
                      <span className="text-title block text-[12.5px] font-bold">
                        {session.title}
                      </span>
                      <span className="text-muted block text-[11.5px]">
                        {session.groupLabel} ·{" "}
                        {formatDuration(session.durationMinutes)}
                      </span>
                      {session.reason && (
                        <span className="mt-1 block text-[11.5px] text-[#b02636]">
                          {session.reason}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({
  swatch,
  label,
  dot = false,
}: {
  swatch: string;
  label: string;
  dot?: boolean;
}) {
  return (
    <span className="text-muted flex items-center gap-2 text-[12px]">
      <span
        className={dot ? "h-[8px] w-[8px] rounded-full" : "h-[14px] w-[22px] rounded"}
        style={{
          background: swatch,
          boxShadow: dot ? undefined : "inset 0 0 0 1px rgba(68,88,121,0.22)",
        }}
      />
      {label}
    </span>
  );
}

/** The selected session: where it is, and every way to change that. */
function SessionPanel({
  plan,
  session,
  onClose,
  onChanged,
  onError,
}: {
  plan: Plan;
  session: Session;
  onClose: () => void;
  onChanged: () => void | Promise<unknown>;
  onError: (message: string | null) => void;
}) {
  const [day, setDay] = useState(session.dayOfWeek ?? plan.settings.workingDays[0] ?? 1);
  const [start, setStart] = useState(
    session.startMinutes ?? plan.settings.dayStartMinutes,
  );
  const [roomId, setRoomId] = useState(session.roomId ?? "");
  const [comment, setComment] = useState("");

  const workspace = api.plans.workspace.useQuery();
  const utils = api.useUtils();

  const done = async () => {
    onError(null);
    await utils.plans.invalidate();
    await onChanged();
  };

  const move = api.plans.moveSession.useMutation({
    onSuccess: done,
    onError: (e) => onError(e.message),
  });
  const pin = api.plans.setSessionPinned.useMutation({
    onSuccess: done,
    onError: (e) => onError(e.message),
  });
  const clear = api.plans.clearSession.useMutation({
    onSuccess: done,
    onError: (e) => onError(e.message),
  });
  const addComment = api.plans.comment.useMutation({
    onSuccess: async () => {
      setComment("");
      await done();
    },
    onError: (e) => onError(e.message),
  });

  const starts: number[] = [];
  for (
    let minute = plan.settings.dayStartMinutes;
    minute + session.durationMinutes <= plan.settings.dayEndMinutes;
    minute += plan.settings.slotMinutes
  ) {
    starts.push(minute);
  }

  // Every active room is offered. A hand-move is an override of what the
  // solver decided, so the room requirements are advice at this point rather
  // than a rule — but the server still refuses a slot that is actually taken.
  const rooms = workspace.data?.rooms ?? [];

  return (
    <Card pad={18}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="font-display text-title block truncate text-[15px] font-bold">
            {session.title}
          </span>
          <span className="text-muted block truncate text-[12px]">
            {session.groupLabel}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg"
        >
          <Icon name="x" size={13} color="var(--muted)" />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <Badge tone={session.dayOfWeek === null ? "red" : "slate"}>
          {formatSessionWhen(
            session.dayOfWeek,
            session.startMinutes,
            session.durationMinutes,
          )}
        </Badge>
        {session.roomCode && <Badge tone="green">{session.roomCode}</Badge>}
        {session.pinned && (
          <Badge tone="orange" dot>
            pinned
          </Badge>
        )}
      </div>

      {session.facultyNames.length > 0 && (
        <p className="text-muted mt-0 mb-3 text-[12.5px]">
          Taught by {session.facultyNames.join(", ")}
        </p>
      )}

      {session.reason && (
        <p className="mt-0 mb-3 text-[12px] text-[#b02636]">{session.reason}</p>
      )}

      {plan.can.edit && (
        <>
          <div className="mb-2.5 grid grid-cols-2 gap-2">
            <Select
              ariaLabel="Day"
              size="sm"
              value={day}
              options={ISO_WEEKDAYS.filter((d) =>
                plan.settings.workingDays.includes(d),
              ).map((d) => ({ value: d, label: WEEKDAY_LABEL[d]! }))}
              onChange={setDay}
            />
            <Select
              ariaLabel="Start time"
              size="sm"
              value={start}
              options={starts.map((minute) => ({
                value: minute,
                label: formatSlot(minute),
              }))}
              onChange={setStart}
            />
          </div>
          <div className="mb-2.5">
            <Select
              ariaLabel="Room"
              size="sm"
              value={roomId}
              placeholder="Pick a room…"
              options={rooms.map((room) => ({
                value: room.id,
                label: room.code,
                hint: `${room.capacity} seats · ${room.building.name}`,
              }))}
              onChange={setRoomId}
            />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={move.isPending || !roomId}
              onClick={() =>
                move.mutate({
                  id: session.id,
                  dayOfWeek: day,
                  startMinutes: start,
                  roomId,
                })
              }
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white"
              style={{
                background: "var(--slate)",
                opacity: move.isPending || !roomId ? 0.5 : 1,
                cursor: move.isPending || !roomId ? "not-allowed" : "pointer",
              }}
            >
              {move.isPending ? "Moving…" : "Move here"}
            </button>
            <button
              type="button"
              onClick={() =>
                pin.mutate({ id: session.id, pinned: !session.pinned })
              }
              className="text-muted cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
              style={{ boxShadow: "var(--ring)" }}
            >
              {session.pinned ? "Unpin" : "Pin here"}
            </button>
            {session.dayOfWeek !== null && (
              <button
                type="button"
                onClick={() => clear.mutate({ id: session.id })}
                className="cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-[#b02636]"
                style={{ boxShadow: "var(--ring)" }}
              >
                Take off the grid
              </button>
            )}
          </div>
        </>
      )}

      <div style={{ boxShadow: "inset 0 1px 0 var(--hair-soft)" }} className="pt-3">
        <span className="text-ink mb-1.5 block text-[12.5px] font-semibold">
          Comment on this session
        </span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="e.g. this clashes with the placement drive"
          className="bg-surface plr-scroll w-full resize-y rounded-[10px] px-3 py-2 text-[12.5px] outline-none"
          style={{ boxShadow: "var(--ring)" }}
        />
        <button
          type="button"
          disabled={!comment.trim() || addComment.isPending}
          onClick={() =>
            addComment.mutate({
              planId: plan.id,
              sessionId: session.id,
              body: comment.trim(),
            })
          }
          className="mt-2 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white"
          style={{
            background: "var(--slate)",
            opacity: comment.trim() && !addComment.isPending ? 1 : 0.5,
            cursor:
              comment.trim() && !addComment.isPending ? "pointer" : "not-allowed",
          }}
        >
          Add comment
        </button>
        {session.commentCount > 0 && (
          <p className="text-faint mt-2 mb-0 text-[11.5px]">
            {session.commentCount} comment
            {session.commentCount === 1 ? "" : "s"} on this session — see the
            Review tab.
          </p>
        )}
      </div>
    </Card>
  );
}
