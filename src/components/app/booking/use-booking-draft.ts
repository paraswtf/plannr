"use client";

import { useState } from "react";

import { useDebounced } from "~/components/ui/entity-picker";
import { addDays } from "~/lib/dates";
import { buildRRule, expandSeries } from "~/lib/recurrence";
import { api, type RouterOutputs } from "~/trpc/react";
import {
  roomShortfalls,
  type FittableRoom,
  type RoomFeatureName,
  type RoomNeeds,
} from "./room-fit";

/**
 * Everything a booking form does apart from laying itself out: who it is for,
 * what it needs of a room, whether the slot clashes, and writing it.
 *
 * It is held by the screen rather than by the form, because the calendar next to
 * the form reads from it too — the class chosen here is what tells the grid
 * which rooms are too small to bother offering.
 */

export type BookingKind = "BOOKING" | "CLASS";

/** How often it comes back. Same time of day either way — that is the point. */
export type Repeat = "none" | "weekly" | "daily";

/** Whether the series stops on a date or after a number of dates. */
export type RepeatEnd = "until" | "count";

/** Dates a new series runs for unless the end is moved. */
const DEFAULT_WEEKS = 12;

/** Materialised occurrences make an unbounded series impossible; keep it sane. */
const MAX_COUNT = 200;

export interface BookingDraftOptions {
  /** Booking for yourself: no class or faculty to attach. */
  isSelfServe: boolean;
  roomId: string;
  start: Date | null;
  end: Date | null;
  timeZone: string;
  /** The room being booked, for the size and kit check. */
  room?: Pick<FittableRoom, "code" | "capacity" | "features"> | null;
  onCreated?: (
    result: RouterOutputs["events"]["create"],
  ) => void | Promise<void>;
}

