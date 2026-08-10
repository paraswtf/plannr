"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { PageHeader } from "~/components/app/shell/page-header";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import {
  addDays,
  formatHourLabel,
  localTimeOnDay,
  startOfLocalDay,
} from "~/lib/dates";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { api, type RouterOutputs } from "~/trpc/react";
import { ConflictBanner } from "./conflict-banner";
import { SlotGrid, type BusyInterval } from "./slot-grid";

type GridData = RouterOutputs["timetable"]["grid"];
type Groups = RouterOutputs["groups"]["list"];
type Faculty = RouterOutputs["groups"]["facultyList"];

const DURATIONS = [
  { value: 60, label: "1 hr" },
  { value: 90, label: "1.5 hr" },
  { value: 120, label: "2 hr" },
  { value: 180, label: "3 hr" },
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function BookRoomView({
  initial,
  groups,
  allFaculty,
  permissions,
  preselectedRoomId,
}: {
  initial: GridData;
  groups: Groups;
  allFaculty: Faculty;
  permissions: string;
  preselectedRoomId?: string;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  // Someone who can schedule for others gets the class/faculty fields;
  // everyone else is booking for themselves.
  const bits = new PermissionBitField(BigInt(permissions));
  const isSelfServe = !bits.has(PermissionFlags.ManageAllEvents);

  const timeZone = initial.timeZone;
  const settings = initial.settings;
  const slotMinutes = settings?.slotMinutes ?? 60;
  const dayStart = settings?.dayStartMinutes ?? 480;
  const dayEnd = settings?.dayEndMinutes ?? 1080;

  const monday = useMemo(() => {
    const today = startOfLocalDay(new Date(), timeZone);
    return addDays(today, -((today.getDay() + 6) % 7), timeZone);
  }, [timeZone]);

  const [day, setDay] = useState(() => startOfLocalDay(new Date(), timeZone));
  const [roomId, setRoomId] = useState(
    () => preselectedRoomId ?? initial.rooms[0]?.id ?? "",
  );
  const [duration, setDuration] = useState(60);
  const [start, setStart] = useState<Date | null>(null);
  const [title, setTitle] = useState(
    isSelfServe ? "Group study" : "Extra class",
  );
  const [groupId, setGroupId] = useState<string>("");
  const [facultyId, setFacultyId] = useState<string>("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const group = groups.find((g) => g.id === groupId);
  // Picking a class narrows the teacher list to whoever actually teaches it,
  // and a group with a single teacher fills itself in.
  const facultyOptions = group?.faculty.length ? group.faculty : allFaculty;
  const effectiveFacultyId =
    facultyId && facultyOptions.some((f) => f.id === facultyId)
      ? facultyId
      : facultyOptions.length === 1
        ? facultyOptions[0]!.id
        : "";

  const { data: grid } = api.timetable.grid.useQuery(
    { date: day },
    {
      initialData:
        day.getTime() === startOfLocalDay(new Date(), timeZone).getTime()
          ? initial
          : undefined,
    },
  );

  const rooms = grid?.rooms ?? initial.rooms;
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];

  const busy: BusyInterval[] = (grid?.occurrences ?? [])
    .filter((o) => o.roomId === roomId)
    .map((o) => ({ start: o.start, end: o.end, title: o.title }));

  const end = start ? new Date(start.getTime() + duration * 60_000) : null;

  // Live preflight across all three dimensions: the room, the teacher, and the
  // class. The server re-checks on write, so this is purely to tell the user
  // before they commit.
  const { data: conflicts, isFetching } = api.events.checkConflicts.useQuery(
    {
      roomId,
      groupId: groupId || undefined,
      facultyId: effectiveFacultyId || undefined,
      startTime: start!,
      endTime: end!,
    },
    { enabled: Boolean(roomId && start && end) },
  );

  const nextFree = api.rooms.nextFreeSlot.useQuery(
    {
      roomId,
      after: start ?? localTimeOnDay(day, dayStart, timeZone),
      durationMinutes: duration,
    },
    { enabled: false },
  );

  const create = api.events.create.useMutation({
    onSuccess: async () => {
      await utils.timetable.invalidate();
      setSubmitted(
        `${room?.code} booked for ${formatHourLabel(start!, timeZone)}`,
      );
      setStart(null);
      router.refresh();
    },
  });

  const hardConflicts = (conflicts ?? []).filter((c) => c.severity === "hard");
  const canBook = Boolean(start && end && roomId) && hardConflicts.length === 0;

  const weekDays = DAY_LABELS.map((label, i) => ({
    value: addDays(monday, i, timeZone).toISOString(),
    label,
  }));

  return (
    <>
      <PageHeader
        title="Book a room"
        subtitle="Find a free space, avoid the clashes"
      />
      <div className="px-9 pt-2 pb-10">
        {submitted && (
          <div
            className="mb-5 flex items-center gap-2.5 rounded-xl p-3.5"
            style={{
              background: "rgba(78,125,58,0.08)",
              boxShadow: "inset 0 0 0 1px rgba(78,125,58,0.3)",
            }}
          >
            <Icon name="checkCircle" size={18} color="#4e7d3a" stroke={2} />
            <span className="text-[13.5px] font-semibold text-[#3f6a2e]">
              {submitted}
            </span>
          </div>
        )}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <div className="text-faint mb-3 font-mono text-[12px]">
              {rooms.length} rooms · pick one
            </div>
            <div className="grid [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))] gap-3.5">
              {rooms.map((r) => {
                const selected = r.id === roomId;
                const load = (grid?.occurrences ?? []).filter(
                  (o) => o.roomId === r.id,
                ).length;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRoomId(r.id)}
                    className="plr-clip bg-surface flex w-full cursor-pointer flex-col gap-2.5 rounded-[var(--radius-card)] p-4 text-left"
                    style={{
                      boxShadow: selected
                        ? "inset 0 0 0 2px var(--slate), 0 10px 26px rgba(68,88,121,0.18)"
                        : "var(--ring)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display text-title text-[17px] font-bold">
                          {r.code}
                        </div>
                        <div className="text-muted mt-0.5 text-[12px]">
                          {r.building.name}
                        </div>
                      </div>
                      {selected && (
                        <Icon
                          name="checkCircle"
                          size={17}
                          color="var(--slate)"
                          stroke={2}
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="slate">{r.type.toLowerCase()}</Badge>
                      <span className="text-muted inline-flex items-center gap-1 text-[12px]">
                        <Icon name="users" size={12} color="var(--muted)" />
                        {r.capacity}
                      </span>
                      <span className="text-faint ml-auto font-mono text-[11px]">
                        {load} booked
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <Card pad={22} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl"
                style={{
                  background: "color-mix(in srgb, var(--slate) 14%, #fff)",
                }}
              >
                <Icon name="door" size={21} color="var(--slate)" stroke={1.9} />
              </span>
              <div className="min-w-0">
                <div className="font-display text-title text-[19px] font-bold">
                  {room?.code ?? "Pick a room"}
                </div>
                <div className="text-muted text-[12.5px]">
                  {room ? `${room.building.name} · seats ${room.capacity}` : ""}
                </div>
              </div>
            </div>

            {!isSelfServe && (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-ink text-[13px] font-semibold">
                    Class / group
                  </span>
                  <select
                    value={groupId}
                    onChange={(e) => {
                      setGroupId(e.target.value);
                      // The teacher list depends on the class, so a stale
                      // choice would silently check the wrong person.
                      setFacultyId("");
                    }}
                    className="bg-surface rounded-[10px] px-3 py-2 text-[13px]"
                    style={{ boxShadow: "var(--ring)" }}
                  >
                    <option value="">No group</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label} · {g.studentCount}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-ink text-[13px] font-semibold">
                    Faculty
                  </span>
                  <select
                    value={effectiveFacultyId}
                    onChange={(e) => setFacultyId(e.target.value)}
                    className="bg-surface rounded-[10px] px-3 py-2 text-[13px]"
                    style={{ boxShadow: "var(--ring)" }}
                  >
                    <option value="">No faculty</option>
                    {facultyOptions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div>
              <div className="text-ink mb-2 text-[13px] font-semibold">Day</div>
              <Segmented
                items={weekDays}
                value={day.toISOString()}
                onChange={(v) => {
                  setDay(new Date(v));
                  setStart(null);
                }}
                size="sm"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-ink text-[13px] font-semibold">
                  Start time
                </span>
                <Segmented
                  items={DURATIONS}
                  value={duration}
                  onChange={setDuration}
                  size="sm"
                />
              </div>
              <SlotGrid
                day={day}
                timeZone={timeZone}
                startMinutes={dayStart}
                endMinutes={dayEnd}
                slotMinutes={slotMinutes}
                durationMinutes={duration}
                busy={busy}
                value={start}
                onChange={setStart}
              />
            </div>

            {start && end && (
              <ConflictBanner
                conflicts={conflicts ?? []}
                checking={isFetching}
                onUseNextFree={
                  hardConflicts.length > 0
                    ? async () => {
                        const result = await nextFree.refetch();
                        if (result.data) setStart(result.data.start);
                      }
                    : undefined
                }
              />
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-ink text-[13px] font-semibold">
                {isSelfServe ? "Purpose" : "Session title"}
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-surface rounded-[10px] px-3 py-2 text-[13.5px] outline-none"
                style={{ boxShadow: "var(--ring)" }}
              />
            </label>

            <button
              type="button"
              disabled={!canBook || create.isPending}
              onClick={() =>
                start &&
                end &&
                create.mutate({
                  kind: "BOOKING",
                  title: title.trim() || "Booking",
                  roomId,
                  groupId: groupId || undefined,
                  facultyId: effectiveFacultyId || undefined,
                  startTime: start,
                  endTime: end,
                })
              }
              className="rounded-[var(--radius-btn)] px-5 py-3 text-[14.5px] font-semibold text-white"
              style={{
                background: "var(--grad-brand)",
                opacity: canBook && !create.isPending ? 1 : 0.5,
                cursor:
                  canBook && !create.isPending ? "pointer" : "not-allowed",
              }}
            >
              {create.isPending
                ? "Booking…"
                : !start
                  ? "Pick a start time"
                  : hardConflicts.length > 0
                    ? "Resolve the conflict to book"
                    : `Book ${room?.code} · ${formatHourLabel(start, timeZone)}`}
            </button>

            {create.error && (
              <div className="text-[12.5px] font-medium text-[#b02636]">
                {create.error.message}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
