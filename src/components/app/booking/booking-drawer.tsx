"use client";

import { DatePicker } from "~/components/ui/date-picker";
import { Drawer } from "~/components/ui/drawer";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import {
  formatDayLabel,
  formatDuration,
  localTimeOnDay,
  minutesOfDay,
  SNAP_MINUTES,
} from "~/lib/dates";
import { api } from "~/trpc/react";
import { AttendeeFields } from "./attendee-fields";
import { ConflictBanner } from "./conflict-banner";
import {
  FEATURE_LABELS,
  ROOM_FEATURES,
  type FittableRoom,
  type RoomFeatureName,
} from "./room-fit";
import { RecurringConflicts } from "./recurring-conflicts";
import { RoomPicker } from "./room-picker";
import { TimeField } from "./time-field";
import type { BookingDraft } from "./use-booking-draft";

/**
 * The booking form: permanently docked on the Book screen, opened by a drag on
 * the Timetable.
 *
 * Neither the span nor the draft belongs to it — both are held by the screen, so
 * that the calendar alongside can draw the span being edited and grey out the
 * rooms the draft has ruled out.
 */

const KINDS = [
  { value: "BOOKING" as const, label: "Booking" },
  { value: "CLASS" as const, label: "Class" },
];

const REPEATS = [
  { value: "none" as const, label: "Once" },
  { value: "weekly" as const, label: "Weekly" },
  { value: "daily" as const, label: "Daily" },
];

const ENDS = [
  { value: "until" as const, label: "On date" },
  { value: "count" as const, label: "After" },
];

export interface BookingSpan {
  roomId: string;
  start: Date;
  end: Date;
}

