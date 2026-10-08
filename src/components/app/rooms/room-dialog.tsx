"use client";

import { useEffect, useRef, useState } from "react";

import {
  FEATURE_LABELS,
  ROOM_FEATURES,
  type RoomFeatureName,
} from "~/components/app/booking/room-fit";
import { Button, IconButton } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { ToggleChip } from "~/components/ui/chip";
import { Dialog } from "~/components/ui/dialog";
import { Field, Input, Textarea, triggerClass } from "~/components/ui/field";
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
          <Button onClick={onClose}>Cancel</Button>
          {bulk ? (
            <Button
              variant="primary"
              disabled={!bulkValid || createMany.isPending}
              onClick={saveBulk}
            >
              {createMany.isPending
                ? "Adding…"
                : `Add ${filled.length || ""} room${filled.length === 1 ? "" : "s"}`.replace(
                    "  ",
                    " ",
                  )}
            </Button>
          ) : (
            <Button
              // While an archive is being confirmed, that decision is the one
              // thing in the dialog wearing a strong colour: Save steps back to
              // secondary so two loud buttons are not competing over a
              // destructive moment. It still saves, exactly as before.
              variant={confirmArchive ? "secondary" : "primary"}
              disabled={!valid || saving}
              onClick={save}
            >
              {saving ? "Saving…" : room ? "Save changes" : "Add room"}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Callout tone="bad" role="alert">
            {error}
          </Callout>
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
            ariaLabel="How many rooms to add"
          />
        )}

        {bulk ? (
          <BulkTable
            rows={rows}
            setRows={setRows}
            buildings={(buildings.data?.rows ?? []).map((b) => ({
              id: b.id,
              name: b.name,
            }))}
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Code">
                {(id) => (
                  // Mono, like the code everywhere else it is written: on
                  // the plates, in the compact rows, in the timetable.
                  <Input
                    id={id}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. A-101"
                    className="font-mono"
                  />
                )}
              </Field>

              <Field label="Building">
                {(id) =>
                  newBuilding === null ? (
                    <div className="flex items-center gap-2">
                      <Select
                        id={id}
                        className="min-w-0 flex-1"
                        value={buildingId}
                        placeholder="Pick a building"
                        options={(buildings.data?.rows ?? []).map((b) => ({
                          value: b.id,
                          label: b.name,
                          hint: `${b._count.rooms} room${b._count.rooms === 1 ? "" : "s"}`,
                        }))}
                        onChange={setBuildingId}
                      />
                      <IconButton
                        icon="plus"
                        label="Add a building"
                        variant="quiet"
                        onClick={() => setNewBuilding("")}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        autoFocus
                        aria-label="New building name"
                        value={newBuilding}
                        onChange={(e) => setNewBuilding(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newBuilding.trim()) {
                            e.preventDefault();
                            addBuilding.mutate({ name: newBuilding.trim() });
                          } else if (e.key === "Escape") {
                            // Escape here means "not a new building after
                            // all", so it is kept from reaching the dialog's
                            // own Escape, which would otherwise close the whole
                            // form and throw away everything typed into it.
                            //
                            // `stopPropagation` alone is not enough for that.
                            // The App Router hydrates onto `document`, so
                            // React's delegated listener and the dialog's
                            // keydown listener sit on the same node, and
                            // stopping propagation only keeps an event from
                            // moving on to *other* nodes. React's listener was
                            // added at hydration, long before the dialog's
                            // effect added its own, so stopping the native
                            // event immediately is what keeps the later one
                            // from running. The synthetic call stays for any
                            // React handler further up the tree.
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();
                            setNewBuilding(null);
                          }
                        }}
                        placeholder="New building name"
                        className="flex-1"
                      />
                      <Button
                        variant="quiet"
                        disabled={!newBuilding.trim() || addBuilding.isPending}
                        onClick={() =>
                          addBuilding.mutate({ name: newBuilding.trim() })
                        }
                      >
                        Add
                      </Button>
                    </div>
                  )
                }
              </Field>
            </div>

            {/* Floor and Seats are two-digit fields; only Type needs a line. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Floor" hint="0 is ground">
                {(id) => (
                  <Input
                    id={id}
                    value={floor}
                    inputMode="numeric"
                    onChange={(e) => setFloor(e.target.value)}
                    className="font-mono"
                  />
                )}
              </Field>
              <Field label="Seats">
                {(id) => (
                  <Input
                    id={id}
                    value={capacity}
                    inputMode="numeric"
                    onChange={(e) => setCapacity(e.target.value)}
                    className="font-mono"
                  />
                )}
              </Field>
              <Field label="Type" className="col-span-2 sm:col-span-1">
                {(id) => (
                  <Select
                    id={id}
                    value={type}
                    options={ROOM_TYPES.map((t) => ({
                      value: t,
                      label: TYPE_LABEL[t],
                    }))}
                    onChange={setType}
                  />
                )}
              </Field>
            </div>

            <Field
              label="Features"
              hint="Bookings can require these; rooms without them are ruled out."
            >
              <div
                role="group"
                aria-label="Features"
                className="flex flex-wrap gap-1.5"
              >
                {ROOM_FEATURES.map((feature) => {
                  const on = features.includes(feature);
                  return (
                    <ToggleChip
                      key={feature}
                      pressed={on}
                      onClick={() =>
                        setFeatures((current) =>
                          current.includes(feature)
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

            <Field label="Notes" hint="Anything a booker should know.">
              {(id) => (
                <Textarea
                  id={id}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  resize="none"
                />
              )}
            </Field>

            {room &&
              (!confirmArchive ? (
                /*
                 * The way towards a destructive step, so it is drawn quietly
                 * (danger-quiet) and set apart from the form by a hairline:
                 * it is not one more field, and it should not shout until it
                 * has been asked for.
                 */
                <div className="mt-1 flex flex-col items-start gap-2.5 rounded-[12px] p-3.5 shadow-[inset_0_0_0_1px_var(--hair)] sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <p className="text-muted text-sm">
                    Taking this room out of service hides it from booking; its
                    past timetable stays readable.
                  </p>
                  <Button
                    variant="danger-quiet"
                    size="sm"
                    onClick={() => setConfirmArchive(true)}
                  >
                    Archive
                  </Button>
                </div>
              ) : (
                /*
                 * The confirming step: a decision, so a warn callout that
                 * names the room, says what is booked into it, and holds the
                 * one red button in the dialog beside the way back.
                 */
                <Callout
                  tone="warn"
                  title={`Archive ${room.code}?`}
                  className="mt-1"
                >
                  <p>
                    {impact.data
                      ? `It has ${plural(impact.data.eventCount, "event")}, ${impact.data.upcomingCount} of them still to come.`
                      : "Checking what is scheduled here…"}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={archive.isPending}
                      onClick={() => archive.mutate({ id: room.id })}
                    >
                      {archive.isPending ? "Archiving…" : "Archive"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmArchive(false)}
                    >
                      Keep
                    </Button>
                  </div>
                </Callout>
              ))}
          </>
        )}
      </div>
    </Dialog>
  );
}

