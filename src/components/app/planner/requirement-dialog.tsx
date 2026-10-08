"use client";

import { useState } from "react";

import {
  FEATURE_LABELS,
  ROOM_FEATURES,
  type RoomFeatureName,
} from "~/components/app/booking/room-fit";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Dialog } from "~/components/ui/dialog";
import {
  EntityPicker,
  pickerPage,
  SearchSelect,
  useDebounced,
  initialsOf,
} from "~/components/ui/entity-picker";
import { Field, Input } from "~/components/ui/field";
import { ToggleChip } from "~/components/ui/chip";
import { Select } from "~/components/ui/select";
import { formatDuration } from "~/lib/dates";
import {
  ROOM_TYPES,
  ROOM_TYPE_LABEL,
  type RoomTypeName,
} from "~/lib/schedule-plan";
import { api, type RouterOutputs } from "~/trpc/react";

type Requirement = RouterOutputs["plans"]["byId"]["requirements"][number];

/**
 * One line of demand: who needs what, how often, and what the room has to be.
 *
 * The room requirements are the part worth getting right — "10 sessions with a
 * projector" is a separate line from "20 without", because they are genuinely
 * different demands and the solver has to be able to satisfy one without the
 * other.
 */
export function RequirementDialog({
  planId,
  slotMinutes,
  requirement,
  onClose,
  onSaved,
}: {
  planId: string;
  slotMinutes: number;
  requirement: Requirement | null;
  onClose: () => void;
  onSaved: () => void | Promise<unknown>;
}) {
  const [groupId, setGroupId] = useState(requirement?.groupId ?? "");
  const [subject, setSubject] = useState(requirement?.subject ?? "");
  const [sessions, setSessions] = useState(
    String(requirement?.sessionsPerWeek ?? 1),
  );
  const [duration, setDuration] = useState(
    requirement?.durationMinutes ?? Math.max(slotMinutes, 60),
  );
  const [facultyIds, setFacultyIds] = useState<string[]>(
    requirement?.facultyIds ?? [],
  );
  const [features, setFeatures] = useState<RoomFeatureName[]>(
    (requirement?.requiredFeatures ?? []) as RoomFeatureName[],
  );
  const [roomType, setRoomType] = useState<string>(requirement?.roomType ?? "");
  const [minCapacity, setMinCapacity] = useState(
    requirement?.minCapacity ? String(requirement.minCapacity) : "",
  );
  const [preferredRoomId, setPreferredRoomId] = useState(
    requirement?.preferredRoomId ?? "",
  );
  const [notes, setNotes] = useState(requirement?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const [groupQuery, setGroupQuery] = useState("");
  const [groupPageSize, setGroupPageSize] = useState(20);
  const groups = api.groups.list.useQuery({
    query: useDebounced(groupQuery) || undefined,
    pageSize: groupPageSize,
    includeIds: groupId ? [groupId] : undefined,
  });
  const selectedGroup = groups.data?.rows.find((g) => g.id === groupId);

  const [facultyQuery, setFacultyQuery] = useState("");
  const [facultyPageSize, setFacultyPageSize] = useState(20);
  const faculty = api.groups.facultyList.useQuery({
    query: useDebounced(facultyQuery) || undefined,
    pageSize: facultyPageSize,
    includeIds: facultyIds.length ? facultyIds : undefined,
  });

  const [roomQuery, setRoomQuery] = useState("");
  const workspace = api.plans.workspace.useQuery();
  const rooms = (workspace.data?.rooms ?? []).filter((room) =>
    roomQuery
      ? room.code.toLowerCase().includes(roomQuery.toLowerCase())
      : true,
  );
  const selectedRoom = workspace.data?.rooms.find(
    (r) => r.id === preferredRoomId,
  );

  const save = api.plans.addRequirement.useMutation({
    onSuccess: async () => {
      await onSaved();
      onClose();
    },
    onError: (e) => setError(e.message),
  });
  const update = api.plans.updateRequirement.useMutation({
    onSuccess: async () => {
      await onSaved();
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  const sessionCount = Number(sessions);
  const ready =
    groupId &&
    subject.trim().length > 0 &&
    Number.isFinite(sessionCount) &&
    sessionCount >= 1;
  const pending = save.isPending || update.isPending;

  // Durations have to sit on the slot grid or every class leaves an unusable
  // stub behind it, so the choices are built from it rather than hard-coded.
  const durationOptions = Array.from({ length: 8 }, (_, i) => {
    const value = slotMinutes * (i + 1);
    return { value, label: formatDuration(value) };
  }).filter((o) => o.value <= 8 * 60);
  if (!durationOptions.some((o) => o.value === duration)) {
    durationOptions.unshift({
      value: duration,
      label: formatDuration(duration),
    });
  }

  const submit = () => {
    setError(null);
    const payload = {
      groupId,
      subject: subject.trim(),
      sessionsPerWeek: sessionCount,
      durationMinutes: duration,
      facultyIds,
      requiredFeatures: features,
      roomType: (roomType || null) as RoomTypeName | null,
      minCapacity: minCapacity ? Number(minCapacity) : null,
      preferredRoomId: preferredRoomId || null,
      notes: notes.trim() || null,
    };
    if (requirement) {
      update.mutate({ id: requirement.id, requirement: payload });
    } else {
      save.mutate({ planId, requirement: payload });
    }
  };

  return (
    <Dialog
      open
      width={620}
      icon="layers"
      title={requirement ? "Edit this subject" : "What does this group need?"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready || pending}
            onClick={submit}
          >
            {pending ? "Saving…" : requirement ? "Save changes" : "Add subject"}
          </Button>
        </>
      }
    >
      {/* Nine answers in four groups, each a run of related fields with a
          hairline between runs: who and what, how much and by whom, the
          room, and a note. One uniform column of nine read as a single list
          in which nothing went with anything. */}
      <div className="flex flex-col gap-5">
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
        )}

        <div className="flex flex-col gap-4">
          <Field label="Group">
            {(id) => (
              <SearchSelect
                id={id}
                value={
                  selectedGroup
                    ? {
                        id: selectedGroup.id,
                        label: selectedGroup.label,
                        card: {
                          label: selectedGroup.label,
                          avatar: {
                            kind: "initials",
                            text: initialsOf(selectedGroup.name),
                          },
                          title: selectedGroup.label,
                          subtitle: selectedGroup.courseName,
                          meta: [`${selectedGroup.studentCount} students`],
                        },
                      }
                    : null
                }
                onChange={(id) => setGroupId(id ?? "")}
                page={pickerPage(groups.data, (rows) =>
                  rows.map((g) => ({
                    id: g.id,
                    label: g.label,
                    card: {
                      label: g.label,
                      avatar: {
                        kind: "initials" as const,
                        text: initialsOf(g.name),
                      },
                      title: g.label,
                      subtitle: `${g.courseCode} · ${g.courseName}`,
                      meta: [`${g.studentCount} students`],
                    },
                  })),
                )}
                loading={groups.isLoading}
                query={groupQuery}
                onQueryChange={setGroupQuery}
                onLoadMore={() => setGroupPageSize((n) => n + 20)}
                placeholder="Search groups…"
                listId="requirement-group"
              />
            )}
          </Field>

          <Field label="Subject">
            {(id) => (
              <Input
                id={id}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Data Structures"
              />
            )}
          </Field>
        </div>

        <div className="flex flex-col gap-4 pt-5 shadow-[inset_0_1px_0_var(--hair-soft)]">
          {/* Two short answers, kept side by side even on a phone — a count and a
              length are read together. */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lectures a week">
              {(id) => (
                <Input
                  id={id}
                  value={sessions}
                  onChange={(e) =>
                    setSessions(
                      e.target.value.replace(/[^\d]/g, "").slice(0, 2),
                    )
                  }
                  inputMode="numeric"
                  className="font-mono tabular-nums"
                />
              )}
            </Field>
            <Field label="How long each">
              {(id) => (
                <Select
                  id={id}
                  value={duration}
                  options={durationOptions}
                  onChange={setDuration}
                />
              )}
            </Field>
          </div>

          <Field
            label="Taught by"
            hint="Everyone named has to be free at the time chosen."
          >
            {(id) => (
              <EntityPicker
                id={id}
                selected={(faculty.data?.rows ?? [])
                  .filter((f) => facultyIds.includes(f.id))
                  .map((f) => ({ id: f.id, label: f.name }))}
                onChange={setFacultyIds}
                page={pickerPage(faculty.data, (rows) =>
                  rows.map((f) => ({
                    id: f.id,
                    label: f.name,
                    card: {
                      label: f.name,
                      avatar: {
                        kind: "initials" as const,
                        text: initialsOf(f.name),
                      },
                      title: f.name,
                      subtitle: f.department ?? f.email,
                      badges: f.isActive
                        ? []
                        : [{ text: "inactive", tone: "red" as const }],
                    },
                  })),
                )}
                loading={faculty.isLoading}
                query={facultyQuery}
                onQueryChange={setFacultyQuery}
                onLoadMore={() => setFacultyPageSize((n) => n + 20)}
                placeholder="Search staff…"
                emptyLabel="Anyone can teach it"
                listId="requirement-faculty"
              />
            )}
          </Field>
        </div>

        <div className="flex flex-col gap-4 pt-5 shadow-[inset_0_1px_0_var(--hair-soft)]">
          <Field
            label="The room must have"
            hint="Rooms without these are never offered for this subject."
          >
            <div className="flex flex-wrap gap-1.5">
              {ROOM_FEATURES.map((feature) => {
                const on = features.includes(feature);
                return (
                  <ToggleChip
                    key={feature}
                    pressed={on}
                    onClick={() =>
                      setFeatures((current) =>
                        on
                          ? current.filter((f) => f !== feature)
                          : [...current, feature],
                      )
                    }
                  >
                    {FEATURE_LABELS[feature]}
                  </ToggleChip>
                );
              })}
            </div>
          </Field>

          {/* Unlike the pair above, "Lecture theatre" in half a phone's width is
              an ellipsis, so this pair stacks. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Kind of room">
              {(id) => (
                <Select
                  id={id}
                  value={roomType}
                  options={[
                    { value: "", label: "Any kind" },
                    ...ROOM_TYPES.map((type) => ({
                      value: type,
                      label: ROOM_TYPE_LABEL[type],
                    })),
                  ]}
                  onChange={setRoomType}
                />
              )}
            </Field>
            <Field
              label="Seats needed"
              hint="Left blank, the group's own size is used."
            >
              {(id) => (
                <Input
                  id={id}
                  value={minCapacity}
                  onChange={(e) =>
                    setMinCapacity(
                      e.target.value.replace(/[^\d]/g, "").slice(0, 4),
                    )
                  }
                  inputMode="numeric"
                  placeholder="Group size"
                  className="placeholder:font-body font-mono tabular-nums"
                />
              )}
            </Field>
          </div>

          <Field
            label="Preferred room"
            hint="Tried first; the builder falls back to anything that fits."
          >
            {(id) => (
              <SearchSelect
                id={id}
                value={
                  selectedRoom
                    ? { id: selectedRoom.id, label: selectedRoom.code }
                    : null
                }
                onChange={(id) => setPreferredRoomId(id ?? "")}
                page={{
                  rows: rooms.slice(0, 30).map((room) => ({
                    id: room.id,
                    label: room.code,
                    card: {
                      label: room.code,
                      avatar: { kind: "icon" as const, name: "door" as const },
                      title: room.code,
                      subtitle: room.building.name,
                      meta: [`${room.capacity} seats`],
                    },
                  })),
                  total: rooms.length,
                  hasMore: rooms.length > 30,
                }}
                loading={workspace.isLoading}
                query={roomQuery}
                onQueryChange={setRoomQuery}
                placeholder="Search rooms…"
                emptyOption="No preference"
                listId="requirement-room"
              />
            )}
          </Field>
        </div>

        <div className="pt-5 shadow-[inset_0_1px_0_var(--hair-soft)]">
          <Field label="Notes" optional>
            {(id) => (
              <Input
                id={id}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the reviewers should know"
              />
            )}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
