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
  /**
   * The classes for the pressed button on the marking screen.
   *
   * Quiet for the default, loud for the exceptions. Everybody starts present,
   * so a solid green Present on every row was the loudest thing on the screen
   * and the absences a teacher is hunting for drowned in it; Present pressed is
   * now a wash, and only a mark somebody actually made is a solid fill. Every
   * pressed state carries white or a state ink that clears AA — the old Late
   * was white on the brand orange, about 2:1.
   */
  pressed: string;
  badge: BadgeTone;
}

export const MARK_STATUSES: MarkMeta[] = [
  {
    value: "PRESENT",
    label: "Present",
    pressed: "bg-good-wash text-good shadow-[inset_0_0_0_1px_var(--good-line)]",
    badge: "green",
  },
  {
    value: "ABSENT",
    label: "Absent",
    // The deeper red, not the lamp's: white on `--red` is 4.47:1, a hair short.
    pressed: "bg-red-strong text-white",
    badge: "red",
  },
  {
    value: "LATE",
    label: "Late",
    // Green, as its badge is (see below): the same mark used to be orange
    // while it was being taken and green when it was read back.
    pressed: "bg-green text-white",
    badge: "green",
  },
  {
    value: "EXCUSED",
    label: "Excused",
    pressed: "bg-slate text-white",
    badge: "slate",
  },
];

/**
 * Late is badged green because the college counts it as attendance; the word
 * itself is the only reproach, and colouring it as a problem would say the
 * percentage suffered when it did not.
 */
export function markMeta(status: string | null | undefined): MarkMeta | null {
  return MARK_STATUSES.find((s) => s.value === status) ?? null;
}
