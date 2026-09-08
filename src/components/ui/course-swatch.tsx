import { courseTone } from "~/lib/course-colour";

/**
 * The colour a subject is drawn in, wherever its name is written.
 *
 * The point is the connection: a student who has learnt that Design Thinking is
 * the teal block on their week should meet the same teal beside its name in the
 * catalogue and on their attendance card, or the colour is only a decoration on
 * one screen rather than a fact about the course.
 *
 * `aria-hidden`, always. It is never the only thing saying which course this is
 * — the name is next to it in every one of these places — and a screen reader
 * announcing "teal" before every title would be reading out the ink.
 */
export function CourseSwatch({
  title,
  size = 12,
}: {
  title: string;
  /** Square, in px. Smaller in a dense list, larger beside a heading. */
  size?: number;
}) {
  const tone = courseTone(title);
  return (
    <span
      aria-hidden
      className="shrink-0 rounded-[4px]"
      style={{
        width: size,
        height: size,
        background: tone.fill,
        boxShadow: `inset 0 0 0 1px ${tone.ring}`,
      }}
    />
  );
}