/** "1 event", "38 events": the count said properly rather than as "event(s)". */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

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

  /*
   * Seven columns need 712px before anything can be typed into them, which is
   * more than the dialog has until the widest layout. Under that the same
   * fields are a stack of cards — two fields to a line, each labelled, since
   * the header row that named them is gone. Sideways scrolling was the other
   * option, and a form you have to scroll to fill in is not one.
   */
  const columns =
    "lg:grid-cols-[minmax(96px,1fr)_minmax(130px,1.4fr)_64px_72px_minmax(120px,1.2fr)_minmax(150px,1.5fr)_32px]";

  return (
    <div className="flex flex-col gap-2">
      {/*
       * The rule the rows follow, said above them where it is read before
       * typing rather than after, beside a button it was not about.
       */}
      <p className="text-faint text-xs">
        Rows without a code are ignored. New rows copy the one above.
      </p>

      {/* Sentence case, at the table-head size: no spaced-out capitals. */}
      <div
        className={`hidden ${columns} text-muted text-2xs gap-2 px-1 font-semibold lg:grid`}
      >
        <span>Code</span>
        <span>Building</span>
        <span>Floor</span>
        <span>Seats</span>
        <span>Type</span>
        <span>Features</span>
        <span />
      </div>

      {/* Only the table scrolls on its own; the cards let the dialog do it. */}
      <div className="plr-scroll flex flex-col gap-2.5 lg:max-h-[46vh] lg:gap-1.5 lg:overflow-y-auto lg:pr-1">
        {rows.map((row, index) => {
          const remove = (
            <IconButton
              icon="x"
              label={`Remove row ${index + 1}`}
              size="sm"
              iconSize={13}
              disabled={rows.length === 1}
              onClick={() =>
                setRows((current) => current.filter((r) => r.key !== row.key))
              }
            />
          );
          return (
            <div
              key={row.key}
              className={`grid grid-cols-2 gap-2 rounded-[12px] p-2.5 shadow-[inset_0_0_0_1px_var(--hair)] ${columns} lg:items-center lg:rounded-none lg:p-0 lg:shadow-none`}
            >
              {/*
               * A card's own header on a phone: which room it is, and the
               * button that removes it, on one line. The button used to take
               * a whole grid row of its own under the fields. At `lg` this
               * header goes and the button below becomes the row's last cell.
               */}
              <div className="col-span-2 -mt-1 -mb-0.5 flex items-center justify-between lg:hidden">
                <span className="text-muted text-xs font-semibold">
                  Room {index + 1}
                </span>
                {remove}
              </div>
              <BulkCell label="Code">
                <Input
                  size="sm"
                  value={row.code}
                  onChange={(e) => patch(row.key, { code: e.target.value })}
                  placeholder={index === 0 ? "A-101" : ""}
                  aria-label={`Code, row ${index + 1}`}
                  className="font-mono"
                />
              </BulkCell>
              <BulkCell label="Building">
                <Select
                  ariaLabel={`Building, row ${index + 1}`}
                  size="sm"
                  value={row.buildingId}
                  placeholder="Building"
                  options={buildings.map((b) => ({
                    value: b.id,
                    label: b.name,
                  }))}
                  onChange={(id) => patch(row.key, { buildingId: id })}
                />
              </BulkCell>
              <BulkCell label="Floor">
                <Input
                  size="sm"
                  value={row.floor}
                  inputMode="numeric"
                  aria-label={`Floor, row ${index + 1}`}
                  onChange={(e) => patch(row.key, { floor: e.target.value })}
                  className="text-center font-mono"
                />
              </BulkCell>
              <BulkCell label="Seats">
                <Input
                  size="sm"
                  value={row.capacity}
                  inputMode="numeric"
                  aria-label={`Seats, row ${index + 1}`}
                  onChange={(e) => patch(row.key, { capacity: e.target.value })}
                  className="text-center font-mono"
                />
              </BulkCell>
              <BulkCell label="Type">
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
              </BulkCell>
              <BulkCell label="Features">
                <FeaturesCell
                  label={`Features, row ${index + 1}`}
                  features={row.features}
                  onChange={(features) => patch(row.key, { features })}
                />
              </BulkCell>
              <div className="hidden lg:block">{remove}</div>
            </div>
          );
        })}
      </div>

      <Button
        variant="quiet"
        size="sm"
        icon="plus"
        className="self-start"
        onClick={() =>
          setRows((current) => [...current, blankRow(current.at(-1))])
        }
      >
        Add row
      </Button>
    </div>
  );
}

