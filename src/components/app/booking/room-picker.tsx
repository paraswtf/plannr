"use client";

import { useState } from "react";

import { SearchSelect } from "~/components/ui/entity-picker";
import { Field } from "~/components/ui/field";
import { roomShortfalls, type FittableRoom, type RoomNeeds } from "./room-fit";

/**
 * Which room a booking is for, as a search box rather than a dropdown.
 *
 * The whole list is already on the client — the calendar drew it — so the
 * narrowing happens here rather than on the server, but the control is the same
 * one the class and faculty fields use. Rooms that cannot take the booking are
 * listed with the reason and cannot be chosen.
 */
export function RoomPicker({
  rooms,
  value,
  onChange,
  needs,
  label = "Room",
  pageSize = 20,
}: {
  rooms: FittableRoom[];
  value: string;
  onChange: (roomId: string) => void;
  /** Seats and kit the session needs; rooms short of either are disabled. */
  needs: RoomNeeds;
  label?: string;
  pageSize?: number;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(pageSize);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? rooms.filter((room) =>
        `${room.code} ${room.building?.name ?? ""}`
          .toLowerCase()
          .includes(needle),
      )
    : rooms;
  const selected = rooms.find((room) => room.id === value);

  return (
    <Field label={label}>
      {(id) => (
        <SearchSelect
          id={id}
          value={selected ? { id: selected.id, label: selected.code } : null}
          onChange={(id) => id && onChange(id)}
          page={{
            rows: matches.slice(0, limit).map((room) => {
              const shortfalls = roomShortfalls(room, needs);
              return {
                id: room.id,
                label: room.code,
                hint: shortfalls.length
                  ? shortfalls.join(" · ")
                  : `${room.building?.name ? `${room.building.name} · ` : ""}seats ${room.capacity}`,
                disabled: shortfalls.length > 0,
              };
            }),
            total: matches.length,
            hasMore: matches.length > limit,
          }}
          query={query}
          onQueryChange={setQuery}
          onLoadMore={() => setLimit((n) => n + pageSize)}
          placeholder="Search rooms…"
        />
      )}
    </Field>
  );
}
