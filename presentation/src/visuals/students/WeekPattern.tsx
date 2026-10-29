"use client";

import { useRef, type ReactNode } from "react";

import { gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";
import { useSteps } from "~/deck/useSteps";
import { Icon } from "~/ui/icon";
import { Ph } from "~/ui/placeholder";
import { Card } from "~/ui/surfaces";

export interface WeekPatternProps {
  step: number;
  active: boolean;
  /**
   * The number that lands with the last build, beside the week that broke:
   * a big value and what it counts. Defaults to the placeholder.
   */
  stat?: { value: ReactNode; label: ReactNode };
}

/*
 * The geometry, in canvas pixels. Four week cards side by side fill the 960px
 * box; inside each, five day columns and an hour per HOUR px from 9 to 5.
 */
const WEEK_W = 222;
const WEEK_GAP = 24;
const PAD = 14;
const DAY_W = 34;
const DAY_GAP = 6;
const GRID_TOP = 52;
const HOUR = 46;
const HOURS = 8; // 09:00 to 17:00
const CARD_H = GRID_TOP + HOURS * HOUR + 14;

/** [day 0-4, start hour, length in hours, course]: the same every week. */
const WEEK: [number, number, number, string][] = [
  [0, 9, 2, "Design Thinking"],
  [0, 11, 1, "Data Mining"],
  [0, 14, 2, "Web Technologies"],
  [1, 9, 1, "Business Analytics"],
  [1, 10, 2, "Software Testing"],
  [1, 14, 1, "Software Engineering"],
  [2, 10, 1, "Design Thinking"],
  [2, 11, 2, "Big Data"],
  [2, 15, 1, "Data Mining"],
  [3, 9, 2, "Web Technologies"],
  [3, 11, 1, "Business Analytics"],
  [3, 13, 1, "Software Engineering"],
  [4, 9, 1, "Big Data"],
  [4, 10, 2, "Software Testing"],
  [4, 13, 1, "Design Thinking"],
];

/** Each week by its Monday. */
const WEEKS = ["Sep 7", "Sep 14", "Sep 21", "Sep 28"];

/** The one that is different: week three, Thursday at four. */
const EXTRA = { week: 2, day: 3, start: 16, course: "Data Mining" } as const;

const blockBox = (day: number, start: number, length: number) => ({
  left: PAD + day * (DAY_W + DAY_GAP),
  top: GRID_TOP + (start - 9) * HOUR + 2,
  width: DAY_W,
  height: length * HOUR - 4,
});

/*
 * Colours the timeline tweens, as plain hex and rgb (GSAP interpolates these,
 * not CSS variables). They match the tokens in globals.css.
 */
const ACCENT = "#c8305f";
const ACCENT_SOFT = "rgba(200, 48, 95, 0.09)";
const FAINT = "#8f97a6";
const SHADOW_1 =
  "0 1px 1px rgba(16, 24, 40, 0.04), 0 2px 8px -2px rgba(16, 24, 40, 0.06)";
/** The callout's edge: a hairline, then the accent once the class is missed. */
const CHIP_SHADOW = `inset 0 0 0 1px rgba(16, 24, 40, 0.08), ${SHADOW_1}`;
const CHIP_SHADOW_MISSED = `inset 0 0 0 1.5px rgba(200, 48, 95, 0.45), ${SHADOW_1}`;

/*
 * The regular schedule is drawn in quiet slate tints, one per course, so the
 * repeating pattern still reads while the accent stays for the extra class.
 */
const SLATES = [
  { fill: "#dde1e8", ring: "#c3c9d4" },
  { fill: "#e6e9ee", ring: "#ccd1da" },
  { fill: "#d3d8e1", ring: "#b9c0cc" },
] as const;
const COURSES = [...new Set(WEEK.map(([, , , c]) => c))];
const slateTone = (course: string) =>
  SLATES[COURSES.indexOf(course) % SLATES.length]!;

const extraBox = blockBox(EXTRA.day, EXTRA.start, 1);
/** Centre of the extra class, across the whole box. */
const EXTRA_X = EXTRA.week * (WEEK_W + WEEK_GAP) + extraBox.left + DAY_W / 2;

/**
 * A student's month at a glance: the same classes every week, then the one
 * week that is different.
 *
 * Builds (steps = 3):
 *   0: four ordinary weeks fill in, identical.
 *   1: an extra class lands in week three, announced only by mail.
 *   2: it is missed: the block turns to the accent, with the share of
 *      students who missed one (a placeholder number).
 */
export function WeekPattern({
  step,
  active,
  stat = {
    value: <Ph>9 of 14</Ph>,
    label: "students missed an extra class this term",
  },
}: WeekPatternProps) {
  const root = useRef<HTMLDivElement>(null);
  const { instant } = useDeckRuntime();
  const introduced = useRef(false);
  const intro = useRef<gsap.core.Timeline | null>(null);

  // Build 0 plays by itself: the weeks fill in one after another, at a
  // steady beat, the first time the slide is live.
  useGSAP(
    () => {
      if (!active || introduced.current) return;
      introduced.current = true;
      if (instant || step !== 0) return;
      const tl = gsap.timeline({ delay: 0.35 });
      intro.current = tl;
      for (let w = 0; w < WEEKS.length; w++) {
        tl.from(
          `[data-week="${w}"] .wk-block`,
          {
            autoAlpha: 0,
            y: -14,
            scale: 0.7,
            duration: 0.42,
            ease: "back.out(2)",
            stagger: 0.028,
          },
          w * 0.55,
        );
        tl.from(
          `[data-week="${w}"] .wk-label`,
          { color: FAINT, duration: 0.4, ease: "power2.out" },
          w * 0.55,
        );
      }
    },
    { scope: root, dependencies: [active] },
  );

  // Moving on before the month has filled in finishes it at once, so the
  // extra class never lands in a half-drawn week.
  useGSAP(
    () => {
      if (step > 0) intro.current?.progress(1);
    },
    { dependencies: [step] },
  );

  useSteps(root, step, (tl, mark) => {
    // 1: the extra class falls into week three, carrying its mail.
    tl.to(".wk-dim", { opacity: 0.38, duration: 0.6, ease: "power2.out" }, 0);
    tl.fromTo(
      ".wk-extra",
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.14, ease: "none" },
      0.1,
    );
    tl.fromTo(
      ".wk-extra",
      { y: -470 },
      { y: 0, duration: 0.62, ease: "power2.in" },
      0.1,
    );
    tl.to(".wk-extra-body", {
      scaleY: 0.78,
      scaleX: 1.16,
      transformOrigin: "50% 100%",
      duration: 0.08,
      ease: "power1.out",
    });
    tl.to(".wk-extra-body", {
      scaleY: 1,
      scaleX: 1,
      duration: 0.5,
      ease: "elastic.out(1, 0.45)",
    });
    tl.fromTo(
      ".wk-ripple",
      { autoAlpha: 0.9, scale: 1 },
      { autoAlpha: 0, scale: 2.1, duration: 0.7, ease: "power2.out" },
      "<-0.05",
    );
    tl.fromTo(
      ".wk-badge",
      { scale: 0, autoAlpha: 0 },
      { scale: 1, autoAlpha: 1, duration: 0.4, ease: "back.out(2.4)" },
      "<",
    );
    tl.fromTo(
      ".wk-link",
      { scaleY: 0 },
      {
        scaleY: 1,
        transformOrigin: "50% 0%",
        duration: 0.4,
        ease: "deck.enter",
      },
      "<0.1",
    );
    tl.fromTo(
      ".wk-chip",
      { autoAlpha: 0, y: -16 },
      { autoAlpha: 1, y: 0, duration: 0.55, ease: "deck.enter" },
      "<0.2",
    );
    mark();

    // 2: and it is the one that gets missed.
    tl.to(".wk-extra-fill", {
      autoAlpha: 0,
      duration: 0.4,
      ease: "power2.out",
    });
    tl.fromTo(
      ".wk-missed",
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.4, ease: "power2.out" },
      "<",
    );
    tl.fromTo(
      ".wk-cross",
      { scale: 0, rotation: -90 },
      { scale: 1, rotation: 0, duration: 0.5, ease: "back.out(2)" },
      "<0.1",
    );
    tl.to(
      ".wk-extra-body",
      { keyframes: { x: [0, -5, 5, -4, 3, 0] }, duration: 0.45, ease: "none" },
      "<",
    );
    tl.to(
      ".wk-badge",
      { autoAlpha: 0, scale: 0.4, duration: 0.3, ease: "power2.in" },
      "<",
    );
    tl.to(".wk-link", { backgroundColor: ACCENT, duration: 0.4 }, "<");
    tl.to(".wk-chip", { boxShadow: CHIP_SHADOW_MISSED, duration: 0.4 }, "<");
    tl.to(
      ".wk-chip-icon",
      { backgroundColor: ACCENT_SOFT, color: ACCENT, duration: 0.4 },
      "<",
    );
    tl.fromTo(
      ".wk-stat",
      { autoAlpha: 0, y: 28 },
      { autoAlpha: 1, y: 0, duration: 0.7, ease: "deck.enter" },
      "<0.15",
    );
    mark();
  });

  return (
    <div
      ref={root}
      className="relative flex h-full w-full flex-col justify-center"
    >
      <div className="relative flex" style={{ gap: WEEK_GAP }}>
        {WEEKS.map((dates, w) => (
          <div
            key={dates}
            data-week={w}
            className={`relative shrink-0 ${w === EXTRA.week ? "" : "wk-dim"}`}
            style={{ width: WEEK_W }}
          >
            <div className="flex items-baseline justify-between px-1.5">
              <span className="wk-label font-display text-fg text-[26px] font-semibold tracking-[-0.02em]">
                Week {w + 1}
              </span>
              <span className="t-label tabular text-muted">{dates}</span>
            </div>
            <Card className="mt-4" style={{ height: CARD_H }}>
              {/* Day initials and the hour lines */}
              {["M", "T", "W", "T", "F"].map((d, i) => (
                <span
                  key={i}
                  className="text-muted absolute text-center text-[20px] font-medium"
                  style={{
                    left: PAD + i * (DAY_W + DAY_GAP),
                    width: DAY_W,
                    top: 15,
                  }}
                >
                  {d}
                </span>
              ))}
              {Array.from({ length: HOURS + 1 }, (_, h) => (
                <span
                  key={h}
                  className="absolute h-px"
                  style={{
                    left: PAD,
                    right: PAD,
                    top: GRID_TOP + h * HOUR,
                    background: h === 4 ? "var(--line-strong)" : "var(--line)",
                  }}
                />
              ))}

              {WEEK.map(([day, start, length, course], i) => {
                const tone = slateTone(course);
                return (
                  <span
                    key={i}
                    className="wk-block absolute rounded-[9px]"
                    style={{
                      ...blockBox(day, start, length),
                      background: tone.fill,
                      boxShadow: `inset 0 0 0 1.5px ${tone.ring}`,
                    }}
                  />
                );
              })}

              {w === EXTRA.week && <ExtraClass />}
            </Card>
          </div>
        ))}
      </div>

      {/* The callout hangs from the extra class, under week three. */}
      <div className="relative" style={{ height: 100 }}>
        <span
          className="wk-link absolute w-0.5 rounded-full"
          style={{
            left: EXTRA_X - 1,
            top: -(CARD_H - extraBox.top - extraBox.height) - 2,
            height: CARD_H - extraBox.top - extraBox.height + 40,
            background: "rgba(200, 48, 95, 0.34)",
          }}
        />
        <div
          className="wk-chip bg-raised absolute flex items-center gap-4 rounded-[22px] py-3 pr-7 pl-3"
          style={{ top: 30, right: 0, boxShadow: CHIP_SHADOW }}
        >
          <span
            className="wk-chip-icon bg-sunken text-body flex h-12 w-12 items-center justify-center rounded-[12px]"
            style={{ backgroundColor: "#e7e9ee", color: "#353d4a" }}
          >
            <Icon name="mail" size={26} />
          </span>
          <span className="t-body text-fg whitespace-nowrap">
            Announced by email only
          </span>
        </div>
      </div>

      <div className="wk-stat mt-6 flex items-center gap-7">
        <span className="font-display text-accent tabular text-[88px] leading-none font-semibold tracking-[-0.04em] whitespace-nowrap">
          {stat.value}
        </span>
        <span className="t-body text-body max-w-[19ch] leading-snug">
          {stat.label}
        </span>
      </div>
    </div>
  );
}

