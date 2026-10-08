import type { CSSProperties } from "react";

import type { CourseTone } from "~/lib/course-colour";

/**
 * How a sitting is painted on any of the three calendars: its fill and the
 * hairline over it, in one place because the day, the week and the month all
 * draw the same three states and used to restate them three times.
 *
 * Colour only. Nothing here may change a box's size: the day and the week
 * place blocks by arithmetic and `fitLines` counts lines against fixed type
 * sizes, so a state that moved a pixel would push text into the block below.
 */
export function blockPaint(
  tone: CourseTone,
  { live, past }: { live: boolean; past: boolean },
): CSSProperties {
  /*
   * "Happening now" over the top of the subject's own colour, and said with a
   * shape as well as a hue. The salmon fill sits among pink and orchid course
   * tones, and to a red-green colour-blind reader it is one more pinkish
   * block; the bar down the leading edge is there for them, and it is drawn as
   * a second inset shadow so it costs the block no width.
   */
  if (live) {
    return {
      background: "var(--live-fill)",
      boxShadow: "inset 3px 0 0 var(--red), inset 0 0 0 1px var(--red)",
    };
  }
  /*
   * Over, by taking the fill most of the way to white rather than by fading
   * the whole block. Element opacity took the text down with it, and faint
   * ink at 62% over a saturated fill came out well under 2:1; this keeps the
   * ink at full strength, so a past class is plainly paler than the ones to
   * come and still reads at AA.
   */
  if (past) {
    return {
      background: `color-mix(in srgb, ${tone.fill} 45%, var(--surface))`,
      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone.ring} 40%, var(--surface))`,
    };
  }
  return {
    background: tone.fill,
    boxShadow: `inset 0 0 0 1px ${tone.ring}`,
  };
}

/**
 * The word that says a sitting is on now, for the line under its title.
 *
 * The red lamp is the one dot the house allows, because it marks real state;
 * the word is in the title's ink because red ink on the salmon fill is about
 * 3:1, too faint for an 11px line. Inline, in the same line box as the time,
 * so it adds no height to a block whose lines are counted.
 */
export function NowMark() {
  return (
    <>
      <span
        aria-hidden
        className="bg-red mr-1 inline-block h-[6px] w-[6px] rounded-full align-[1px]"
      />
      <span className="text-title mr-1.5 font-semibold">Now</span>
    </>
  );
}
