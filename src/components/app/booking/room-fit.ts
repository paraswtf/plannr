/**
 * Whether a room can take a booking at all — as opposed to whether it is free,
 * which is what the conflict checks answer.
 *
 * Two things disqualify a room: too few seats for the class being scheduled, and
 * missing kit the session needs. Both are known on the client (the calendar
 * already carries every room's capacity and features), so the screens grey out
 * what cannot work rather than letting someone pick it and find out later.
 */

/** Mirrors the `RoomFeature` enum, kept here so the browser needs no Prisma. */
export const ROOM_FEATURES = [
  "PROJECTOR",
  "COMPUTERS",
  "AC",
  "WHITEBOARD",
  "MIC",
  "TV",
  "STAGE",
  "SMART_BOARD",
] as const;

export type RoomFeatureName = (typeof ROOM_FEATURES)[number];

export const FEATURE_LABELS: Record<RoomFeatureName, string> = {
  PROJECTOR: "Projector",
  COMPUTERS: "Computers",
  AC: "AC",
  WHITEBOARD: "Whiteboard",
  MIC: "Mic",
  TV: "TV",
  STAGE: "Stage",
  SMART_BOARD: "Smart board",
};

export interface FittableRoom {
  id: string;
  code: string;
  capacity: number;
  features: RoomFeatureName[];
  building?: { name: string };
}

/** What the booking needs of a room. */
export interface RoomNeeds {
  /** Seats required — the size of the class attending, when one is chosen. */
  seats: number;
  features: RoomFeatureName[];
}

export const NO_NEEDS: RoomNeeds = { seats: 0, features: [] };

/** Every reason this room cannot take the booking; empty when it can. */
export function roomShortfalls(
  room: Pick<FittableRoom, "capacity" | "features">,
  needs: RoomNeeds,
): string[] {
  const out: string[] = [];
  if (needs.seats > room.capacity) {
    out.push(`seats ${room.capacity} of ${needs.seats}`);
  }
  const missing = needs.features.filter((f) => !room.features.includes(f));
  if (missing.length > 0) {
    out.push(
      `no ${missing.map((f) => FEATURE_LABELS[f].toLowerCase()).join(", ")}`,
    );
  }
  return out;
}

export const roomFits = (
  room: Pick<FittableRoom, "capacity" | "features">,
  needs: RoomNeeds,
): boolean => roomShortfalls(room, needs).length === 0;

export const hasNeeds = (needs: RoomNeeds): boolean =>
  needs.seats > 0 || needs.features.length > 0;

/** The rooms that cannot take it, as a set the calendar can test against. */
export function unfitRoomIds(
  rooms: Array<Pick<FittableRoom, "id" | "capacity" | "features">>,
  needs: RoomNeeds,
): Set<string> {
  const out = new Set<string>();
  if (!hasNeeds(needs)) return out;
  for (const room of rooms) {
    if (!roomFits(room, needs)) out.add(room.id);
  }
  return out;
}
