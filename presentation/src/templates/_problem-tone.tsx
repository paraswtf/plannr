import type { StakeholderId } from "~/deck/types";

/**
 * The colour of the one thing that matters on a problem slide, as a text
 * class, for elements that travel in the morph. Flip reads an inline
 * `color: var(--…)` as transparent and fades the text in from nothing, so a
 * travelling element takes its colour from a class.
 *
 * Stakeholders no longer have colours of their own (see DESIGN.md): every
 * section uses the deck's single accent. The map is kept so call sites stay
 * keyed by stakeholder.
 */
export const TEXT_TONE: Record<StakeholderId, string> = {
  students: "text-accent",
  faculty: "text-accent",
  coordinators: "text-accent",
  admins: "text-accent",
};

/**
 * The cell a problem lives in once it leaves the wall: a raised surface with
 * a hairline and the resting shadow, drawn with classes (never inline vars)
 * because the cell is a flip element.
 */
export const PROBLEM_CARD =
  "bg-raised shadow-[inset_0_0_0_1px_var(--line),var(--shadow-1)]";
