"use client";

import { useState } from "react";

import { SearchSelect } from "~/components/ui/entity-picker";

export interface PickableRoom {
  id: string;
  code: string;
  capacity: number;
  building: { name: string };
}

/**
 * Which room a booking is for, as a search box rather than a dropdown.
 *
 * The whole list is already on the client — the calendar drew it — so the
 * narrowing happens here rather than on the server, but the control is the same
 * one the class and faculty fields use.
 */
export function RoomPicker({
  rooms,
  value,
  onChange,
  label = "Room",
  pageSize = 20,
}: {
  rooms: PickableRoom[];
  value: string;
  onChange: (roomId: string) => void;
  label?: string;
  pageSize?: number;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(pageSize);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? rooms.filter((room) =>
        `${room.code} ${room.building.name}`.toLowerCase().includes(needle),
      )
    : rooms;
  const selected = rooms.find((room) => room.id === value);

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-ink text-[13px] font-semibold">{label}</span>
      <SearchSelect
        value={selected ? { id: selected.id, label: selected.code } : null}
        onChange={(id) => id && onChange(id)}
        page={{
          rows: matches.slice(0, limit).map((room) => ({
            id: room.id,
            label: room.code,
            hint: `${room.building.name} · seats ${room.capacity}`,
          })),
          total: matches.length,
          hasMore: matches.length > limit,
        }}
        query={query}
        onQueryChange={setQuery}
        onLoadMore={() => setLimit((n) => n + pageSize)}
        placeholder="Search rooms…"
      />
    </label>
  );
}
