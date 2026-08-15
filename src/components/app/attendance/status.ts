import type { BadgeTone } from "~/components/ui/badge";

/**
 * The vocabulary of a register, shared by the screen that takes one and the
 * screens that read one back.
 *
 * "No mark" is a fifth case rather than a fifth status, and the distinction is
 * the whole point of the attendance screens: a sitting nobody marked is not an
 * absence, and is drawn so it can never be mistaken for one.
 */

export type MarkStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export interface MarkMeta {
  value: MarkStatus;
  label: string;
  /** Solid fill for the pressed button on the marking screen. */
  tone: string;
  badge: BadgeTone;
}

export const MARK_STATUSES: MarkMeta[] = [
  { value: "PRESENT", label: "Present", tone: "#4e7d3a", badge: "green" },
  { value: "ABSENT", label: "Absent", tone: "var(--red)", badge: "red" },
  { value: "LATE", label: "Late", tone: "var(--orange)", badge: "green" },
  { value: "EXCUSED", label: "Excused", tone: "var(--slate)", badge: "slate" },
];

/**
 * Late is badged green because the college counts it as attendance; the word
 * itself is the only reproach, and colouring it as a problem would say the
 * percentage suffered when it did not.
 */
export function markMeta(status: string | null | undefined): MarkMeta | null {
  return MARK_STATUSES.find((s) => s.value === status) ?? null;
}
