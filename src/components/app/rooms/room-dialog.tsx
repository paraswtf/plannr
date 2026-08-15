"use client";

import { useEffect, useRef, useState } from "react";

import {
  FEATURE_LABELS,
  ROOM_FEATURES,
  type RoomFeatureName,
} from "~/components/app/booking/room-fit";
import { Dialog } from "~/components/ui/dialog";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { api } from "~/trpc/react";
import { ROOM_TYPES, TYPE_LABEL, type RoomTypeName } from "./room-vocab";

/**
 * Add a room, or change one.
 *
 * Capacity and features are not decoration: the booking screens grey out rooms
 * that are too small for a class or missing the kit it needs, so this form is
 * where that behaviour is actually configured.
 */

export interface EditableRoom {
  id: string;
  code: string;
  buildingId: string;
  floor: number;
  capacity: number;
  type: string;
  features: string[];
  notes: string | null;
}

/** One line of the bulk table. Numbers are held as text while being typed. */
interface BulkRow {
  key: string;
  code: string;
  buildingId: string;
  floor: string;
  capacity: string;
  type: RoomTypeName;
  features: RoomFeatureName[];
}

let rowSeq = 0;

/**
 * A fresh line, carrying over everything but the code from the line above —
 * rooms are added a corridor at a time, and A-202 differs from A-201 in one
 * field.
 */
const blankRow = (from?: BulkRow): BulkRow => ({
  key: `row-${rowSeq++}`,
  code: "",
  buildingId: from?.buildingId ?? "",
  floor: from?.floor ?? "1",
  capacity: from?.capacity ?? "40",
  type: from?.type ?? "LECTURE",
  features: from?.features ? [...from.features] : [],
});

