"use client";

import { useRef, type ReactNode } from "react";

import { STAKEHOLDERS } from "~/content/team";
import { rankProblems, type Feature, type Problem } from "~/content/types";
import type { StakeholderId } from "~/deck/types";
import { useSteps } from "~/deck/useSteps";
import { Eyebrow, SlideBody } from "~/ui/layout";

import { TEXT_TONE } from "./_problem-tone";

export interface FeatureShowcaseProps {
  stakeholder: StakeholderId;
  feature: Feature;
  /** 1-based position among the section's features: "Feature 02". */
  number: number;
  /** The problems it answers, shown as small chips under the points. */
  solves?: Problem[];
  /**
   * The demo, given the same `step`: usually a visual from src/visuals in a
   * PhoneFrame or BrowserFrame. It gets a 960 × 844 box (the same box as
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
 * working beside them. This is the marketing half of the deck — write the
 * points as benefits, not as specs.
 *
 * The title carries flip id `${stakeholder}-feature-${feature.id}`, shared
 * with its cell on SolutionMap. Each "solves" chip carries the problem's flip
 * id `${stakeholder}-problem-${id}`, so the problem cells on SolutionMap
 * shrink into the chips of the feature that answers them.
 */
export function FeatureShowcase({
  stakeholder,
  feature,
  number,
  solves = [],
  visual,
  side = "right",
  step,
}: FeatureShowcaseProps) {
  const root = useRef<HTMLDivElement>(null);
  const color = STAKEHOLDERS[stakeholder].color;

  // Point 0 is lit on arrival; each build after that lights the next one,
  // and the ones before it stay lit.
  useSteps(root, step, (tl, mark) => {
    for (let i = 1; i < feature.points.length; i++) {
      const at = tl.duration();
      tl.to(
        `[data-fs-point="${i}"] .fs-text`,
        { opacity: 1, duration: 0.5, ease: "power2.out" },
        at,
      );
      tl.to(
        `[data-fs-point="${i}"] .fs-ring`,
        { opacity: 0, duration: 0.3, ease: "power1.out" },
        at,
      );
      tl.fromTo(
        `[data-fs-point="${i}"] .fs-disc`,
        { scale: 0, transformOrigin: "50% 50%" },
        { scale: 1, duration: 0.45, ease: "back.out(2.4)" },
        at,
      );
      tl.fromTo(
        `[data-fs-point="${i}"] .fs-tick`,
        { drawSVG: "0% 0%" },
        { drawSVG: "0% 100%", duration: 0.38, ease: "power2.out" },
        at + 0.22,
      );
      mark();
    }
  });

  // In rank order: the top problems, which travel in from SolutionMap, come
  // first and land in the order the map listed them.
  const chips = rankProblems(solves);

  const text = (
    <div
      className="flex shrink-0 flex-col justify-center"
      style={{ width: TEXT_W, maxHeight: VISUAL.h }}
    >
      <Eyebrow color={color}>Feature {String(number).padStart(2, "0")}</Eyebrow>
      <h1
        data-flip-id={`${stakeholder}-feature-${feature.id}`}
        className={`t-title mt-6 self-start text-balance ${TEXT_TONE[stakeholder]}`}
      >
        {feature.name}
      </h1>
      <p className="text-muted mt-6 text-[30px] leading-[1.35] tracking-[-0.005em] text-pretty">
        {feature.tagline}
      </p>

      <ul className="mt-10 flex flex-col gap-[22px]">
        {feature.points.map((p, i) => (
          <li key={i} data-fs-point={i} className="flex items-start gap-5">
            <Check color={color} lit={i === 0} />
            <span
              className="fs-text text-fg text-[27px] leading-[1.32] text-pretty"
              style={{ opacity: i === 0 ? 1 : 0.32 }}
            >
              {p}
            </span>
          </li>
        ))}
      </ul>

      {chips.length > 0 && (
        <div className="mt-11">
          <p className="t-eyebrow text-faint">Solves</p>
          <div
            className={`mt-4 flex flex-wrap ${chips.length > 3 ? "gap-2.5" : "gap-3"}`}
          >
            {chips.map((p) => (
              <span
                key={p.id}
                data-flip-id={`${stakeholder}-problem-${p.id}`}
                className="bg-card ring-hair text-muted inline-block text-[22px] leading-[1.25]"
                style={{ padding: "8px 18px", borderRadius: 999 }}
              >
                {p.text}
              </span>
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
function Check({ color, lit }: { color: string; lit: boolean }) {
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
      <circle className="fs-disc" cx={18} cy={18} r={17} fill={color} />
      <path
        className="fs-tick"
        d="M11 18.5l4.6 4.6L25.5 13"
        fill="none"
        stroke="var(--ink-0)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
