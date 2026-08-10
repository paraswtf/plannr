"use client";

import { Drawer } from "~/components/ui/drawer";
import { Segmented } from "~/components/ui/segmented";
import {
  formatDayLabel,
  formatDuration,
  formatHourLabel,
  localTimeOnDay,
  minutesOfDay,
  SNAP_MINUTES,
} from "~/lib/dates";
import { api } from "~/trpc/react";
import { AttendeeFields } from "./attendee-fields";
import { ConflictBanner } from "./conflict-banner";
import { RoomPicker } from "./room-picker";
import { TimeField } from "./time-field";
import { useBookingDraft } from "./use-booking-draft";

/**
 * The panel a drag on the timetable opens.
 *
 * The span belongs to the caller, not to this component: the grid keeps drawing
 * the block while the drawer is up, so nudging the start here has to move the
 * block there too.
 */

const KINDS = [
  { value: "BOOKING" as const, label: "Booking" },
  { value: "CLASS" as const, label: "Class" },
];

export interface DrawerRoom {
  id: string;
  code: string;
  capacity: number;
  building: { name: string };
}

export interface BookingSpan {
  roomId: string;
  start: Date;
  end: Date;
}

export function BookingDrawer({
  span,
  rooms,
  timeZone,
  dayStartMinutes,
  dayEndMinutes,
  isSelfServe,
  onChange,
  onClose,
  onBooked,
}: {
  span: BookingSpan;
  rooms: DrawerRoom[];
  timeZone: string;
  /** The working window, in minutes from local midnight. */
  dayStartMinutes: number;
  dayEndMinutes: number;
  isSelfServe: boolean;
  onChange: (span: BookingSpan) => void;
  /** Omit on a screen where the panel is permanent. */
  onClose?: () => void;
  onBooked: (message: string) => void | Promise<void>;
}) {
  const { roomId, start, end } = span;
  const room = rooms.find((r) => r.id === roomId);

  const draft = useBookingDraft({
    isSelfServe,
    roomId,
    start,
    end,
    onCreated: async (result) => {
      const when = `${formatHourLabel(start, timeZone)}–${formatHourLabel(end, timeZone)}`;
      await onBooked(
        result.event.status === "PENDING"
          ? `${room?.code ?? "Room"} requested for ${when} — waiting for approval`
          : `${room?.code ?? "Room"} booked for ${when}`,
      );
    },
  });

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

  return (
    <Drawer
      open
      icon="calendar"
      title={isSelfServe ? "Book this slot" : "New session"}
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
          onChange={(id) => onChange({ ...span, roomId: id })}
        />

        <div className="grid grid-cols-2 gap-3">
          <TimeField
            label="Starts"
            value={start}
            timeZone={timeZone}
            onChange={setStartMinutes}
            onStep={(delta) => setStartMinutes(startMinutes + delta)}
            canStepBack={startMinutes - SNAP_MINUTES >= dayStartMinutes}
            canStepForward={endMinutes + SNAP_MINUTES <= dayEndMinutes}
          />
          <TimeField
            label="Ends"
            value={end}
            timeZone={timeZone}
            onChange={setEndMinutes}
            onStep={(delta) => setEndMinutes(endMinutes + delta)}
            canStepBack={endMinutes - SNAP_MINUTES > startMinutes}
            canStepForward={endMinutes + SNAP_MINUTES <= dayEndMinutes}
          />
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

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));
