"use client";

import { useState } from "react";

import {
  FEATURE_LABELS,
  ROOM_FEATURES,
  type RoomFeatureName,
} from "~/components/app/booking/room-fit";
import { Dialog } from "~/components/ui/dialog";
import {
  EntityPicker,
  SearchSelect,
  useDebounced,
  initialsOf,
} from "~/components/ui/entity-picker";
import { Icon } from "~/components/ui/icon";
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
          <button
            type="button"
            onClick={onClose}
            className="text-muted flex min-h-10 cursor-pointer items-center rounded-lg px-3.5 text-[13px] font-semibold lg:min-h-0 lg:py-2"
            style={{ boxShadow: "var(--ring)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready || pending}
            onClick={submit}
            className="flex min-h-10 items-center rounded-lg px-3.5 text-[13px] font-semibold text-white lg:min-h-0 lg:py-2"
            style={{
              background: "var(--grad-brand)",
              opacity: ready && !pending ? 1 : 0.5,
              cursor: ready && !pending ? "pointer" : "not-allowed",
            }}
          >
            {pending ? "Saving…" : requirement ? "Save changes" : "Add subject"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
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

        <Field label="Group">
          <SearchSelect
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
            page={
              groups.data && {
                ...groups.data,
                rows: groups.data.rows.map((g) => ({
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
              }
            }
            loading={groups.isLoading}
            query={groupQuery}
            onQueryChange={setGroupQuery}
            onLoadMore={() => setGroupPageSize((n) => n + 20)}
            placeholder="Search groups…"
            listId="requirement-group"
          />
        </Field>

        <Field label="Subject">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Data Structures"
            className="bg-surface w-full rounded-[10px] px-3 py-2 text-[13.5px] outline-none"
            style={{ boxShadow: "var(--ring)" }}
          />
        </Field>

        {/* Two short answers, kept side by side even on a phone — a count and a
            length are read together. */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lectures a week">
            <input
              value={sessions}
              onChange={(e) =>
                setSessions(e.target.value.replace(/[^\d]/g, "").slice(0, 2))
              }
              inputMode="numeric"
              className="bg-surface w-full rounded-[10px] px-3 py-2 font-mono text-[13.5px] outline-none"
              style={{ boxShadow: "var(--ring)" }}
            />
          </Field>
          <Field label="How long each">
            <Select
              ariaLabel="Session length"
              value={duration}
              options={durationOptions}
              onChange={setDuration}
            />
          </Field>
        </div>

        <Field
          label="Taught by"
          hint="Everyone named has to be free at the time chosen."
        >
          <EntityPicker
            selected={(faculty.data?.rows ?? [])
              .filter((f) => facultyIds.includes(f.id))
              .map((f) => ({ id: f.id, label: f.name }))}
            onChange={setFacultyIds}
            page={
              faculty.data && {
                ...faculty.data,
                rows: faculty.data.rows.map((f) => ({
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
              }
            }
            loading={faculty.isLoading}
            query={facultyQuery}
            onQueryChange={setFacultyQuery}
            onLoadMore={() => setFacultyPageSize((n) => n + 20)}
            placeholder="Search staff…"
            emptyLabel="Anyone can teach it"
            listId="requirement-faculty"
          />
        </Field>

        <Field
          label="The room must have"
          hint="Rooms without these are never offered for this subject."
        >
          <div className="flex flex-wrap gap-1.5">
            {ROOM_FEATURES.map((feature) => {
              const on = features.includes(feature);
              return (
                <button
                  key={feature}
                  type="button"
                  onClick={() =>
                    setFeatures((current) =>
                      on
                        ? current.filter((f) => f !== feature)
                        : [...current, feature],
                    )
                  }
                  className="plr-clip flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold lg:min-h-0 lg:py-1.5"
                  style={
                    on
                      ? { background: "var(--slate)", color: "#fff" }
                      : { boxShadow: "var(--ring)", color: "var(--muted)" }
                  }
                >
                  {on && (
                    <Icon name="check" size={11} color="#fff" stroke={3} />
                  )}
                  {FEATURE_LABELS[feature]}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Unlike the pair above, "Lecture theatre" in half a phone's width is
            an ellipsis, so this pair stacks. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Kind of room">
            <Select
              ariaLabel="Room type"
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
          </Field>
          <Field
            label="Seats needed"
            hint="Left blank, the group's own size is used."
          >
            <input
              value={minCapacity}
              onChange={(e) =>
                setMinCapacity(e.target.value.replace(/[^\d]/g, "").slice(0, 4))
              }
              inputMode="numeric"
              placeholder="—"
              className="bg-surface w-full rounded-[10px] px-3 py-2 font-mono text-[13.5px] outline-none"
              style={{ boxShadow: "var(--ring)" }}
            />
          </Field>
        </div>

        <Field
          label="Preferred room"
          hint="Tried first; the builder falls back to anything that fits."
        >
          <SearchSelect
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
        </Field>

        <Field label="Notes">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the reviewers should know"
            className="bg-surface w-full rounded-[10px] px-3 py-2 text-[13.5px] outline-none"
            style={{ boxShadow: "var(--ring)" }}
          />
        </Field>
      </div>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-ink text-[13px] font-semibold">{label}</span>
      {children}
      {hint && <span className="text-faint text-[11.5px]">{hint}</span>}
    </label>
  );
}
