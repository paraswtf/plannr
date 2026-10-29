"use client";

import { useRef, type ReactNode } from "react";

import {
  isPlannedPoint,
  rankProblems,
  SCOPE,
  type Feature,
  type Problem,
} from "~/content/types";
import type { StakeholderId } from "~/deck/types";
import { FLIGHT_BOX, FLIGHT_TEXT, useFlightSlots } from "~/deck/morph";
import { useSteps } from "~/deck/useSteps";
import { SlideBody } from "~/ui/layout";
import { Chip } from "~/ui/surfaces";

import { TEXT_TONE } from "./_problem-tone";
import { Slot } from "./_stakeholder-parts";

export interface FeatureShowcaseProps {
  stakeholder: StakeholderId;
  feature: Feature;
  /**
   * 1-based position among the section's features. No longer drawn (the deck
   * does not number things as decoration); kept so call sites compile.
   */
  number: number;
  /** The problems it answers (one or two), shown as small chips under the points. */
  solves?: Problem[];
  /**
   * The demo, given the same `step`: usually a visual from src/visuals in a
   * PhoneFrame or BrowserFrame. It gets a 960 x 844 box (the same box as
   * VisualSlide's "side" layout), centred.
   */
  visual: ReactNode;
  /** Which side the visual sits on. Default "right". */
  side?: "left" | "right";
  /** Point i is lit from step i (point 0 from the start). Steps = feature.points.length. */
  step: number;
}

/** The text column and the visual's box, in canvas px. Other slides build to these. */
const TEXT_W = 640;
const VISUAL = { w: 960, h: 844 } as const;

/**
 * One feature, sold: name, promise, three benefits, and the thing itself
 * working beside them. Write the points as benefits, not as specs.
 *
 * A planned feature says so above its name ("Planned · Core"), a real state
 * rather than a label, and every one of its points is an outlined ring
 * instead of a check. A built feature can still have points that are not
 * built yet (`feature.planned`): those get the ring too, and a small
 * "Planned" tag after their text. A ring darkens to ink when its point is
 * reached; it never fills, because nothing is done there yet.
 *
 * The title carries flip id `${stakeholder}-feature-${feature.id}`. Each
 * "Answers" chip carries the problem's flip id `${stakeholder}-problem-${id}`,
 * so a problem lit on the track slide before travels into the chip of the
 * feature that answers it, and back to its row on the track slide after.
 */