/** The extra class, in its slot, with everything its builds need. */
function ExtraClass() {
  return (
    <div
      className="wk-extra absolute z-10"
      style={{ ...extraBox, visibility: "hidden" }}
    >
      <span
        className="wk-ripple absolute inset-0 rounded-[9px]"
        style={{ boxShadow: `0 0 0 2px ${ACCENT}`, visibility: "hidden" }}
      />
      <div className="wk-extra-body absolute inset-0">
        <span
          className="wk-extra-fill absolute inset-0 rounded-[9px]"
          style={{
            background: "#f3d6e0",
            boxShadow: `inset 0 0 0 1.5px ${ACCENT}, 0 0 0 3px #fbfbfd, 0 0 0 5px ${ACCENT}, 0 8px 18px -8px rgba(16, 24, 40, 0.22)`,
          }}
        />
        <span
          className="wk-missed absolute inset-0 flex items-center justify-center rounded-[9px]"
          style={{
            background: "rgba(200, 48, 95, 0.12)",
            outline: `2px dashed ${ACCENT}`,
            outlineOffset: -2,
            visibility: "hidden",
          }}
        >
          <span className="wk-cross text-accent flex">
            <Icon name="x" size={26} weight="bold" />
          </span>
        </span>
      </div>
      <span
        className="wk-badge absolute flex h-7.5 w-7.5 items-center justify-center rounded-full"
        style={{
          right: -16,
          top: -16,
          background: ACCENT,
          color: "#ffffff",
          boxShadow: "0 0 0 3px #fbfbfd",
          visibility: "hidden",
        }}
      >
        <Icon name="mail" size={17} weight="bold" />
      </span>
    </div>
  );
}
