"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useRouter } from "next/navigation";

import {
  FEATURE_LABELS,
  type RoomFeatureName,
} from "~/components/app/booking/room-fit";
import { PageHeader } from "~/components/app/shell/page-header";
import { useNow } from "~/components/app/timetable/use-now";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { Segmented } from "~/components/ui/segmented";
import { Select } from "~/components/ui/select";
import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { api, type RouterOutputs } from "~/trpc/react";
import { RoomDialog, type EditableRoom } from "./room-dialog";
import { roomStatus, type RoomOccurrence } from "./room-status";
import { TYPE_LABEL, type RoomTypeName } from "./room-vocab";

type GridData = RouterOutputs["timetable"]["grid"];

export function RoomsView({
  initial,
  permissions,
}: {
  initial: GridData;
  permissions: string;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const [query, setQuery] = useState("");
  const [buildingId, setBuildingId] = useState<string | undefined>();
  const [tab, setTab] = useState<"active" | "archived">("active");
  // Null means the dialog is closed; undefined inside it means "adding".
  const [editing, setEditing] = useState<{ room?: EditableRoom } | null>(null);
  const now = useNow(30_000);

  const canManage = new PermissionBitField(BigInt(permissions)).has(
    PermissionFlags.ManageRooms,
  );

  // Archived rooms are not on the timetable at all, so they need their own
  // read; it only runs when the tab asking for them is open.
  const archivedQuery = api.rooms.list.useQuery(
    { includeInactive: true },
    { enabled: canManage && tab === "archived" },
  );
  const archived = (archivedQuery.data ?? []).filter((r) => !r.isActive);

  const restore = api.rooms.restore.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.timetable.invalidate(),
        utils.rooms.invalidate(),
      ]);
      router.refresh();
    },
  });

  // One query feeds every card: today's occupancy for the whole campus. Each
  // room's badge is derived from it client-side rather than fetched per room.
  const { data } = api.timetable.grid.useQuery(
    { date: new Date(initial.from) },
    {
      initialData: initial,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  );

  const timeZone = data?.timeZone ?? "Asia/Kolkata";
  const workingHours =
    ((data?.settings?.dayEndMinutes ?? 1080) -
      (data?.settings?.dayStartMinutes ?? 480)) /
    60;

  const byRoom = useMemo(() => {
    const map = new Map<string, RoomOccurrence[]>();
    for (const o of data?.occurrences ?? []) {
      const entry = {
        roomId: o.roomId,
        start: o.start,
        end: o.end,
        title: o.title,
      };
      const list = map.get(o.roomId);
      if (list) list.push(entry);
      else map.set(o.roomId, [entry]);
    }
    return map;
  }, [data?.occurrences]);

  const buildings = new Map(
    (data?.rooms ?? []).map((r) => [r.building.id, r.building.name]),
  );

  const needle = query.trim().toLowerCase();
  const rooms = (data?.rooms ?? []).filter((room) => {
    if (buildingId && room.building.id !== buildingId) return false;
    if (!needle) return true;
    return (
      room.code.toLowerCase().includes(needle) ||
      (TYPE_LABEL[room.type]?.toLowerCase().includes(needle) ?? false) ||
      room.building.name.toLowerCase().includes(needle)
    );
  });

  const archivedRooms = archived.filter(
    (room) =>
      !needle ||
      room.code.toLowerCase().includes(needle) ||
      room.building.name.toLowerCase().includes(needle),
  );

  const refresh = async () => {
    await Promise.all([utils.timetable.invalidate(), utils.rooms.invalidate()]);
    router.refresh();
  };

  return (
    <>
      <PageHeader
        title="Rooms"
        subtitle="Browse spaces and reserve one"
        actions={
          canManage && (
            <button
              type="button"
              onClick={() => setEditing({})}
              className="cursor-pointer rounded-[var(--radius-btn)] px-3.5 py-2 text-[13px] font-semibold text-white"
              style={{ background: "var(--grad-brand)" }}
            >
              + Add room
            </button>
          )
        }
      />
      <div className="px-9 pt-2 pb-10">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          {canManage && (
            <Segmented
              items={[
                { value: "active" as const, label: "In service" },
                { value: "archived" as const, label: "Archived" },
              ]}
              value={tab}
              onChange={setTab}
              size="sm"
            />
          )}
          <div className="relative w-60">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
              <Icon name="search" size={15} color="var(--faint)" />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rooms…"
              className="bg-surface w-full rounded-[10px] py-2 pr-3 pl-9 text-[13.5px] outline-none"
              style={{ boxShadow: "var(--ring)" }}
            />
          </div>
          {tab === "active" && (
            <Select
              ariaLabel="Building"
              value={buildingId ?? ""}
              options={[
                { value: "", label: "All buildings" },
                ...[...buildings].map(([id, name]) => ({
                  value: id,
                  label: name,
                })),
              ]}
              onChange={(id) => setBuildingId(id || undefined)}
            />
          )}
          <span className="text-faint ml-auto font-mono text-[12px]">
            {tab === "active"
              ? `${rooms.length} rooms`
              : `${archivedRooms.length} archived`}
          </span>
        </div>

        {tab === "archived" ? (
          <ArchivedRooms
            rooms={archivedRooms}
            loading={archivedQuery.isLoading}
            restoring={restore.isPending ? restore.variables?.id : undefined}
            onRestore={(id) => restore.mutate({ id })}
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-4">
            {rooms.map((room) => {
              const status = roomStatus(
                byRoom.get(room.id) ?? [],
                now,
                timeZone,
                workingHours,
              );
              return (
                <Card key={room.id} pad={18} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-display text-title text-[19px] font-bold">
                        {room.code}
                      </div>
                      <div className="text-muted mt-0.5 text-[12.5px]">
                        {room.building.name} ·{" "}
                        {room.floor === 0 ? "ground" : `floor ${room.floor}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                      {canManage && (
                        <button
                          type="button"
                          aria-label={`Edit ${room.code}`}
                          onClick={() =>
                            setEditing({
                              room: {
                                id: room.id,
                                code: room.code,
                                buildingId: room.building.id,
                                floor: room.floor,
                                capacity: room.capacity,
                                type: room.type,
                                features: room.features,
                                notes: room.notes,
                              },
                            })
                          }
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg"
                          style={{ background: "rgba(68,88,121,0.07)" }}
                        >
                          <Icon
                            name="settings"
                            size={13}
                            color="var(--slate)"
                            stroke={2}
                          />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge tone="slate">
                      {TYPE_LABEL[room.type] ?? room.type}
                    </Badge>
                    <span className="text-muted inline-flex items-center gap-1.5 text-[12.5px]">
                      <Icon name="users" size={13} color="var(--muted)" />
                      {room.capacity} seats
                    </span>
                  </div>

                  {room.features.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {room.features.map((f) => (
                        <span
                          key={f}
                          className="text-muted rounded-md px-2 py-1 text-[11px] font-semibold"
                          style={{ background: "rgba(68,88,121,0.07)" }}
                        >
                          {FEATURE_LABELS[f] ?? f}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto pt-1">
                    <div
                      className="mb-2 h-1.5 overflow-hidden rounded-full"
                      style={{ background: "rgba(68,88,121,0.12)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round(status.load * 100)}%`,
                          background: "var(--slate)",
                        }}
                      />
                    </div>
                    <div className="text-faint text-[12px]">{status.line}</div>
                  </div>

                  <Link
                    href={`/book?room=${room.id}`}
                    className="text-slate inline-flex items-center gap-1.5 text-[13px] font-bold"
                  >
                    Book this room
                    <Icon name="arrowRight" size={15} color="var(--slate)" />
                  </Link>
                </Card>
              );
            })}
          </div>
        )}

        {tab === "active" && rooms.length === 0 && (
          <Card>
            <p className="text-muted m-0 text-[14px]">
              {(data?.rooms ?? []).length === 0
                ? "No rooms yet."
                : "No rooms match that search."}
            </p>
          </Card>
        )}
      </div>

      {editing && (
        <RoomDialog
          room={editing.room}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}

/**
 * Rooms out of service. Deliberately plainer than the cards: there is no
 * occupancy to show for a room nothing can be booked into, so the only question
 * left is whether to bring it back.
 */
function ArchivedRooms({
  rooms,
  loading,
  restoring,
  onRestore,
}: {
  rooms: Array<{
    id: string;
    code: string;
    capacity: number;
    type: RoomTypeName;
    features: RoomFeatureName[];
    building: { name: string };
  }>;
  loading: boolean;
  /** The room currently being put back, if any. */
  restoring?: string;
  onRestore: (id: string) => void;
}) {
  if (loading) {
    return (
      <Card>
        <p className="text-muted m-0 text-[14px]">Looking…</p>
      </Card>
    );
  }

  if (rooms.length === 0) {
    return (
      <Card>
        <p className="text-muted m-0 text-[14px]">
          Nothing archived. Rooms taken out of service turn up here.
        </p>
      </Card>
    );
  }

  return (
    <Card pad={0}>
      {rooms.map((room, i) => (
        <div
          key={room.id}
          className="flex flex-wrap items-center gap-3 px-4 py-3"
          style={
            i > 0 ? { boxShadow: "inset 0 1px 0 var(--hair-soft)" } : undefined
          }
        >
          <span className="font-display text-title min-w-[90px] text-[15px] font-bold">
            {room.code}
          </span>
          <span className="text-muted text-[12.5px]">
            {room.building.name} · {TYPE_LABEL[room.type] ?? room.type} ·{" "}
            {room.capacity} seats
          </span>
          {room.features.length > 0 && (
            <span className="text-faint truncate text-[11.5px]">
              {room.features.map((f) => FEATURE_LABELS[f] ?? f).join(", ")}
            </span>
          )}
          <button
            type="button"
            disabled={restoring === room.id}
            onClick={() => onRestore(room.id)}
            className="text-slate ml-auto cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
            style={{ boxShadow: "var(--ring)" }}
          >
            {restoring === room.id ? "Restoring…" : "Put back in service"}
          </button>
        </div>
      ))}
    </Card>
  );
}
