/** What a timetable block knows about the tests and presentations held in it. */
export interface BlockAssignment {
  id: string;
  type: string;
  title: string;
  /** Presentations: the teams presenting in this sitting, in order. */
  teams: string[];
  /** False when the viewer is told it is there but cannot open it. */
  canOpen?: boolean;
}

/** The word a block puts before its title, or null when nothing is held in it. */
export function assignmentWord(
  assignments?: BlockAssignment[] | null,
): string | null {
  const first = assignments?.[0];
  if (!first) return null;
  return first.type === "PRESENTATION" ? "Presentations" : "Test";
}

/**
 * "Test:" before a block's title, in the title's own line box like `NowMark`,
 * so the block's height arithmetic never has to know about it. Words rather
 * than a coloured chip: the blocks sit on saturated course colours, and only
 * the title's own ink is held above 4.5:1 on all of them.
 */
export function AssignmentMark({
  assignments,
}: {
  assignments?: BlockAssignment[] | null;
}) {
  const word = assignmentWord(assignments);
  if (!word) return null;
  return <span className="font-bold">{word}: </span>;
}
