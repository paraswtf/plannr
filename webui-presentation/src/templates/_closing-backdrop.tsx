"use client";

import { useRef } from "react";

import { gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";

import { ACCENT, BRAND, seeded } from "./_closing-motion";

/**
 * The bookends' backdrop: a week of class blocks laid on a tilted plane,
 * each day's column drifting slowly upward at its own pace, like a timetable
 * scrolling past on a desk. Quiet on purpose: pale paper blocks with a
 * hairline, a few touched with slate and fewer still with the accent, and
 * masked away from the type so it never competes with it.
 *
 * Drifts only while the slide is `active`; stands still in `instant` mode.
 */

const COLUMNS = 7;
const COL_W = 196;
const GAP = 20;
const BLOCKS_PER_COL = 9;

/* Mostly slate, the app's own class colour; the accent now and then. */
const TONES = [BRAND.slate, BRAND.slate, BRAND.slate, ACCENT] as const;

interface Block {
  h: number;
  tone: string | null;
  /** Width of the two text bars, as a share of the block. */
  w1: number;
  w2: number;
}

function buildColumns(seed: number): Block[][] {
  const rnd = seeded(seed);
  const heights = [104, 136, 136, 176, 232];
  return Array.from({ length: COLUMNS }, () =>
    Array.from({ length: BLOCKS_PER_COL }, () => {
      const r = rnd();
      return {
        h: heights[Math.floor(rnd() * heights.length)] ?? 136,
        tone:
          r < 0.3 ? (TONES[Math.floor(rnd() * TONES.length)] ?? null) : null,
        w1: 0.5 + rnd() * 0.32,
        w2: 0.26 + rnd() * 0.2,
      };
    }),
  );
}

export function TimetableDrift({
  active,
  variant = "cover",
  seed = 7,
}: {
  active: boolean;
  variant?: "cover" | "thanks";
  seed?: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { instant } = useDeckRuntime();
  const columns = useRef(buildColumns(seed)).current;

  useGSAP(
    () => {
      if (instant || !active) return;
      const strips = gsap.utils.toArray<HTMLElement>(".td-strip", root.current);
      strips.forEach((strip, i) => {
        // The strip holds the column twice; one period is one copy and a gap.
        const period = (strip.offsetHeight + GAP) / 2;
        const start = -period * ((i * 0.29) % 1);
        // 9-15 canvas px a second: slow enough to read as calm, never still.
        const speed = 9 + ((i * 37) % 7);
        gsap.fromTo(
          strip,
          { y: start },
          {
            y: start - period,
            duration: period / speed,
            ease: "none",
            repeat: -1,
          },
        );
      });
    },
    { scope: root, dependencies: [active, instant] },
  );

  const mask =
    variant === "cover"
      ? "linear-gradient(90deg, transparent 48%, rgba(0,0,0,0.45) 66%, #000 88%)"
      : "radial-gradient(ellipse 50% 56% at 50% 48%, transparent 48%, rgba(0,0,0,0.55) 76%, #000 100%)";

  return (
    <div
      ref={root}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ WebkitMaskImage: mask, maskImage: mask }}
    >
      <div
        className="absolute inset-0"
        style={{
          WebkitMaskImage:
            "linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)",
          maskImage:
            "linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)",
        }}
      >
        <div
          className="absolute flex"
          style={{
            gap: GAP,
            left: variant === "cover" ? 760 : 160,
            top: -620,
            height: 2300,
            transform: "perspective(2400px) rotateX(38deg) rotateZ(-24deg)",
            transformOrigin: "50% 50%",
            opacity: variant === "cover" ? 0.9 : 0.7,
          }}
        >
          {columns.map((blocks, c) => (
            <div
              key={c}
              className="relative overflow-visible"
              style={{ width: COL_W }}
            >
              <div className="td-strip flex flex-col" style={{ gap: GAP }}>
                {[0, 1].map((copy) =>
                  blocks.map((b, i) => (
                    <DriftBlock key={`${copy}-${i}`} block={b} />
                  )),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DriftBlock({ block }: { block: Block }) {
  const { h, tone, w1, w2 } = block;
  // Paper blocks on the light ground: raised white, a hairline, the softest
  // shadow. A toned block is only washed with its colour, never filled.
  const fill = tone ? `color-mix(in srgb, ${tone} 7%, #fbfbfd)` : "#fbfbfd";
  const ring = tone
    ? `color-mix(in srgb, ${tone} 20%, transparent)`
    : "rgba(16, 24, 40, 0.07)";
  const bar = tone
    ? `color-mix(in srgb, ${tone} 22%, transparent)`
    : "rgba(16, 24, 40, 0.08)";
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[22px]"
      style={{
        height: h,
        background: fill,
        boxShadow: `inset 0 0 0 1px ${ring}, 0 1px 2px rgba(16, 24, 40, 0.04), 0 10px 24px -14px rgba(16, 24, 40, 0.12)`,
      }}
    >
      {tone && (
        <span
          className="absolute top-[14px] bottom-[14px] left-[12px] w-[5px] rounded-full"
          style={{ background: tone, opacity: 0.45 }}
        />
      )}
      <span
        className="absolute top-[22px] left-[30px] h-[12px] rounded-full"
        style={{
          width: `${w1 * 100}%`,
          maxWidth: COL_W - 52,
          background: bar,
        }}
      />
      <span
        className="absolute top-[46px] left-[30px] h-[10px] rounded-full"
        style={{
          width: `${w2 * 100}%`,
          background: tone ? bar : "rgba(16, 24, 40, 0.05)",
          opacity: 0.7,
        }}
      />
    </div>
  );
}
