/**
 * Vocabulary of the schedule builder, shared by the server, the screens and the
 * tests.
 *
 * A plan is a *weekly pattern*: every session is an ISO weekday plus minutes
 * from local midnight, never an instant. Concrete dates come into existence
 * only when the plan is applied, at which point each session becomes a weekly
 * recurring `Event`. Keeping the two representations apart is what lets a draft
 * be revised, argued over and thrown away without a single write to the live
 * timetable.
 *
 * Pure and dependency-free on purpose — the browser imports this too.
 */

export const PLAN_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "CHANGES_REQUESTED",
  "APPLIED",
  "ARCHIVED",
] as const;

export type PlanStatusName = (typeof PLAN_STATUSES)[number];

export const PLAN_DECISIONS = [
  "PENDING",
  "APPROVED",
  "CHANGES_REQUESTED",
] as const;

export type PlanDecisionName = (typeof PLAN_DECISIONS)[number];

/** Tones match `BadgeTone` in the UI kit. */
export type PlanTone = "neutral" | "slate" | "red" | "green" | "orange";

export const PLAN_STATUS_LABEL: Record<PlanStatusName, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  APPLIED: "Applied",
  ARCHIVED: "Archived",
};

export const PLAN_STATUS_TONE: Record<PlanStatusName, PlanTone> = {
  DRAFT: "neutral",
  IN_REVIEW: "orange",
  APPROVED: "green",
  CHANGES_REQUESTED: "red",
  APPLIED: "slate",
  ARCHIVED: "neutral",
};

export const PLAN_STATUS_HINT: Record<PlanStatusName, string> = {
  DRAFT: "Only you can see this.",
  IN_REVIEW: "Shared, and waiting on the reviewers.",
  APPROVED: "Every reviewer signed off. Ready to apply.",
  CHANGES_REQUESTED: "A reviewer asked for changes. Revise it into a new draft.",
  APPLIED: "These classes are on the live timetable.",
  ARCHIVED: "Kept for the record.",
};

export const PLAN_DECISION_LABEL: Record<PlanDecisionName, string> = {
  PENDING: "Not answered yet",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
};

export const PLAN_DECISION_TONE: Record<PlanDecisionName, PlanTone> = {
  PENDING: "neutral",
  APPROVED: "green",
  CHANGES_REQUESTED: "red",
};

/** A shared draft is readable by anyone with planner access; a DRAFT is not. */
export const isShared = (status: PlanStatusName): boolean =>
  status !== "DRAFT";

/** Demand and placements are frozen once a plan leaves the drafting stage. */
export const isEditable = (status: PlanStatusName): boolean =>
  status === "DRAFT" || status === "CHANGES_REQUESTED";

/** Only a plan every reviewer signed off may be written to the timetable. */
export const isApplicable = (status: PlanStatusName): boolean =>
  status === "APPROVED";

// ─── Weekdays ───────────────────────────────────────────────────────────────

/** ISO weekday numbers, 1 = Monday … 7 = Sunday. */
export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const WEEKDAY_LABEL: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export const WEEKDAY_SHORT: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

/** The BYDAY codes RRULE uses, indexed by ISO weekday. */
export const WEEKDAY_RRULE_CODE: Record<number, string> = {
  1: "MO",
  2: "TU",
  3: "WE",
  4: "TH",
  5: "FR",
  6: "SA",
  7: "SU",
};

// ─── Room requirements ──────────────────────────────────────────────────────

/** Mirrors the `RoomType` enum, kept here so the browser needs no Prisma. */
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

export const ROOM_TYPE_LABEL: Record<RoomTypeName, string> = {
  LECTURE: "Lecture room",
  LECTURE_HALL: "Lecture hall",
  LAB: "Lab",
  SEMINAR: "Seminar room",
  AUDITORIUM: "Auditorium",
  STUDIO: "Studio",
  OTHER: "Other",
};

// ─── Small formatters ───────────────────────────────────────────────────────

/**
 * "9:00am" from minutes since local midnight.
 *
 * Deliberately not `formatMinutesOfDay` from ~/lib/dates: this one pads the
 * hour so a column of times in the plan grid lines up, which that one does not.
 */
export function formatSlot(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  const suffix = hour < 12 ? "am" : "pm";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")}${suffix}`;
}

/** "Mon 9:00am-10:00am", the way one session reads in a list. */
export function formatSessionWhen(
  dayOfWeek: number | null,
  startMinutes: number | null,
  durationMinutes: number,
): string {
  if (dayOfWeek === null || startMinutes === null) return "Not placed";
  return `${WEEKDAY_SHORT[dayOfWeek] ?? "?"} ${formatSlot(startMinutes)}-${formatSlot(
    startMinutes + durationMinutes,
  )}`;
}
