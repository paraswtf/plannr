import type { StakeholderId } from "~/deck/types";

/**
 * A stakeholder's colour as a text class, for elements that travel in the
 * morph. Flip reads an inline `color: var(--…)` as transparent and fades the
 * text in from nothing, so a travelling element takes its colour from a class.
 */
export const TEXT_TONE: Record<StakeholderId, string> = {
  students: "text-students",
  faculty: "text-faculty",
  coordinators: "text-coordinators",
  admins: "text-admins",
};