export function BookingDrawer({
  span,
  rooms,
  draft,
  timeZone,
  dayStartMinutes,
  dayEndMinutes,
  canCancelOthers = false,
  onChange,
  onClose,
  onOtherCancelled,
}: {
  span: BookingSpan;
  rooms: FittableRoom[];
  draft: BookingDraft;
  timeZone: string;
  /** The working window, in minutes from local midnight. */
  dayStartMinutes: number;
  dayEndMinutes: number;
  /** Whether this user may cancel other people's events to clear a clash. */
  canCancelOthers?: boolean;
  onChange: (span: BookingSpan) => void;
  /** Omit on a screen where the panel is permanent. */
  onClose?: () => void;
  /** Refetch after a clashing booking has been cancelled. */
  onOtherCancelled: () => void | Promise<unknown>;
}) {
  const { roomId, start, end } = span;
  const room = rooms.find((r) => r.id === roomId);
  const isSelfServe = draft.isSelfServe;

  const nextFree = api.rooms.nextFreeSlot.useQuery(
    {
      roomId,
      after: start,
      durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
    },
    { enabled: false },
  );

  const durationMinutes = Math.round(
    (end.getTime() - start.getTime()) / 60_000,
  );
  const startMinutes = minutesOfDay(start, timeZone);
  const endMinutes = startMinutes + durationMinutes;

  // Both ends stay inside the working window: it is the only stretch of the day
  // the calendars draw, so a booking outside it would be invisible there.
  const setStartMinutes = (minutes: number) => {
    const at = clamp(minutes, dayStartMinutes, dayEndMinutes - durationMinutes);
    const nextStart = localTimeOnDay(start, at, timeZone);
    onChange({
      roomId,
      start: nextStart,
      end: new Date(nextStart.getTime() + durationMinutes * 60_000),
    });
  };

  const setEndMinutes = (minutes: number) => {
    const at = clamp(minutes, startMinutes + 1, dayEndMinutes);
    onChange({ roomId, start, end: localTimeOnDay(start, at, timeZone) });
  };

  // Changing the date carries the times with it, and the screen follows the
  // booking to that day — the calendar shows one day, so leaving it behind
  // would hide the very block being edited.
  const setDay = (day: Date) => {
    const nextStart = localTimeOnDay(day, startMinutes, timeZone);
    onChange({
      roomId,
      start: nextStart,
      end: new Date(nextStart.getTime() + durationMinutes * 60_000),
    });
  };

  return (
    <Drawer
      open
      icon="calendar"
      title={isSelfServe ? "Book a slot" : "New session"}
      subtitle={`${formatDayLabel(start, timeZone)} · ${formatDuration(durationMinutes)}`}
      onClose={onClose}
      footer={
        <>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-muted cursor-pointer rounded-[var(--radius-btn)] px-4 py-2.5 text-[13.5px] font-semibold"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!draft.canBook}
            onClick={draft.book}
            className="rounded-[var(--radius-btn)] px-5 py-2.5 text-[14px] font-semibold text-white"
            style={{
              background: "var(--grad-brand)",
              opacity: draft.canBook ? 1 : 0.5,
              cursor: draft.canBook ? "pointer" : "not-allowed",
            }}
          >
            {draft.create.isPending
              ? "Booking…"
              : draft.shortfalls.length > 0
                ? "Pick a room that fits"
                : draft.hardConflicts.length > 0
                  ? "Resolve the clash"
                  : `Book ${room?.code ?? ""}`.trim()}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <RoomPicker
          rooms={rooms}
          value={roomId}
          needs={draft.needs}
          onChange={(id) => onChange({ ...span, roomId: id })}
        />

        {draft.shortfalls.length > 0 && (
          <div
            className="flex items-start gap-2.5 rounded-xl p-3"
            style={{
              background: "rgba(220,56,72,0.07)",
              boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)",
            }}
          >
            <Icon name="alert" size={17} color="var(--red)" stroke={2} />
            <span className="text-ink text-[12.5px]">
              {room?.code} does not fit this session:{" "}
              {draft.shortfalls.join(", ")}.
            </span>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-ink text-[13px] font-semibold">Date</span>
          <DatePicker value={start} timeZone={timeZone} onChange={setDay} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TimeField
            label="Starts"
            value={start}
            timeZone={timeZone}
            minMinutes={dayStartMinutes}
            maxMinutes={dayEndMinutes}
            onChange={setStartMinutes}
            onStep={(delta) => setStartMinutes(startMinutes + delta)}
            canStepBack={startMinutes - SNAP_MINUTES >= dayStartMinutes}
            canStepForward={endMinutes + SNAP_MINUTES <= dayEndMinutes}
          />
          <TimeField
            label="Ends"
            value={end}
            timeZone={timeZone}
            minMinutes={dayStartMinutes + SNAP_MINUTES}
            maxMinutes={dayEndMinutes + SNAP_MINUTES}
            onChange={setEndMinutes}
            onStep={(delta) => setEndMinutes(endMinutes + delta)}
            canStepBack={endMinutes - SNAP_MINUTES > startMinutes}
            canStepForward={endMinutes + SNAP_MINUTES <= dayEndMinutes}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink text-[13px] font-semibold">Repeats</span>
            <Segmented
              items={REPEATS}
              value={draft.repeat}
              onChange={draft.setRepeat}
              size="sm"
            />
          </div>

          {draft.repeat !== "none" && (
            <div
              className="flex flex-col gap-2 rounded-xl p-2.5"
              style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted text-[12.5px]">Ends</span>
                <Segmented
                  items={ENDS}
                  value={draft.endMode}
                  onChange={draft.setEndMode}
                  size="sm"
                />
              </div>

              {/*
               * Each mode shows what the other would have said, so switching
               * between them is never a guess.
               */}
              {draft.endMode === "until" ? (
                <div className="flex items-center gap-2">
                  {draft.until && (
                    <DatePicker
                      value={draft.until}
                      timeZone={timeZone}
                      size="sm"
                      ariaLabel="Repeat until"
                      onChange={draft.setUntil}
                      className="min-w-0 flex-1"
                    />
                  )}
                  <span className="text-faint shrink-0 font-mono text-[11.5px]">
                    {draft.dates.length} dates
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CountField
                    value={draft.count}
                    max={draft.maxCount}
                    onChange={draft.setCount}
                  />
                  <span className="text-faint shrink-0 font-mono text-[11.5px]">
                    {draft.lastDate
                      ? `to ${formatDayLabel(draft.lastDate, timeZone)}`
                      : "—"}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {!isSelfServe && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink text-[13px] font-semibold">Type</span>
            <Segmented
              items={KINDS}
              value={draft.kind}
              onChange={draft.setKind}
              size="sm"
            />
          </div>
        )}

        {!isSelfServe && (
          <AttendeeFields draft={draft} className="grid gap-3" />
        )}

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-ink text-[13px] font-semibold">
              Requirements
            </span>
            <span className="text-faint font-mono text-[11.5px]">
              {draft.needs.seats > 0
                ? `${draft.needs.seats} seats needed`
                : "any size"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ROOM_FEATURES.map((feature) => (
              <FeatureChip
                key={feature}
                feature={feature}
                on={draft.features.includes(feature)}
                onToggle={() => draft.toggleFeature(feature)}
              />
            ))}
          </div>
          <p className="text-faint mt-2 text-[11.5px]">
            Rooms without these — or too small for the class — are greyed out on
            the calendar.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-[13px] font-semibold">
            {isSelfServe ? "Purpose" : "Session title"}
          </span>
          <input
            value={draft.title}
            onChange={(e) => draft.setTitle(e.target.value)}
            className="bg-surface rounded-[10px] px-3 py-2 text-[13.5px] outline-none"
            style={{ boxShadow: "var(--ring)" }}
          />
        </label>

        <RecurringConflicts
          draft={draft}
          timeZone={timeZone}
          canCancelOthers={canCancelOthers}
          onCancelled={onOtherCancelled}
        />

        <ConflictBanner
          conflicts={draft.conflicts}
          checking={draft.isChecking}
          onUseNextFree={
            draft.hardConflicts.length > 0
              ? async () => {
                  const result = await nextFree.refetch();
                  if (result.data) {
                    onChange({
                      roomId,
                      start: result.data.start,
                      end: new Date(
                        result.data.start.getTime() + durationMinutes * 60_000,
                      ),
                    });
                  }
                }
              : undefined
          }
        />

        {draft.create.error && (
          <div className="text-[12.5px] font-medium text-[#b02636]">
            {draft.create.error.message}
          </div>
        )}
      </div>
    </Drawer>
  );
}

/** How many dates the series runs for: typed, or nudged one at a time. */
function CountField({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div
      className="bg-surface flex min-w-0 flex-1 items-center gap-1 rounded-[10px] px-1.5 py-1"
      style={{ boxShadow: "var(--ring)" }}
    >
      <Nudge
        icon="chevronLeft"
        label="One fewer date"
        onClick={value > 1 ? () => onChange(value - 1) : undefined}
      />
      <input
        value={value}
        inputMode="numeric"
        aria-label="Number of dates"
        onChange={(e) => {
          const next = Number(e.target.value.replace(/\D/g, ""));
          if (Number.isFinite(next) && next > 0) onChange(next);
        }}
        className="text-title min-w-0 flex-1 bg-transparent text-center font-mono text-[13px] font-bold outline-none"
      />
      <span className="text-faint shrink-0 pr-0.5 text-[11.5px]">
        {value === 1 ? "date" : "dates"}
      </span>
      <Nudge
        icon="chevronRight"
        label="One more date"
        onClick={value < max ? () => onChange(value + 1) : undefined}
      />
    </div>
  );
}

function Nudge({
  icon,
  label,
  onClick,
}: {
  icon: "chevronLeft" | "chevronRight";
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
      style={{
        background: "rgba(68,88,121,0.07)",
        opacity: onClick ? 1 : 0.35,
        cursor: onClick ? "pointer" : "not-allowed",
      }}
    >
      <Icon name={icon} size={13} color="var(--slate)" stroke={2.2} />
    </button>
  );
}

/** One piece of kit the session does or does not need. */
function FeatureChip({
  feature,
  on,
  onToggle,
}: {
  feature: RoomFeatureName;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className="plr-clip cursor-pointer rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={
        on
          ? {
              background: "var(--slate)",
              color: "#fff",
              boxShadow: "0 2px 8px rgba(68,88,121,0.28)",
            }
          : { color: "var(--muted)", boxShadow: "var(--ring)" }
      }
    >
      {FEATURE_LABELS[feature]}
    </button>
  );
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));
