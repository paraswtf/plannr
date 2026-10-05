import type { ReactNode } from "react";

import { STAKEHOLDERS } from "~/content/team";
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

/** Warm paper, a few shades of it, so the wall does not look printed. */
const PAPER = ["#ffe08c", "#ffd27e", "#ffe6a6", "#ffcf96"] as const;
/** Hand-placed, not random: the same wall every time the slide is shown. */
const TILT = [-2.4, 1.6, -0.9, 2.2, 1.3, -1.9, 2.6, -1.3, 0.8, -2.1] as const;
const DROP = [0, 18, -4, 12, -10, 8, -16, 6, 14, -8] as const;
const TAPE_TILT = [-4, 3, 6, -2, -6, 4, -3, 5, -5, 2] as const;

/** The size every note shares, in canvas px. */
export const NOTE = { w: 372, h: 236, gap: 52 } as const;

/**
 * Everything people told us, as notes on a wall — unsorted on purpose.
 *
 * Each note carries flip id `${stakeholder}-problem-${id}`: the next slide,
 * ProblemRanking, turns the same notes into ranked rows. The note's tilt is
 * a plain style transform, so Flip straightens it as the note travels.
 */
export function ProblemBoard({
  stakeholder,
  eyebrow,
  title,
  problems,
}: ProblemBoardProps) {
  const color = STAKEHOLDERS[stakeholder].color;
  // Four to a row reads as a wall; six or fewer sit better three to a row.
  const perRow = problems.length <= 6 ? 3 : 4;
  return (
    <SlideBody>
      <SlideHeader eyebrow={eyebrow} eyebrowColor={color} title={title} />
      <div className="flex min-h-0 flex-1 items-center justify-center pt-6">
        <div
          className="flex flex-wrap justify-center"
          style={{
            columnGap: NOTE.gap,
            rowGap: NOTE.gap + 8,
            width: perRow * NOTE.w + (perRow - 1) * NOTE.gap,
          }}
        >
          {problems.map((p, i) => (
            <div
              key={p.id}
              data-flip-id={`${stakeholder}-problem-${p.id}`}
              className="relative flex shrink-0 flex-col justify-center"
              style={{
                width: NOTE.w,
                height: NOTE.h,
                marginTop: DROP[i % DROP.length],
                padding: "34px 34px 30px",
                borderRadius: 6,
                background: PAPER[i % PAPER.length],
                color: "#2a2210",
                boxShadow:
                  "0 26px 44px -18px rgba(0,0,0,0.7), 0 3px 8px rgba(0,0,0,0.28), inset 0 -10px 18px -12px rgba(120,80,0,0.28)",
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
                  background: "rgba(255, 255, 255, 0.34)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
                  backdropFilter: "blur(1px)",
                }}
              />
              <span className="font-body text-[30px] leading-[1.24] font-medium tracking-[-0.005em] text-balance">
                {p.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </SlideBody>
  );
}