export function useBookingDraft({
  isSelfServe,
  roomId,
  start,
  end,
  timeZone,
  room,
  onCreated,
}: BookingDraftOptions) {
  const [kind, setKind] = useState<BookingKind>("BOOKING");
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [endMode, setEndModeState] = useState<RepeatEnd>("until");
  const [untilTime, setUntilTime] = useState<number | null>(null);
  const [count, setCountState] = useState(DEFAULT_WEEKS);
  // Dates of the series the user has chosen to leave out, by timestamp.
  const [skipped, setSkipped] = useState<number[]>([]);
  const [title, setTitle] = useState(
    isSelfServe ? "Group study" : "Extra class",
  );
  const [groupId, setGroupId] = useState("");
  // Groups sharing the same sitting. The primary above is what the read paths
  // denormalise; these ride along so a combined lecture is one event.
  const [extraGroupIds, setExtraGroupIds] = useState<string[]>([]);
  const [facultyId, setFacultyId] = useState("");
  const [features, setFeatures] = useState<RoomFeatureName[]>([]);

  const [groupQuery, setGroupQuery] = useState("");
  const [groupPageSize, setGroupPageSize] = useState(20);
  const [facultyQuery, setFacultyQuery] = useState("");
  const [facultyPageSize, setFacultyPageSize] = useState(20);
  const debouncedGroup = useDebounced(groupQuery);
  const debouncedFaculty = useDebounced(facultyQuery);

  // Both lists are searched a page at a time; the current choice is pinned so
  // narrowing the search cannot make it vanish from the control. Neither runs
  // for a self-serve booking — the fields are hidden, and reading the group
  // directory is a permission that kind of user does not hold.
  const groupsPage = api.groups.list.useQuery(
    {
      query: debouncedGroup || undefined,
      pageSize: groupPageSize,
      includeIds: [groupId, ...extraGroupIds].filter(Boolean),
    },
    { enabled: !isSelfServe },
  );
  const group = groupsPage.data?.rows.find((g) => g.id === groupId);

  const facultyPage = api.groups.facultyList.useQuery(
    {
      query: debouncedFaculty || undefined,
      pageSize: facultyPageSize,
      includeIds: facultyId ? [facultyId] : undefined,
    },
    { enabled: !isSelfServe },
  );

  // Picking a class puts its own teachers first, which is nearly always who is
  // wanted. It does not put anybody out of reach, though: a stand-in has to be
  // findable, so whatever the search turns up counts as a choice too.
  const groupFaculty = group?.faculty ?? [];
  const searchedFaculty = facultyPage.data?.rows ?? [];
  const facultyOptions: Array<{ id: string; name: string }> = [
    ...groupFaculty,
    ...searchedFaculty.filter(
      (person) => !groupFaculty.some((f) => f.id === person.id),
    ),
  ];
  const effectiveFacultyId =
    facultyId && facultyOptions.some((f) => f.id === facultyId)
      ? facultyId
      : facultyOptions.length === 1
        ? facultyOptions[0]!.id
        : "";
  const selectedFaculty = facultyOptions.find(
    (f) => f.id === effectiveFacultyId,
  );

  // Every group in the room. The primary is what the read paths denormalise;
  // a combined lecture carries the rest alongside it.
  const attendingGroups = [groupId, ...extraGroupIds].filter(Boolean);
  const extraGroups = (groupsPage.data?.rows ?? []).filter((g) =>
    extraGroupIds.includes(g.id),
  );

  // A series ends either on a date or after a number of dates — the same thing
  // said two ways, and people arrive with one or the other in mind ("until the
  // end of term" vs "twelve lectures").
  const until =
    untilTime !== null
      ? new Date(untilTime)
      : start
        ? addDays(start, DEFAULT_WEEKS * 7, timeZone)
        : null;

  const freq = repeat === "weekly" ? "WEEKLY" : "DAILY";
  const rrule =
    repeat === "none"
      ? null
      : endMode === "count"
        ? buildRRule({ freq, count, timeZone })
        : until
          ? buildRRule({ freq, until, timeZone })
          : null;

  // Live preflight across all three dimensions: the room, the teacher, and the
  // class. A repeating booking is checked date by date, so a rule that clashes
  // on three Tuesdays out of twelve reports exactly those three. The server
  // re-checks on write, so this is purely to tell the user before they commit.
  const { data: conflicts, isFetching: isChecking } =
    api.events.checkConflicts.useQuery(
      {
        roomId,
        groupId: groupId || undefined,
        groupIds: attendingGroups,
        facultyId: effectiveFacultyId || undefined,
        startTime: start!,
        endTime: end!,
        rrule,
      },
      { enabled: Boolean(roomId && start && end) },
    );

  const create = api.events.create.useMutation({
    onSuccess: async (result) => {
      await onCreated?.(result);
    },
  });

  // What the session needs of a room: seats for whoever is attending, plus any
  // kit that was asked for. A combined lecture needs seats for everyone in the
  // room, so the sizes add up rather than taking the biggest.
  const needs: RoomNeeds = {
    seats:
      (group?.studentCount ?? 0) +
      extraGroups.reduce((total, g) => total + g.studentCount, 0),
    features,
  };
  const shortfalls = room ? roomShortfalls(room, needs) : [];

  // A skipped date is not being booked, so its clash stops counting — that is
  // what makes "skip this one" a resolution rather than a note.
  const isSkipped = (at: Date) => skipped.includes(at.getTime());
  const live = (conflicts ?? []).filter(
    (c) => !c.candidate || !isSkipped(c.candidate.start),
  );
  const hardConflicts = live.filter((c) => c.severity === "hard");

  // Whether the last answer the check settled on was a clash, held through the
  // next check. The query keeps no previous data, so while a nudge is being
  // checked there are no conflicts at all; anything laid out by "is there a
  // clash" (the verdict's own row in the action bar, the toast above it) would
  // otherwise collapse on every nudge and come back when the answer did. Set
  // during render rather than in an effect, so the layout never paints a frame
  // with the stale shape. Skipping a date changes it at once, with no check.
  const settledClash = isChecking ? null : hardConflicts.length > 0;
  const [clashed, setClashed] = useState(false);
  if (settledClash !== null && settledClash !== clashed) {
    setClashed(settledClash);
  }

  // A class is a group being taught; without one there is nothing to attach a
  // register or a group timetable to, and the server refuses it anyway.
  const needsGroup = !isSelfServe && kind === "CLASS" && !groupId;

  const canBook =
    Boolean(roomId && start && end) &&
    hardConflicts.length === 0 &&
    shortfalls.length === 0 &&
    !needsGroup &&
    !create.isPending;

  const book = () => {
    if (!start || !end || !roomId) return;
    create.mutate({
      kind: isSelfServe ? "BOOKING" : kind,
      title: title.trim() || "Booking",
      roomId,
      groupId: groupId || undefined,
      groupIds: attendingGroups,
      facultyId: effectiveFacultyId || undefined,
      startTime: start,
      endTime: end,
      rrule,
      skipDates: skipped.map((time) => new Date(time)),
    });
  };

  /** Drops one date of the other event, leaving the rest of its series alone. */
  const cancelClashingOccurrence = api.events.cancel.useMutation();

  /** Every date the rule produces, which is what both end modes are about. */
  const dates =
    start && end && rrule
      ? expandSeries({
          startTime: start,
          endTime: end,
          timezone: timeZone,
          rrule,
        })
      : [];

  /**
   * Switching how the series ends keeps the series it currently describes:
   * twelve weekly dates become "after 12", and "after 12" becomes the date the
   * twelfth falls on. Changing your mind about the phrasing should not change
   * the booking.
   */
  const setEndMode = (mode: RepeatEnd) => {
    if (mode === endMode) return;
    if (dates.length > 0) {
      if (mode === "count") setCountState(dates.length);
      else setUntilTime(dates[dates.length - 1]!.start.getTime());
    }
    setEndModeState(mode);
  };

  return {
    isSelfServe,
    kind,
    setKind,
    title,
    setTitle,
    /** Kit the session needs; rooms without it are not offered. */
    features,
    toggleFeature: (feature: RoomFeatureName) =>
      setFeatures((current) =>
        current.includes(feature)
          ? current.filter((f) => f !== feature)
          : [...current, feature],
      ),
    needs,
    /** Why the chosen room will not do, if it will not. */
    shortfalls,
    /** The class this is for, if one has been picked. */
    group,
    setGroupId: (id: string | null) => {
      setGroupId(id ?? "");
      // The teacher list depends on the class, so a stale choice would
      // silently check the wrong person.
      setFacultyId("");
      // The "also attending" picker searches the same list: leaving the text
      // behind would offer only groups matching what was typed to find this one.
      setGroupQuery("");
    },
    groupId,
    /** Groups sharing this sitting, beyond the primary one. */
    extraGroupIds,
    setExtraGroupIds,
    extraGroups,
    attendingGroups,
    needsGroup,
    groupsPage,
    groupQuery,
    setGroupQuery,
    loadMoreGroups: () => setGroupPageSize((n) => n + 20),
    /** Faculty as resolved: the sole option is used when there is only one. */
    facultyId: effectiveFacultyId,
    setFacultyId: (id: string | null) => setFacultyId(id ?? ""),
    selectedFaculty,
    groupFaculty,
    facultyPage,
    facultyQuery,
    setFacultyQuery,
    loadMoreFaculty: () => setFacultyPageSize((n) => n + 20),
    /** How often it repeats, and how far. */
    repeat,
    setRepeat,
    /** Whether the end is expressed as a date or as a number of dates. */
    endMode,
    setEndMode,
    until,
    setUntil: (day: Date) => setUntilTime(day.getTime()),
    count,
    setCount: (n: number) =>
      setCountState(Math.min(MAX_COUNT, Math.max(1, Math.round(n)))),
    maxCount: MAX_COUNT,
    rrule,
    /** Every date the rule produces, so the form can say how many there are. */
    dates,
    /** When the series actually finishes, whichever way the end was given. */
    lastDate: dates.length > 0 ? dates[dates.length - 1]!.start : null,
    skipped,
    isSkipped,
    skipDate: (at: Date) =>
      setSkipped((current) =>
        current.includes(at.getTime()) ? current : [...current, at.getTime()],
      ),
    unskipDate: (at: Date) =>
      setSkipped((current) => current.filter((time) => time !== at.getTime())),
    /** Cancels the clashing date of the *other* event, not this one. */
    cancelClashingOccurrence,
    /** Everything reported, including dates being skipped. */
    allConflicts: conflicts ?? [],
    conflicts: live,
    hardConflicts,
    /**
     * Whether the slot clashed when the check last settled: steady while the
     * next check runs, for layout that should only move when the answer does.
     */
    clashed: settledClash ?? clashed,
    isChecking,
    create,
    canBook,
    book,
  };
}

export type BookingDraft = ReturnType<typeof useBookingDraft>;
