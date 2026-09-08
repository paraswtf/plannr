/** The room kinds, mirroring the `RoomType` enum so the browser needs no Prisma. */
export const ROOM_TYPES = [
  "LECTURE",
  "LECTURE_HALL",
  "LAB",
  "SEMINAR",
  "AUDITORIUM",
  "STUDIO",
  "OTHER",
] as const;

export type RoomTypeName = (typeof ROOM_TYPES)[number];

export const TYPE_LABEL: Record<RoomTypeName, string> = {
  LECTURE: "Lecture",
  LECTURE_HALL: "Lecture hall",
  LAB: "Lab",
  SEMINAR: "Seminar",
  AUDITORIUM: "Auditorium",
  STUDIO: "Studio",
  OTHER: "Other",
};

/**
 * Which shape the in-service list is drawn in, and where that choice is kept.
 *
 * A cookie rather than `localStorage`, and read on the server in
 * `(app)/rooms/page.tsx`, for the reason the sidebar's fold gives: the room
 * list is server-rendered from `timetable.grid`, so a preference discovered
 * after paint would relayout the whole page from bands to rows in front of
 * whoever asked for it. It lives in this module — plain TypeScript, no
 * `"use client"` — because both the server component and the browser read it,
 * and every named export of a client module is replaced by a stub in the
 * server's graph.
 */
export const ROOMS_VIEW_COOKIE = "plannr-rooms-view";

export type RoomsLayout = "grouped" | "compact";

/**
 * The layout a cookie value asks for. Anything unrecognised — nothing written
 * yet, or a name from an older build — is the banded view, which is the one
 * that answers "where is 403?" without being told the floor first.
 */
export function roomsLayoutFrom(value: string | undefined): RoomsLayout {
  return value === "compact" ? "compact" : "grouped";
}
