"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button, IconButton } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Card } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Field, Textarea } from "~/components/ui/field";
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

  // Wide enough and the detail panel sits beside the grid, so picking a session
  // shows it straight away. Stacked, it is off the bottom of the screen and the
  // tap looks like it did nothing — `nearest` scrolls only when that is true.
  // The scroll glides unless the reader has asked for less motion, in which
  // case it jumps: it is the page moving, not something the reader is moving.
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    detailRef.current?.scrollIntoView({
      behavior: still ? "auto" : "smooth",
      block: "nearest",
    });
  }, [selectedId]);

  return (
    <div className="flex flex-col gap-4">
      {/* The lens on one line, even on a phone: the two pickers share the row
          rather than stacking into a hundred pixels of controls above the
          week. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
          <Select
            ariaLabel="View by"
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
        </div>
        {lens !== "all" && (
          <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
            <Select
              ariaLabel="Filter"
              value={lensValue}
              placeholder="Pick one…"
              options={[{ value: "", label: "All of them" }, ...options]}
              onChange={setLensValue}
            />
          </div>
        )}
        <span className="text-muted w-full text-sm tabular-nums sm:ml-auto sm:w-auto">
          {placed.length} placed
          {unplaced.length > 0 && (
            <>
              {" · "}
              <span className="text-warn font-semibold">
                {unplaced.length} unplaced
              </span>
            </>
          )}
        </span>
      </div>

      {error && (
        <Callout tone="bad" role="alert">
          {error}
        </Callout>
      )}

      {plan.sessions.length === 0 ? (
        <Card pad={0}>
          <EmptyState icon="calendar" title="Nothing laid out yet">
            Add the demand, then hit <b>Generate timetable</b>.
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* What would not fit is the work this tab exists for, so it leads,
              above the week, rather than waiting in the rail under a help
              card. Each row is still one button holding the title, the group
              and the reason, and picking it opens the same panel a block on
              the grid does. */}
          {unplaced.length > 0 && (
            <Callout
              tone="warn"
              title={`${unplaced.length} ${
                unplaced.length === 1 ? "session" : "sessions"
              } could not be placed`}
            >
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                {unplaced.map((session) => {
                  const active = session.id === selectedId;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => setSelectedId(session.id)}
                      aria-current={active ? "true" : undefined}
                      className={`plr-clip bg-surface flex cursor-pointer flex-col justify-start rounded-[8px] px-3 py-2.5 text-left ${
                        active
                          ? "shadow-[inset_0_0_0_1.5px_var(--slate),var(--shadow-card)]"
                          : "shadow-[inset_0_0_0_1px_var(--warn-line)] hover:shadow-[inset_0_0_0_1px_var(--warn-line),var(--shadow-card)]"
                      }`}
                    >
                      <span className="text-title block text-sm font-semibold">
                        {session.title}
                      </span>
                      <span className="text-muted block text-xs">
                        {session.groupLabel} ·{" "}
                        {formatDuration(session.durationMinutes)}
                      </span>
                      {session.reason && (
                        <span className="text-ink mt-1 block text-xs">
                          {session.reason}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Callout>
          )}

          {/* `minmax(0, 1fr)` and `min-w-0` are the whole of the overflow fix.
              A track sized `1fr` (and the single implicit track below `xl`)
              will not shrink below its item's min-content, which here is the
              week's full width, so the page itself scrolled sideways: the
              rail ran past the right edge of a laptop and a phone's page was
              almost twice its width. With the track allowed to shrink, the
              week's own box does the scrolling, as it was always meant to. */}
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex min-w-0 flex-col gap-2">
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
              {/* A week cannot be made to fit a phone, so it is said out loud
                  rather than left as a scrollbar nobody notices. */}
              <p className="text-muted m-0 text-xs sm:hidden">
                Swipe the week sideways to reach the other days. Tapping a class
                opens it underneath.
              </p>
            </div>

            <div ref={detailRef} className="flex min-w-0 flex-col gap-4">
              {selected ? (
                <SessionPanel
                  plan={plan}
                  session={selected}
                  onClose={() => setSelectedId(null)}
                  onChanged={onChanged}
                  onError={setError}
                />
              ) : (
                // A hint, not a panel: nothing in it can be acted on, so it
                // sits flat on the page with a hairline instead of being
                // raised like the session panel that replaces it.
                <div className="rounded-[var(--radius-card)] px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--hair)]">
                  <p className="text-title m-0 text-sm font-semibold">
                    The week
                  </p>
                  <p className="text-muted mt-1 mb-0 text-sm">
                    Pick a session to see it in full, move it, or pin it so
                    regenerating leaves it alone.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                    <Legend label="Proposed session" />
                    <Legend dot label="Pinned by hand" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** The two marks the grid uses, drawn the way the grid draws them. */
function Legend({ label, dot = false }: { label: string; dot?: boolean }) {
  return (
    <span className="text-muted flex items-center gap-2 text-xs">
      <span
        aria-hidden
        className={
          dot
            ? "bg-orange h-[8px] w-[8px] rounded-full"
            : "h-[14px] w-[22px] rounded-[4px] bg-[color-mix(in_srgb,var(--slate)_11%,var(--surface))] shadow-[inset_0_0_0_1px_var(--info-line)]"
        }
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
  const [day, setDay] = useState(
    session.dayOfWeek ?? plan.settings.workingDays[0] ?? 1,
  );
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
          <span className="font-display text-title text-md block font-semibold tracking-[-0.01em]">
            {session.title}
          </span>
          <span className="text-muted block truncate text-sm">
            {session.groupLabel}
          </span>
        </span>
        <IconButton
          icon="x"
          label="Close"
          size="sm"
          iconSize={14}
          onClick={onClose}
          className="-mt-1.5 -mr-1.5"
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <Badge tone={session.dayOfWeek === null ? "red" : "slate"}>
          {formatSessionWhen(
            session.dayOfWeek,
            session.startMinutes,
            session.durationMinutes,
          )}
        </Badge>
        {session.roomCode && <Badge>{session.roomCode}</Badge>}
        {session.pinned && <Badge tone="orange">Pinned</Badge>}
      </div>

      {session.facultyNames.length > 0 && (
        <p className="text-muted mt-0 mb-3 text-sm">
          Taught by {session.facultyNames.join(", ")}
        </p>
      )}

      {session.reason && (
        <p className="text-bad mt-0 mb-3 text-sm">{session.reason}</p>
      )}

      {plan.can.edit && (
        <div className="mb-4 flex flex-col gap-2.5">
          <p className="text-title m-0 text-xs font-semibold">Move to</p>
          {/* Day and time stay paired even on a phone: both are short, and
              they are chosen as one answer to "when". */}
          <div className="grid grid-cols-2 gap-2">
            <Select
              ariaLabel="Day"
              value={day}
              options={ISO_WEEKDAYS.filter((d) =>
                plan.settings.workingDays.includes(d),
              ).map((d) => ({ value: d, label: WEEKDAY_LABEL[d]! }))}
              onChange={setDay}
            />
            <Select
              ariaLabel="Start time"
              value={start}
              options={starts.map((minute) => ({
                value: minute,
                label: formatSlot(minute),
              }))}
              onChange={setStart}
            />
          </div>
          <Select
            ariaLabel="Room"
            value={roomId}
            placeholder="Pick a room…"
            options={rooms.map((room) => ({
              value: room.id,
              label: room.code,
              hint: `${room.capacity} seats · ${room.building.name}`,
            }))}
            onChange={setRoomId}
          />

          {/* Three weights for three stakes. Moving is what the panel is for;
              pinning is a quieter instruction to the next regenerate; taking
              a class off the grid undoes the solver's work, so it is the red
              one and stands apart from the other two. */}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={move.isPending || !roomId}
              onClick={() =>
                move.mutate({
                  id: session.id,
                  dayOfWeek: day,
                  startMinutes: start,
                  roomId,
                })
              }
            >
              {move.isPending ? "Moving…" : "Move here"}
            </Button>
            <Button
              size="sm"
              disabled={pin.isPending}
              onClick={() =>
                pin.mutate({ id: session.id, pinned: !session.pinned })
              }
            >
              {session.pinned ? "Unpin" : "Pin here"}
            </Button>
            {session.dayOfWeek !== null && (
              <Button
                variant="danger-quiet"
                size="sm"
                disabled={clear.isPending}
                onClick={() => clear.mutate({ id: session.id })}
                className="sm:ml-auto xl:ml-0"
              >
                Take off the grid
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-4 shadow-[inset_0_1px_0_var(--hair-soft)]">
        <Field label="Comment on this session">
          {(id) => (
            <Textarea
              id={id}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="e.g. this clashes with the placement drive"
              className="plr-scroll"
            />
          )}
        </Field>
        {/* Held to its own width: in a column a button would otherwise
            stretch across the whole panel. */}
        <Button
          size="sm"
          disabled={!comment.trim() || addComment.isPending}
          onClick={() =>
            addComment.mutate({
              planId: plan.id,
              sessionId: session.id,
              body: comment.trim(),
            })
          }
          className="self-start"
        >
          {addComment.isPending ? "Adding…" : "Add comment"}
        </Button>
        {session.commentCount > 0 && (
          <p className="text-muted m-0 text-xs">
            {session.commentCount} comment
            {session.commentCount === 1 ? "" : "s"} on this session (see the
            Review tab).
          </p>
        )}
      </div>
    </Card>
  );
}
