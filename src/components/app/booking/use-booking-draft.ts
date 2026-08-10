"use client";

import { useState } from "react";

import { useDebounced } from "~/components/ui/entity-picker";
import { api, type RouterOutputs } from "~/trpc/react";

/**
 * Everything a booking form does apart from laying itself out: who it is for,
 * whether the slot clashes, and writing it.
 *
 * Two screens compose it — the Book page's side panel and the drawer the
 * timetable drags open — and they must agree on the rules, so the class/faculty
 * narrowing and the preflight live here rather than in either of them.
 */

export type BookingKind = "BOOKING" | "CLASS";

export interface BookingDraftOptions {
  /** Booking for yourself: no class or faculty to attach. */
  isSelfServe: boolean;
  roomId: string;
  start: Date | null;
  end: Date | null;
  onCreated?: (
    result: RouterOutputs["events"]["create"],
  ) => void | Promise<void>;
}

export function useBookingDraft({
  isSelfServe,
  roomId,
  start,
  end,
  onCreated,
}: BookingDraftOptions) {
  const [kind, setKind] = useState<BookingKind>("BOOKING");
  const [title, setTitle] = useState(
    isSelfServe ? "Group study" : "Extra class",
  );
  const [groupId, setGroupId] = useState("");
  const [facultyId, setFacultyId] = useState("");

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
      includeIds: groupId ? [groupId] : undefined,
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

  // Picking a class narrows the teacher list to whoever teaches it; with no
  // class chosen, any faculty member can be searched for.
  const groupFaculty = group?.faculty ?? [];
  const facultyOptions: Array<{ id: string; name: string }> =
    groupFaculty.length ? groupFaculty : (facultyPage.data?.rows ?? []);
  const effectiveFacultyId =
    facultyId && facultyOptions.some((f) => f.id === facultyId)
      ? facultyId
      : facultyOptions.length === 1
        ? facultyOptions[0]!.id
        : "";
  const selectedFaculty = facultyOptions.find(
    (f) => f.id === effectiveFacultyId,
  );

  // Live preflight across all three dimensions: the room, the teacher, and the
  // class. The server re-checks on write, so this is purely to tell the user
  // before they commit.
  const { data: conflicts, isFetching: isChecking } =
    api.events.checkConflicts.useQuery(
      {
        roomId,
        groupId: groupId || undefined,
        facultyId: effectiveFacultyId || undefined,
        startTime: start!,
        endTime: end!,
      },
      { enabled: Boolean(roomId && start && end) },
    );

  const create = api.events.create.useMutation({
    onSuccess: async (result) => {
      await onCreated?.(result);
    },
  });

  const hardConflicts = (conflicts ?? []).filter((c) => c.severity === "hard");
  const canBook =
    Boolean(roomId && start && end) &&
    hardConflicts.length === 0 &&
    !create.isPending;

  const book = () => {
    if (!start || !end || !roomId) return;
    create.mutate({
      kind: isSelfServe ? "BOOKING" : kind,
      title: title.trim() || "Booking",
      roomId,
      groupId: groupId || undefined,
      facultyId: effectiveFacultyId || undefined,
      startTime: start,
      endTime: end,
    });
  };

  return {
    kind,
    setKind,
    title,
    setTitle,
    /** The class this is for, if one has been picked. */
    group,
    setGroupId: (id: string | null) => {
      setGroupId(id ?? "");
      // The teacher list depends on the class, so a stale choice would
      // silently check the wrong person.
      setFacultyId("");
    },
    groupId,
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
    conflicts: conflicts ?? [],
    hardConflicts,
    isChecking,
    create,
    canBook,
    book,
  };
}

export type BookingDraft = ReturnType<typeof useBookingDraft>;
