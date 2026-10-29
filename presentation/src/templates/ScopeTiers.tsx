"use client";

import { useRef, type ReactNode } from "react";

import { SCOPE, type Scope } from "~/content/types";
import type { gsap } from "~/deck/gsap";
import { useSteps } from "~/deck/useSteps";
import type { IconName } from "~/ui/icon";
import { SlideBody, SlideHeader } from "~/ui/layout";
import { Chip } from "~/ui/surfaces";

import { useArrival } from "./_research-motion";

export interface ScopeTier {
  scope: Scope;
  /** What falls in it, each with an icon. */
  items: { icon: IconName; label: ReactNode }[];
}

export interface ScopeTiersProps {
  title: ReactNode;
  /** Core, secondary and future, in that order. */
  tiers: ScopeTier[];
  /** The line the last build reveals: how scope joins the score. */
  formula: ReactNode;
  /**
   * 0: core. 1: secondary rises in. 2: future rises in. 3: the formula.
   * Steps = tiers.length + 1.
   */
  step: number;
  /** False while the slide is leaving or previewed: the arrival waits for it. */
  active?: boolean;
}

/** What each tier means for the work, under its name. */
const TIER_NOTE: Record<Scope, string> = {
  core: "The heart of the job",
  secondary: "Then, once the core works",
  future: "A far stretch, for later",
};

/** Plain values for tweened colours (GSAP cannot tween a var()). */
const PIP_INK = "#353d4a";
const PIP_ACCENT = "#c8305f";

/**
 * What the project sets out to automate, as three tiers of weight.
 *
 * Core arrives on its own, on a raised card: the heart of the job, with its
 * items as solid chips. Secondary rises in beneath it as a plain row, and
 * future last, quieter still: dashed chips at lower contrast, a far stretch.
 * Each tier's weight is five pips, filled 5, 3 or 1. The last build brings
 * the formula up from the foot of the slide, and as "scope" lights in the
 * accent, so do the filled pips: the weight is the scope in the score.
 */
export function ScopeTiers({
  title,
  tiers,
  formula,
  step,
  active = true,
}: ScopeTiersProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Arrival: the first tier (core) builds itself.
  useArrival(ref, { active, step }, (tl) => {
    const root = ref.current;
    const first = root?.querySelector<HTMLElement>(".st-tier");
    if (!first) return;
    revealTier(tl, first, 0.25, true);
  });

  // Builds: each further tier, then the formula.
  useSteps(ref, step, (tl, mark) => {
    const root = ref.current;
    if (!root) return;
    const rows = Array.from(root.querySelectorAll<HTMLElement>(".st-tier"));
    // Each tier starts where the last build ended, so a build reveals one.
    rows.slice(1).forEach((row) => {
      revealTier(tl, row, tl.duration(), false);
      mark();
    });

    const formulaEl = root.querySelector<HTMLElement>(".st-formula");
    if (!formulaEl) return;
    const at = tl.duration();
    tl.from(
      formulaEl.querySelector(".st-formula-rule"),
      {
        scaleX: 0,
        duration: 1,
        ease: "deck.enter",
        transformOrigin: "0% 50%",
      },
      at,
    );
    tl.from(
      formulaEl.querySelector(".st-formula-text"),
      { y: 56, opacity: 0, duration: 0.9, ease: "deck.enter" },
      at + 0.1,
    );
    // "scope" lights last, and the filled pips with it.
    const word = formulaEl.querySelectorAll(".text-accent");
    if (word.length) {
      tl.from(
        word,
        { color: "#10141b", duration: 0.6, ease: "power2.out" },
        at + 0.75,
      );
    }
    tl.fromTo(
      root.querySelectorAll(".st-pip-on"),
      { backgroundColor: PIP_INK },
      {
        backgroundColor: PIP_ACCENT,
        duration: 0.6,
        ease: "power2.out",
        stagger: 0.03,
      },
      at + 0.8,
    );
    mark();
  });

  return (
    <SlideBody>
      <SlideHeader title={title} titleClassName="max-w-none!" />
      <div ref={ref} className="mt-14 flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col">
          {tiers.map((t, i) => (
            <TierRow key={t.scope} tier={t} lead={i === 0} rule={i > 1} />
          ))}
        </div>

        <div className="st-formula mt-auto">
          <span
            className="st-formula-rule bg-line-strong block h-px w-full"
            aria-hidden
          />
          <p
            className="st-formula-text font-display text-fg pt-8 text-[44px] leading-[1.1] font-medium tracking-tight"
            style={{ paddingLeft: ROW_PAD_X }}
          >
            {formula}
          </p>
        </div>
      </div>
    </SlideBody>
  );
}