export function RoomDialog({
  room,
  onClose,
  onSaved,
}: {
  /** Omit to add a new room. */
  room?: EditableRoom;
  onClose: () => void;
  onSaved: () => void | Promise<unknown>;
}) {
  const buildings = api.buildings.list.useQuery();

  const [code, setCode] = useState(room?.code ?? "");
  const [buildingId, setBuildingId] = useState(room?.buildingId ?? "");
  const [floor, setFloor] = useState(String(room?.floor ?? 1));
  const [capacity, setCapacity] = useState(String(room?.capacity ?? 40));
  const [type, setType] = useState<RoomTypeName>(
    (room?.type as RoomTypeName) ?? "LECTURE",
  );
  const [features, setFeatures] = useState<RoomFeatureName[]>(
    (room?.features ?? []) as RoomFeatureName[],
  );
  const [notes, setNotes] = useState(room?.notes ?? "");
  const [newBuilding, setNewBuilding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [tab, setTab] = useState<"one" | "bulk">("one");

  // A room needs a building, so one can be added without leaving the form.
  const addBuilding = api.buildings.create.useMutation({
    onSuccess: async (created) => {
      await buildings.refetch();
      setBuildingId(created.id);
      setNewBuilding(null);
    },
    onError: (e) => setError(e.message),
  });

  const done = async () => {
    await onSaved();
    onClose();
  };

  const create = api.rooms.create.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const update = api.rooms.update.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const archive = api.rooms.archive.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });

  const impact = api.rooms.deleteImpact.useQuery(
    { id: room?.id ?? "" },
    { enabled: Boolean(room && confirmArchive) },
  );

  const floorNumber = Number(floor);
  const capacityNumber = Number(capacity);
  const valid =
    code.trim().length > 0 &&
    buildingId.length > 0 &&
    Number.isInteger(floorNumber) &&
    Number.isInteger(capacityNumber) &&
    capacityNumber > 0;
  const saving = create.isPending || update.isPending;

  const save = () => {
    setError(null);
    const input = {
      code: code.trim(),
      buildingId,
      floor: floorNumber,
      capacity: capacityNumber,
      type,
      features,
      notes: notes.trim() || undefined,
    };
    if (room) update.mutate({ id: room.id, ...input });
    else create.mutate(input);
  };

  // --- bulk ---------------------------------------------------------------
  const createMany = api.rooms.createMany.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });

  const [rows, setRows] = useState<BulkRow[]>([blankRow()]);
  const filled = rows.filter((r) => r.code.trim().length > 0);
  const bulkValid =
    filled.length > 0 &&
    filled.every(
      (r) =>
        r.buildingId &&
        Number.isInteger(Number(r.floor)) &&
        Number(r.capacity) > 0,
    );

  const saveBulk = () => {
    setError(null);
    createMany.mutate({
      rooms: filled.map((r) => ({
        code: r.code.trim(),
        buildingId: r.buildingId,
        floor: Number(r.floor),
        capacity: Number(r.capacity),
        type: r.type,
        features: r.features,
      })),
    });
  };

  const bulk = !room && tab === "bulk";

  return (
    <Dialog
      open
      icon="door"
      title={room ? `Edit ${room.code}` : "Add rooms"}
      width={bulk ? 940 : 560}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="text-muted cursor-pointer rounded-lg px-3.5 py-2 text-[13px] font-semibold"
            style={{ boxShadow: "var(--ring)" }}
          >
            Cancel
          </button>
          {bulk ? (
            <button
              type="button"
              disabled={!bulkValid || createMany.isPending}
              onClick={saveBulk}
              className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white"
              style={{
                background: "var(--grad-brand)",
                opacity: bulkValid && !createMany.isPending ? 1 : 0.5,
                cursor:
                  bulkValid && !createMany.isPending
                    ? "pointer"
                    : "not-allowed",
              }}
            >
              {createMany.isPending
                ? "Adding…"
                : `Add ${filled.length || ""} room${filled.length === 1 ? "" : "s"}`.replace(
                    "  ",
                    " ",
                  )}
            </button>
          ) : (
            <button
              type="button"
              disabled={!valid || saving}
              onClick={save}
              className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white"
              style={{
                background: "var(--grad-brand)",
                opacity: valid && !saving ? 1 : 0.5,
                cursor: valid && !saving ? "pointer" : "not-allowed",
              }}
            >
              {saving ? "Saving…" : room ? "Save changes" : "Add room"}
            </button>
          )}
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

        {!room && (
          <Segmented
            items={[
              { value: "one" as const, label: "One room" },
              { value: "bulk" as const, label: "Several at once" },
            ]}
            value={tab}
            onChange={setTab}
            size="sm"
          />
        )}

        {bulk ? (
          <BulkTable
            rows={rows}
            setRows={setRows}
            buildings={(buildings.data ?? []).map((b) => ({
              id: b.id,
              name: b.name,
            }))}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. A-101"
                  className="bg-surface w-full rounded-[10px] px-3 py-2 text-[13.5px] outline-none"
                  style={{ boxShadow: "var(--ring)" }}
                />
              </Field>

              <Field label="Building">
                {newBuilding === null ? (
                  <div className="flex items-center gap-2">
                    <Select
                      ariaLabel="Building"
                      className="min-w-0 flex-1"
                      value={buildingId}
                      placeholder="Pick a building"
                      options={(buildings.data ?? []).map((b) => ({
                        value: b.id,
                        label: b.name,
                        hint: `${b._count.rooms} room${b._count.rooms === 1 ? "" : "s"}`,
                      }))}
                      onChange={setBuildingId}
                    />
                    <button
                      type="button"
                      onClick={() => setNewBuilding("")}
                      aria-label="Add a building"
                      className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[10px]"
                      style={{ background: "rgba(68,88,121,0.07)" }}
                    >
                      <Icon
                        name="plus"
                        size={14}
                        color="var(--slate)"
                        stroke={2.4}
                      />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={newBuilding}
                      onChange={(e) => setNewBuilding(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newBuilding.trim()) {
                          e.preventDefault();
                          addBuilding.mutate({ name: newBuilding.trim() });
                        } else if (e.key === "Escape") {
                          setNewBuilding(null);
                        }
                      }}
                      placeholder="New building name"
                      className="bg-surface min-w-0 flex-1 rounded-[10px] px-3 py-2 text-[13.5px] outline-none"
                      style={{ boxShadow: "var(--ring)" }}
                    />
                    <button
                      type="button"
                      disabled={!newBuilding.trim() || addBuilding.isPending}
                      onClick={() =>
                        addBuilding.mutate({ name: newBuilding.trim() })
                      }
                      className="shrink-0 cursor-pointer rounded-[10px] px-3 py-2 text-[12.5px] font-semibold text-white"
                      style={{
                        background: "var(--slate)",
                        opacity: newBuilding.trim() ? 1 : 0.5,
                      }}
                    >
                      Add
                    </button>
                  </div>
                )}
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Floor" hint="0 is ground">
                <input
                  value={floor}
                  inputMode="numeric"
                  onChange={(e) => setFloor(e.target.value)}
                  className="bg-surface w-full rounded-[10px] px-3 py-2 font-mono text-[13.5px] outline-none"
                  style={{ boxShadow: "var(--ring)" }}
                />
              </Field>
              <Field label="Seats">
                <input
                  value={capacity}
                  inputMode="numeric"
                  onChange={(e) => setCapacity(e.target.value)}
                  className="bg-surface w-full rounded-[10px] px-3 py-2 font-mono text-[13.5px] outline-none"
                  style={{ boxShadow: "var(--ring)" }}
                />
              </Field>
              <Field label="Type">
                <Select
                  ariaLabel="Room type"
                  value={type}
                  options={ROOM_TYPES.map((t) => ({
                    value: t,
                    label: TYPE_LABEL[t],
                  }))}
                  onChange={setType}
                />
              </Field>
            </div>

            <Field
              label="Features"
              hint="Bookings can require these; rooms without them are ruled out."
            >
              <div className="flex flex-wrap gap-1.5">
                {ROOM_FEATURES.map((feature) => {
                  const on = features.includes(feature);
                  return (
                    <button
                      key={feature}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setFeatures((current) =>
                          current.includes(feature)
                            ? current.filter((f) => f !== feature)
                            : [...current, feature],
                        )
                      }
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
                })}
              </div>
            </Field>

            <Field label="Notes" hint="Anything a booker should know.">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="bg-surface w-full resize-none rounded-[10px] px-3 py-2 text-[13.5px] outline-none"
                style={{ boxShadow: "var(--ring)" }}
              />
            </Field>

            {room && (
              <div
                className="mt-1 rounded-xl p-3"
                style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}
              >
                {!confirmArchive ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted text-[12.5px]">
                      Taking this room out of service hides it from booking; its
                      past timetable stays readable.
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmArchive(true)}
                      className="shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-[#b02636]"
                      style={{
                        boxShadow: "inset 0 0 0 1px rgba(220,56,72,0.3)",
                      }}
                    >
                      Archive
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-ink text-[12.5px]">
                      {impact.data
                        ? `${room.code} has ${impact.data.eventCount} event(s), ${impact.data.upcomingCount} still to come. Archive it?`
                        : "Checking what is scheduled here…"}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmArchive(false)}
                        className="text-muted cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        disabled={archive.isPending}
                        onClick={() => archive.mutate({ id: room.id })}
                        className="cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white"
                        style={{ background: "var(--red)" }}
                      >
                        {archive.isPending ? "Archiving…" : "Archive"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

/**
 * A spreadsheet of rooms to add. Every column of the single form is here except
 * the notes, which is the one field nobody fills in a hurry.
 */
function BulkTable({
  rows,
  setRows,
  buildings,
}: {
  rows: BulkRow[];
  setRows: React.Dispatch<React.SetStateAction<BulkRow[]>>;
  buildings: Array<{ id: string; name: string }>;
}) {
  const patch = (key: string, change: Partial<BulkRow>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );

  const columns =
    "grid-cols-[minmax(96px,1fr)_minmax(130px,1.4fr)_64px_72px_minmax(120px,1.2fr)_minmax(150px,1.5fr)_32px]";

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`grid ${columns} text-faint gap-2 px-1 text-[10.5px] font-bold tracking-wider uppercase`}
      >
        <span>Code</span>
        <span>Building</span>
        <span>Floor</span>
        <span>Seats</span>
        <span>Type</span>
        <span>Features</span>
        <span />
      </div>

      <div className="plr-scroll flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto pr-1">
        {rows.map((row, index) => (
          <div key={row.key} className={`grid ${columns} items-center gap-2`}>
            <input
              value={row.code}
              onChange={(e) => patch(row.key, { code: e.target.value })}
              placeholder={index === 0 ? "A-101" : ""}
              aria-label={`Code, row ${index + 1}`}
              className="bg-surface w-full rounded-[10px] px-2.5 py-1.5 text-[13px] outline-none"
              style={{ boxShadow: "var(--ring)" }}
            />
            <Select
              ariaLabel={`Building, row ${index + 1}`}
              size="sm"
              value={row.buildingId}
              placeholder="Building"
              options={buildings.map((b) => ({ value: b.id, label: b.name }))}
              onChange={(id) => patch(row.key, { buildingId: id })}
            />
            <input
              value={row.floor}
              inputMode="numeric"
              aria-label={`Floor, row ${index + 1}`}
              onChange={(e) => patch(row.key, { floor: e.target.value })}
              className="bg-surface w-full rounded-[10px] px-2 py-1.5 text-center font-mono text-[13px] outline-none"
              style={{ boxShadow: "var(--ring)" }}
            />
            <input
              value={row.capacity}
              inputMode="numeric"
              aria-label={`Seats, row ${index + 1}`}
              onChange={(e) => patch(row.key, { capacity: e.target.value })}
              className="bg-surface w-full rounded-[10px] px-2 py-1.5 text-center font-mono text-[13px] outline-none"
              style={{ boxShadow: "var(--ring)" }}
            />
            <Select
              ariaLabel={`Type, row ${index + 1}`}
              size="sm"
              value={row.type}
              options={ROOM_TYPES.map((t) => ({
                value: t,
                label: TYPE_LABEL[t],
              }))}
              onChange={(t) => patch(row.key, { type: t })}
            />
            <FeaturesCell
              label={`Features, row ${index + 1}`}
              features={row.features}
              onChange={(features) => patch(row.key, { features })}
            />
            <button
              type="button"
              aria-label={`Remove row ${index + 1}`}
              disabled={rows.length === 1}
              onClick={() =>
                setRows((current) => current.filter((r) => r.key !== row.key))
              }
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{
                background: "rgba(68,88,121,0.07)",
                opacity: rows.length === 1 ? 0.35 : 1,
                cursor: rows.length === 1 ? "not-allowed" : "pointer",
              }}
            >
              <Icon name="x" size={12} color="var(--muted)" stroke={2.4} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() =>
            setRows((current) => [...current, blankRow(current.at(-1))])
          }
          className="text-slate inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold"
          style={{ background: "rgba(68,88,121,0.07)" }}
        >
          <Icon name="plus" size={13} color="var(--slate)" stroke={2.4} />
          Add row
        </button>
        <span className="text-faint text-[11.5px]">
          Rows without a code are ignored. New rows copy the one above.
        </span>
      </div>
    </div>
  );
}

/** The features of one bulk row, as a popover so the table stays a table. */
function FeaturesCell({
  label,
  features,
  onChange,
}: {
  label: string;
  features: RoomFeatureName[];
  onChange: (features: RoomFeatureName[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative min-w-0" ref={boxRef}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="bg-surface flex w-full cursor-pointer items-center justify-between gap-1 rounded-[10px] px-2.5 py-1.5 text-left text-[12px]"
        style={{ boxShadow: "var(--ring)" }}
      >
        <span
          className={features.length ? "text-title truncate" : "text-faint"}
        >
          {features.length
            ? features.map((f) => FEATURE_LABELS[f]).join(", ")
            : "None"}
        </span>
        <Icon name="chevronDown" size={12} color="var(--muted)" />
      </button>

      {open && (
        <div
          className="bg-surface absolute z-30 mt-1 flex w-[220px] flex-wrap gap-1.5 rounded-[10px] p-2"
          style={{ boxShadow: "var(--ring), var(--shadow-float)" }}
        >
          {ROOM_FEATURES.map((feature) => {
            const on = features.includes(feature);
            return (
              <button
                key={feature}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange(
                    on
                      ? features.filter((f) => f !== feature)
                      : [...features, feature],
                  )
                }
                className="plr-clip cursor-pointer rounded-full px-2 py-1 text-[11.5px] font-semibold"
                style={
                  on
                    ? { background: "var(--slate)", color: "#fff" }
                    : { color: "var(--muted)", boxShadow: "var(--ring)" }
                }
              >
                {FEATURE_LABELS[feature]}
              </button>
            );
          })}
        </div>
      )}
    </div>
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
    <div className="flex flex-col gap-1.5">
      <span className="text-ink text-[13px] font-semibold">{label}</span>
      {children}
      {hint && <span className="text-faint text-[11.5px]">{hint}</span>}
    </div>
  );
}
