import type { ReactNode } from "react";

import type { Problem } from "~/content/types";
import type { StakeholderId } from "~/deck/types";
import { SlideBody, SlideHeader } from "~/ui/layout";

export interface ProblemBoardProps {
  stakeholder: StakeholderId;
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Six to ten, in the order people told us. */
  problems: Problem[];
  /** No builds by default: steps = 1. */
  step: number;
}

/**
 * Pale butter paper, a few shades of it so the wall does not look printed.
 * Kept soft and a little cool so it sits on the slate-grey stage rather than
 * glowing against it.
 */
const PAPER = ["#fbeeb4", "#f8e7a3", "#fcf1c3", "#f6e8ad"] as const;
/** Ink on paper: the stage's ink, a touch warmer. */
const PAPER_INK = "#23242a";
/**
 * Lifted off the wall: a contact shadow, a long soft fall tinted with the
 * stage's slate (never black), and a faint curl at the foot of the paper.
 */
const PAPER_SHADOW =
  "0 1px 1px rgba(16, 24, 40, 0.06), 0 12px 22px -12px rgba(16, 24, 40, 0.22), 0 30px 50px -30px rgba(16, 24, 40, 0.24), inset 0 -16px 22px -18px rgba(110, 90, 30, 0.2)";
/** Hand-placed, not random: the same wall every time the slide is shown. */
const TILT = [-2.4, 1.6, -0.9, 2.2, 1.3, -1.9, 2.6, -1.3, 0.8, -2.1] as const;
const DROP = [0, 18, -4, 12, -10, 8, -16, 6, 14, -8] as const;
const TAPE_TILT = [-4, 3, 6, -2, -6, 4, -3, 5, -5, 2] as const;

/** The size every note shares, in canvas px. */
export const NOTE = { w: 372, h: 236, gap: 52 } as const;
/**
 * A wall of six or fewer goes three to a row, with larger notes, so it still
 * spans the content width rather than leaving a third of the slide empty.
 */
const NOTE_LARGE = { w: 488, h: 262, gap: 76 } as const;

/**
 * Everything people told us, as notes on a wall, unsorted on purpose.
 *
 * Each note carries flip id `${stakeholder}-problem-${id}`: the next slide
 * (a chart or the ranking) turns the same notes into rows. The note's tilt is
 * a plain style transform, so Flip straightens it as the note travels. The
 * note carries its own type size, so the text shrinks with the box in
 * flight, and it is pinned inside a slot of its own size, so its in-flight
 * size never moves the wall.
 */
export function ProblemBoard({
  stakeholder,
  eyebrow,
  title,
  problems,
}: ProblemBoardProps) {
  // Four to a row reads as a wall; six or fewer sit better three to a row.
  const perRow = problems.length <= 6 ? 3 : 4;
  const note = perRow === 3 ? NOTE_LARGE : NOTE;
  return (
    <SlideBody>
      <SlideHeader eyebrow={eyebrow} title={title} />
      <div className="flex min-h-0 flex-1 items-center pt-6">
        <div
          className="flex flex-wrap"
          style={{
            columnGap: note.gap,
            rowGap: note.gap + 8,
            width: perRow * note.w + (perRow - 1) * note.gap,
          }}
        >
          {problems.map((p, i) => (
            // A slot of the note's size holds its place in the wall, so a
            // note flying at a row's size never reflows the notes around it.
            <div
              key={p.id}
              className="relative shrink-0"
              style={{
                width: note.w,
                height: note.h,
                marginTop: DROP[i % DROP.length],
              }}
            >
              <div
                data-flip-id={`${stakeholder}-problem-${p.id}`}
                className="font-body absolute top-0 left-0 flex flex-col justify-center text-[30px] leading-[1.24] font-medium tracking-[-0.005em]"
                style={{
                  width: note.w,
                  height: note.h,
                  padding: "34px 34px 30px",
                  borderRadius: 4,
                  background: PAPER[i % PAPER.length],
                  color: PAPER_INK,
                  boxShadow: PAPER_SHADOW,
                  transform: `rotate(${TILT[i % TILT.length]}deg)`,
                }}
              >
                {/* A strip of tape holding it to the wall. */}
                <span
                  data-enter
                  aria-hidden
                  className="absolute -top-[15px] left-1/2 h-[34px] w-[124px]"
                  style={{
                    marginLeft: -62,
                    transform: `rotate(${TAPE_TILT[i % TAPE_TILT.length]}deg)`,
                    background: "rgba(255, 255, 255, 0.58)",
                    boxShadow:
                      "inset 0 0 0 1px rgba(16, 24, 40, 0.05), 0 1px 2px rgba(16, 24, 40, 0.08)",
                    backdropFilter: "blur(1px)",
                  }}
                />
                <span className="text-balance">{p.text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SlideBody>
  );
}