export function FeatureShowcase({
  stakeholder,
  feature,
  solves = [],
  visual,
  side = "right",
  step,
}: FeatureShowcaseProps) {
  const root = useRef<HTMLDivElement>(null);
  const planned = feature.status === "planned";

  // Point 0 is lit on arrival; each build after that lights the next one,
  // and the ones before it stay lit.
  useSteps(root, step, (tl, mark) => {
    for (let i = 1; i < feature.points.length; i++) {
      const at = tl.duration();
      const point = `[data-fs-point="${i}"]`;
      tl.to(
        `${point} .fs-text`,
        { opacity: 1, duration: 0.5, ease: "power2.out" },
        at,
      );
      if (isPlannedPoint(feature, i)) {
        // Still to build: the grey ring hands over to an ink one, which
        // lands with a small settle. No fill, no tick.
        tl.to(
          `${point} .fs-ring`,
          { opacity: 0, duration: 0.3, ease: "power1.out" },
          at,
        );
        tl.fromTo(
          `${point} .fs-ring-lit`,
          { opacity: 0, scale: 0.6, transformOrigin: "50% 50%" },
          { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2.2)" },
          at,
        );
      } else {
        tl.to(
          `${point} .fs-ring`,
          { opacity: 0, duration: 0.3, ease: "power1.out" },
          at,
        );
        tl.fromTo(
          `${point} .fs-disc`,
          { scale: 0, transformOrigin: "50% 50%" },
          { scale: 1, duration: 0.45, ease: "back.out(2.4)" },
          at,
        );
        tl.fromTo(
          `${point} .fs-tick`,
          { drawSVG: "0% 0%" },
          { drawSVG: "0% 100%", duration: 0.38, ease: "power2.out" },
          at + 0.22,
        );
      }
      mark();
    }
  });

  // Each chip sits in a slot locked to its own size: a chip flying in at a
  // list row's size must not reflow the other chip, or re-centre the column.
  useFlightSlots(root);

  // In rank order, at most two: the chapter's problems, as its track slide
  // listed them.
  const chips = rankProblems(solves).slice(0, 2);

  const text = (
    <div
      className="flex shrink-0 flex-col justify-center"
      style={{ width: TEXT_W, maxHeight: VISUAL.h }}
    >
      {planned && (
        <div className="mb-6 self-start">
          <Chip size={22} icon="hourglass">
            Planned · {SCOPE[feature.scope ?? "core"].label}
          </Chip>
        </div>
      )}
      <h1
        data-flip-id={`${stakeholder}-feature-${feature.id}`}
        className={`t-title self-start text-balance ${TEXT_TONE[stakeholder]}`}
      >
        {feature.name}
      </h1>
      <p
        className={`text-muted text-[30px] leading-[1.35] tracking-[-0.005em] text-pretty ${planned ? "mt-5" : "mt-6"}`}
      >
        {feature.tagline}
      </p>

      <ul
        className={`flex flex-col ${planned ? "mt-8 gap-[18px]" : "mt-10 gap-[22px]"}`}
      >
        {feature.points.map((p, i) => {
          const ring = isPlannedPoint(feature, i);
          return (
            <li key={i} data-fs-point={i} className="flex items-start gap-5">
              {ring ? <Ring lit={i === 0} /> : <Check lit={i === 0} />}
              <span
                // Balanced rather than pretty: a two-line point should not
                // leave one or two words (or a lone word and its tag) on a
                // line of their own.
                className="fs-text text-fg text-[27px] leading-[1.32] text-balance"
                style={{ opacity: i === 0 ? 1 : 0.32 }}
              >
                {p}
                {ring && !planned && (
                  <>
                    {" "}
                    <Chip
                      size={20}
                      icon="hourglass"
                      className="ml-1 whitespace-nowrap"
                      style={{
                        padding: "3px 10px",
                        gap: 6,
                        verticalAlign: 3,
                      }}
                    >
                      Planned
                    </Chip>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {chips.length > 0 && (
        <div className={planned ? "mt-8" : "mt-11"}>
          <p className="text-muted text-[22px] leading-[1.2] font-medium">
            Answers
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {chips.map((p) => (
              <Slot key={p.id}>
                {/* One line at rest. In flight (see FLIGHT_TEXT) the text
                    keeps two balanced lines, as the list's row has them,
                    for as long as the box is tall enough to hold them, and
                    one line fading out at the right once it is not: never
                    cut through mid-word, or through the middle of a line. */}
                <span
                  data-flip-id={`${stakeholder}-problem-${p.id}`}
                  className={`bg-sunken text-body inline-flex items-center-safe overflow-hidden text-[22px] leading-[1.25] font-medium whitespace-nowrap ${FLIGHT_BOX}`}
                  style={{ padding: "9px 16px", borderRadius: 12 }}
                >
                  <span
                    className={`min-w-0 [@container_flight_(min-height:2.5em)]:text-balance [@container_flight_(min-height:2.5em)]:whitespace-normal ${FLIGHT_TEXT}`}
                  >
                    {p.text}
                  </span>
                </span>
              </Slot>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const box = (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: VISUAL.w, height: VISUAL.h }}
    >
      {visual}
    </div>
  );

  return (
    <SlideBody className="flex-row items-center gap-16">
      <div ref={root} className="contents">
        {side === "right" ? (
          <>
            {text}
            {box}
          </>
        ) : (
          <>
            {box}
            {text}
          </>
        )}
      </div>
    </SlideBody>
  );
}

/** A round check that draws itself when its point is reached. */
function Check({ lit }: { lit: boolean }) {
  return (
    <svg
      width={36}
      height={36}
      viewBox="0 0 36 36"
      className="mt-[1px] shrink-0"
      aria-hidden
    >
      <circle
        className="fs-ring"
        cx={18}
        cy={18}
        r={16}
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth={2}
        opacity={lit ? 0 : 1}
      />
      <circle
        className="fs-disc"
        cx={18}
        cy={18}
        r={17}
        // Ink, not the accent: the feature's name is the one accented thing
        // on this slide; a lit point is state, not emphasis.
        fill="var(--fg)"
      />
      <path
        className="fs-tick"
        d="M11 18.5l4.6 4.6L25.5 13"
        fill="none"
        stroke="#ffffff"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A point that is not built yet: an outlined ring, grey until its point is
 * reached, then ink. It never fills.
 */
function Ring({ lit }: { lit: boolean }) {
  return (
    <svg
      width={36}
      height={36}
      viewBox="0 0 36 36"
      className="mt-[1px] shrink-0"
      aria-hidden
    >
      <circle
        className="fs-ring"
        cx={18}
        cy={18}
        r={16}
        fill="none"
        stroke="var(--line-strong)"
        strokeWidth={2}
        opacity={lit ? 0 : 1}
      />
      <circle
        className="fs-ring-lit"
        cx={18}
        cy={18}
        r={15.5}
        fill="none"
        stroke="var(--fg)"
        strokeWidth={2.6}
        opacity={lit ? 1 : 0}
      />
    </svg>
  );
}
