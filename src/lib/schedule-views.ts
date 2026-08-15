import { PermissionBitField, PermissionFlags as F } from "./permissions";

/**
 * Whose eyes you are looking through on the schedule.
 *
 * The same day looks different depending on why you are looking at it. A
 * student wants to know where to be and who is teaching; a lecturer wants to
 * know who will be in the room; whoever runs the timetable wants both, and the
 * means to change it. Plenty of people are more than one of those at once —
 * teaching while coordinating, or coordinating while still enrolled — so the
 * perspective is chosen rather than inferred, and only ever from the ones that
 * person is genuinely entitled to.
 */

export const PERSPECTIVES = ["student", "faculty", "coordinator", "admin"] as const;

export type Perspective = (typeof PERSPECTIVES)[number];

export const PERSPECTIVE_LABELS: Record<Perspective, string> = {
  student: "Student",
  faculty: "Faculty",
  coordinator: "Coordinator",
  admin: "Admin",
};

export interface PerspectiveClaims {
  /** They are enrolled, so they have classes to attend. */
  hasStudentProfile: boolean;
  /** They teach, so they have classes to take. */
  hasFacultyProfile: boolean;
  permissions: bigint;
}

/**
 * The perspectives this person may take, most personal first.
 *
 * Teaching and studying are facts about a person — they hold the profile or
 * they do not — while coordinating and administering are permissions. Ordering
 * the personal ones first means somebody who is a student and an admin lands on
 * their own timetable, which is what the screen is for, and reaches the
 * rest through the dropdown.
 */
export function perspectivesFor(claims: PerspectiveClaims): Perspective[] {
  const bits = new PermissionBitField(claims.permissions);
  const available: Perspective[] = [];

  if (claims.hasStudentProfile) available.push("student");
  if (claims.hasFacultyProfile) available.push("faculty");
  if (bits.has(F.ManageAllEvents)) available.push("coordinator");
  if (bits.has(F.Administrator)) available.push("admin");

  return available;
}

/** The perspective to show: the one asked for, if they may take it. */
export function resolvePerspective(
  available: Perspective[],
  requested?: Perspective | null,
): Perspective | null {
  if (requested && available.includes(requested)) return requested;
  return available[0] ?? null;
}

export interface PerspectiveDetail {
  /** Who is in the room: batch, division, cohort size, course. */
  cohort: boolean;
  /** Who is taking the class, and what it belongs to. */
  teaching: boolean;
  /** Whether the classes shown are ones they attend, teach, or both. */
  scope: "attending" | "teaching" | "both";
  /** Whether an event opens for editing. */
  modify: boolean;
}

/** What a perspective puts on each class. */
export function detailFor(perspective: Perspective): PerspectiveDetail {
  switch (perspective) {
    case "student":
      return { cohort: false, teaching: true, scope: "attending", modify: false };
    case "faculty":
      return { cohort: true, teaching: false, scope: "teaching", modify: false };
    case "coordinator":
      return { cohort: true, teaching: true, scope: "both", modify: true };
    case "admin":
      return { cohort: true, teaching: true, scope: "both", modify: true };
  }
}

// ─── What each perspective says about a class ───────────────────────────────

export interface ClassContext {
  /** Who takes it. */
  facultyName?: string | null;
  /** The programme it belongs to, e.g. "BCA · Bachelor of Computer Applications". */
  course?: string | null;
  /** Every cohort in the room. */
  cohorts?: Array<{ name: string; batch: string | null; size: number }>;
  /** Everyone expected, across those cohorts. */
  headcount?: number;
}

/**
 * The lines under a class, in the order they matter to whoever is looking.
 *
 * A block on a calendar is only ever a few lines tall, so the order is the
 * design: whatever that perspective came for goes first, and the rest follows
 * if there is room. A lecturer came to find out who is in front of them, a
 * student to find out who is taking it. Facts that belong together — the batch,
 * the division and how many that is — share a line rather than each taking one.
 */
export function describeClass(
  event: ClassContext,
  detail: PerspectiveDetail,
): string[] {
  const lines: string[] = [];

  if (detail.cohort && event.cohorts && event.cohorts.length > 0) {
    // A combined lecture names each cohort; the batch is only worth repeating
    // when they come from different ones.
    const batches = new Set(event.cohorts.map((c) => c.batch).filter(Boolean));
    const named = event.cohorts
      .map((c) => (batches.size > 1 && c.batch ? `${c.batch} ${c.name}` : c.name))
      .join(" + ");
    const [batch] = [...batches];
    const who = batches.size === 1 && batch ? `${batch} · ${named}` : named;

    const size = event.headcount ?? event.cohorts.reduce((n, c) => n + c.size, 0);
    lines.push(size > 0 ? `${who} · ${size} student${size === 1 ? "" : "s"}` : who);
  }

  if (detail.teaching && event.facultyName) lines.push(event.facultyName);
  if (event.course) lines.push(event.course);

  return lines;
}
