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
