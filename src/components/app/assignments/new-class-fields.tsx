"use client";

import { TimeField } from "~/components/app/booking/time-field";
import { Callout } from "~/components/ui/callout";
import { DatePicker } from "~/components/ui/date-picker";
import { Field } from "~/components/ui/field";
import { Select } from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  addDays,
  DEFAULT_TIMEZONE,
  localTimeOnDay,
  SNAP_MINUTES,
  startOfLocalDay,
} from "~/lib/dates";
import { errorMessage } from "~/lib/error-message";
import { api } from "~/trpc/react";

/** A class to schedule for a test, as the fields hold it. */
export interface NewClassDraft {
  /** Local midnight of the day, in the institution's time. */
  day: Date;
  /** Minutes from local midnight. */
  startMinutes: number;
  endMinutes: number;
  /** Empty until a room is chosen. */
  roomId: string;
}

/** Tomorrow, 10am to 11am, no room yet. */
export function defaultNewClass(timeZone = DEFAULT_TIMEZONE): NewClassDraft {
  return {
    day: startOfLocalDay(addDays(new Date(), 1, timeZone), timeZone),
    startMinutes: 10 * 60,
    endMinutes: 11 * 60,
    roomId: "",
  };
}

/**
 * The draft as the `sitting` that `assignments.create`, `setSitting` and
 * `setSlot` take, or null while it is not complete (no room, or an end that
 * is not after the start).
 */
export function newClassSitting(
  draft: NewClassDraft,
  timeZone = DEFAULT_TIMEZONE,
): {
  newClass: { roomId: string; startTime: Date; endTime: Date };
} | null {
  if (!draft.roomId || draft.endMinutes <= draft.startMinutes) return null;
  return {
    newClass: {
      roomId: draft.roomId,
      startTime: localTimeOnDay(draft.day, draft.startMinutes, timeZone),
      endTime: localTimeOnDay(draft.day, draft.endMinutes, timeZone),
    },
  };
}

/**
 * The day, start and end times and room of a new class scheduled for a test
 * or a presentation slot. Controlled: `value` is a `NewClassDraft` (start
 * from `defaultNewClass()`), `onChange` hands back the whole next draft, and
 * `newClassSitting(draft)` turns it into what the server takes.
 *
 * Whether the room is free is the server's to say: a clash comes back as a
 * CONFLICT error from the mutation, for the caller to show.
 */
export function NewClassFields({
  value,
  onChange,
  disabled = false,
  timeZone = DEFAULT_TIMEZONE,
}: {
  value: NewClassDraft;
  onChange: (next: NewClassDraft) => void;
  disabled?: boolean;
  timeZone?: string;
}) {
  const rooms = api.rooms.list.useQuery({});
  const set = (patch: Partial<NewClassDraft>) =>
    onChange({ ...value, ...patch });

  const length = value.endMinutes - value.startMinutes;
  const setStart = (minutes: number) =>
    // The class keeps its length when its start moves, as on the booking panel.
    set({
      startMinutes: minutes,
      endMinutes: minutes + (length > 0 ? length : 60),
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Day">
          {(id) => (
            <DatePicker
              id={id}
              value={value.day}
              timeZone={timeZone}
              onChange={(day) => set({ day })}
            />
          )}
        </Field>
        <TimeField
          label="Starts"
          value={localTimeOnDay(value.day, value.startMinutes, timeZone)}
          timeZone={timeZone}
          disabled={disabled}
          onChange={setStart}
          onStep={(delta) => setStart(value.startMinutes + delta)}
          canStepBack={value.startMinutes - SNAP_MINUTES >= 0}
          canStepForward={value.endMinutes + SNAP_MINUTES <= 24 * 60}
        />
        <TimeField
          label="Ends"
          value={localTimeOnDay(value.day, value.endMinutes, timeZone)}
          timeZone={timeZone}
          disabled={disabled}
          minMinutes={SNAP_MINUTES}
          onChange={(endMinutes) => set({ endMinutes })}
          onStep={(delta) => set({ endMinutes: value.endMinutes + delta })}
          canStepBack={value.endMinutes - SNAP_MINUTES > value.startMinutes}
          canStepForward={value.endMinutes + SNAP_MINUTES <= 24 * 60}
        />
      </div>
      {length <= 0 && (
        <p className="text-bad text-xs font-medium">
          The class has to end after it starts.
        </p>
      )}

      <Field label="Room">
        {(id) =>
          rooms.isLoading ? (
            <div role="status" aria-label="Loading rooms">
              <Skeleton className="h-10 w-full lg:h-9" />
            </div>
          ) : rooms.error ? (
            <Callout tone="bad" title="Could not load the rooms">
              {errorMessage(rooms.error, "")} Close this and try again.
            </Callout>
          ) : (rooms.data?.rows.length ?? 0) === 0 ? (
            <Callout tone="info">
              There are no rooms on the system yet, so a class cannot be
              scheduled. Pick one of the group&apos;s own classes instead.
            </Callout>
          ) : (
            <Select
              id={id}
              value={value.roomId}
              placeholder="Choose a room"
              onChange={(roomId) => set({ roomId })}
              options={(rooms.data?.rows ?? []).map((r) => ({
                value: r.id,
                label: r.code,
                hint: `${r.capacity} seats · ${r.building.name}`,
              }))}
            />
          )
        }
      </Field>
    </div>
  );
}
