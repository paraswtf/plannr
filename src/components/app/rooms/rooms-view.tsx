"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { PageHeader } from "~/components/app/shell/page-header";
import { useNow } from "~/components/app/timetable/use-now";
import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { Icon } from "~/components/ui/icon";
import { api, type RouterOutputs } from "~/trpc/react";
import { roomStatus, type RoomOccurrence } from "./room-status";

type GridData = RouterOutputs["timetable"]["grid"];

const TYPE_LABEL: Record<string, string> = {
  LECTURE: "Lecture",
  LECTURE_HALL: "Lecture hall",
  LAB: "Lab",
  SEMINAR: "Seminar",
  AUDITORIUM: "Auditorium",
  STUDIO: "Studio",
  OTHER: "Other",
};

const FEATURE_LABEL: Record<string, string> = {
  PROJECTOR: "Projector",
  COMPUTERS: "Computers",
  AC: "AC",
  WHITEBOARD: "Whiteboard",
  MIC: "Mic",
  TV: "TV",
  STAGE: "Stage",
  SMART_BOARD: "Smart board",
};

export function RoomsView({ initial }: { initial: GridData }) {
  const [query, setQuery] = useState("");
  const [buildingId, setBuildingId] = useState<string | undefined>();
  const now = useNow(30_000);

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

  return (
    <>
      <PageHeader title="Rooms" subtitle="Browse spaces and reserve one" />
      <div className="px-9 pt-2 pb-10">
        <div className="mb-5 flex flex-wrap items-center gap-3">
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
          <select
            value={buildingId ?? ""}
            onChange={(e) => setBuildingId(e.target.value || undefined)}
            className="bg-surface rounded-[10px] px-3 py-2 text-[13px] font-medium"
            style={{ boxShadow: "var(--ring)" }}
          >
            <option value="">All buildings</option>
            {[...buildings].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <span className="text-faint ml-auto font-mono text-[12px]">
            {rooms.length} rooms
          </span>
        </div>

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
                  <Badge tone={status.tone} dot>
                    {status.label}
                  </Badge>
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
                        {FEATURE_LABEL[f] ?? f}
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

        {rooms.length === 0 && (
          <Card>
            <p className="text-muted m-0 text-[14px]">
              No rooms match that search.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