/** Left padding of every row, so names, rows and the formula share a line. */
const ROW_PAD_X = 40;
const NAME_W = 380;
const WEIGHT_W = 210;

function TierRow({
  tier,
  lead,
  rule,
}: {
  tier: ScopeTier;
  lead: boolean;
  /** A hairline above the row (not right under the card). */
  rule: boolean;
}) {
  const { label, weight } = SCOPE[tier.scope];
  const future = tier.scope === "future";

  const content = (
    <div
      className="grid items-center"
      style={{
        gridTemplateColumns: `${NAME_W}px ${WEIGHT_W}px 1fr`,
        paddingLeft: ROW_PAD_X,
        paddingRight: ROW_PAD_X,
      }}
    >
      <div className="flex flex-col">
        <span
          className={`st-name t-h2 inline-block self-start ${future ? "text-muted" : "text-fg"}`}
        >
          {label}
        </span>
        <span className="st-note t-small text-muted mt-2 inline-block self-start text-[24px]">
          {TIER_NOTE[tier.scope]}
        </span>
      </div>

      <div className="st-weight flex flex-col gap-3">
        <span className="flex gap-2" aria-hidden>
          {[1, 2, 3, 4, 5].map((n) =>
            n <= weight ? (
              <span
                key={n}
                className="st-pip st-pip-on block h-4.5 w-7.5"
                style={{ borderRadius: 5, backgroundColor: PIP_INK }}
              />
            ) : (
              <span
                key={n}
                className="st-pip ring-strong block h-4.5 w-7.5"
                style={{ borderRadius: 5 }}
              />
            ),
          )}
        </span>
        <span className="st-weight-label t-small text-muted tabular">
          {weight} of 5
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {tier.items.map((it, i) =>
          lead ? (
            <Chip
              key={i}
              icon={it.icon}
              size={26}
              className="st-chip text-fg! bg-raised! shadow-[inset_0_0_0_1px_var(--line-strong),var(--shadow-1)]"
            >
              {it.label}
            </Chip>
          ) : future ? (
            <Chip
              key={i}
              icon={it.icon}
              size={26}
              className="st-chip text-muted! outline-line-strong bg-transparent! outline-[1.5px] outline-offset-[-1.5px] outline-dashed"
            >
              {it.label}
            </Chip>
          ) : (
            <Chip key={i} icon={it.icon} size={26} className="st-chip">
              {it.label}
            </Chip>
          ),
        )}
      </div>
    </div>
  );

  if (lead) {
    return (
      <div className="st-tier relative">
        <div className="st-card bg-raised absolute inset-0 rounded-[22px] shadow-[inset_0_0_0_1px_var(--line),var(--shadow-2)]" />
        <div className="relative py-12">{content}</div>
      </div>
    );
  }
  return (
    <div
      className={`st-tier relative ${future ? "opacity-70" : ""} ${rule ? "" : "mt-3"}`}
    >
      {rule && (
        <span
          className="st-rule bg-line-strong absolute inset-x-0 top-0 block h-px"
          aria-hidden
        />
      )}
      <div className="relative py-11">{content}</div>
    </div>
  );
}

/**
 * One tier building itself: its card or hairline first, then the name, the
 * pips filling left to right, the weight, and the chips one after another.
 */
function revealTier(
  tl: gsap.core.Timeline,
  row: HTMLElement,
  at: number,
  lead: boolean,
) {
  const q = (s: string) => row.querySelectorAll(s);
  if (lead) {
    tl.from(
      q(".st-card"),
      { y: 40, opacity: 0, duration: 0.9, ease: "deck.enter" },
      at,
    );
  } else if (q(".st-rule").length) {
    tl.from(
      q(".st-rule"),
      {
        scaleX: 0,
        duration: 1,
        ease: "deck.enter",
        transformOrigin: "0% 50%",
      },
      at,
    );
  }
  tl.from(
    q(".st-name, .st-note"),
    { y: 36, opacity: 0, duration: 0.8, ease: "deck.enter", stagger: 0.08 },
    at + 0.12,
  );
  tl.from(
    q(".st-pip"),
    {
      scale: 0,
      opacity: 0,
      duration: 0.5,
      ease: "back.out(2)",
      stagger: 0.05,
      transformOrigin: "50% 50%",
    },
    at + 0.3,
  );
  tl.from(
    q(".st-weight-label"),
    { y: 14, opacity: 0, duration: 0.6, ease: "deck.enter" },
    at + 0.5,
  );
  tl.from(
    q(".st-chip"),
    { y: 28, opacity: 0, duration: 0.7, ease: "deck.enter", stagger: 0.07 },
    at + 0.35,
  );
}