/**
 * One field of a bulk row. Below the table layout it carries its own label and
 * a box of its own; at `lg` it dissolves and the control it holds becomes the
 * grid cell, so the columns line up as a table again.
 */
function BulkCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 lg:contents">
      {/* The same label the single form's fields wear, so the two match. */}
      <span className="text-title text-xs font-semibold lg:hidden">
        {label}
      </span>
      {children}
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
        // Drawn as a field, like the Selects beside it, so the row reads as
        // one line of the same boxes; the field's own floor keeps it a
        // thumb's worth tall until the table layout returns and there is a
        // pointer to aim it with.
        className={triggerClass("sm")}
      >
        <span
          className={
            features.length ? "text-title truncate" : "text-placeholder"
          }
        >
          {features.length
            ? features.map((f) => FEATURE_LABELS[f]).join(", ")
            : "None"}
        </span>
        <Icon name="chevronDown" size={12} className="text-muted" />
      </button>

      {open && (
        <div
          // Hung off the right edge until the cell is wide enough to hold it:
          // a 220px popover on a half-width cell would otherwise push the
          // dialog sideways.
          className="bg-surface absolute right-0 z-30 mt-1 flex w-[220px] max-w-[calc(100vw-6rem)] flex-wrap gap-1.5 rounded-[12px] p-2 shadow-[var(--ring),var(--shadow-md)] lg:right-auto"
        >
          {ROOM_FEATURES.map((feature) => {
            const on = features.includes(feature);
            return (
              <ToggleChip
                key={feature}
                pressed={on}
                onClick={() =>
                  onChange(
                    on
                      ? features.filter((f) => f !== feature)
                      : [...features, feature],
                  )
                }
              >
                {FEATURE_LABELS[feature]}
              </ToggleChip>
            );
          })}
        </div>
      )}
    </div>
  );
}
