import { answersFinalAt, type AnswerWindow } from "~/lib/assignments";

/** Where a student is with a test, as their own list of assignments says it. */
export type MyStatus =
  "not started" | "in progress" | "handed in at the close" | "submitted";

/**
 * A student's own status on a test, by the rule the teacher's roster uses: an
 * answer begun and never handed in counts as handed in once the window and its
 * grace are over, because that is what the marking reads. Saying "in progress"
 * after that would read as unfinished work the student can still do.
 */
export function studentStatus(
  submission: "IN_PROGRESS" | "SUBMITTED" | null | undefined,
  window: AnswerWindow | null,
  now: Date,
): MyStatus {
  if (submission === "SUBMITTED") return "submitted";
  if (submission !== "IN_PROGRESS") return "not started";
  // The grace is shorter after a teacher closes the paper early; answersFinalAt
  // knows which, as the roster does.
  const over =
    window !== null && now.getTime() > answersFinalAt(window).getTime();
  return over ? "handed in at the close" : "in progress";
}
