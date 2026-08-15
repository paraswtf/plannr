/**
 * Wording shared by the catalogue and the course page.
 *
 * "Course" here means a subject taught this semester — BCA and BBA-IT are
 * programmes, and a course belongs to one. The catalogue and the course page
 * count the same things, so they are counted in one place and read the same on
 * both.
 */

/**
 * "1 group" / "4 groups". Only for nouns that pluralise with an "s" — "series"
 * and the like have to be written out by their caller.
 */
export const countLabel = (n: number, noun: string) =>
  `${n} ${noun}${n === 1 ? "" : "s"}`;

/** Why an unstaffed course is a problem, not a curiosity. */
export const NO_FACULTY_NOTE =
  "Nobody is cleared to teach this course, so no lecture can be timetabled to it.";
