"use client";

import { useRef, type ReactNode } from "react";

import { STAKEHOLDERS } from "~/content/team";
import type { StakeholderId } from "~/deck/types";
import { useSteps } from "~/deck/useSteps";
import { SlideBody, SlideHeader } from "~/ui/layout";
import { Chip } from "~/ui/surfaces";

import { countUp, useArrival } from "./_research-motion";
import { IconTile, INK } from "./_stakeholder-parts";

export interface SampleGroup {
  stakeholder: StakeholderId;
  /** One or two big numbers with what they count: "10" "interviewed". */
  figures: { value: ReactNode; label: ReactNode }[];
  /** How: "In person and by phone", "12-23 September". */
  methods: ReactNode[];
  /**
   * A group we struck off: on the build its name is crossed out and the
   * verdict and the reason take the numbers' place. Give it no figures.
   */
  struck?: { verdict: ReactNode; reason: ReactNode };
}

export interface SampleOverviewProps {
  title: ReactNode;
  lede?: ReactNode;
  /** One per stakeholder, in the deck's order. */
  groups: SampleGroup[];
  /** Under the columns: where the numbers come from, or that they are projected. */
  footnote?: ReactNode;
  /**
   * The numbers count up on arrival. With a struck group, one build strikes
   * it off (steps = 2); otherwise there are no builds (steps = 1).
   */
  step: number;
  /** False while the slide is leaving or previewed: the count waits for it. */
  active?: boolean;
}

/** Space between a column's hairline and its content. */
const COL_PAD = 44;

/**
 * A struck name's ink, before and after. It greys back to the faint ink
 * QuestionsBoard's struck questions end on, so struck-off things look alike.
 */
const LIVE = INK.fg;
const STRUCK = INK.faint;

/**
 * Who the research heard from, one column per group.
 *
 * Each column is the stakeholder's icon and name, its head counts (the first
 * large, the second smaller) with what they count, and how we heard from
 * them as chips along the foot. Hairlines part the columns. On arrival the
 * columns build left to right: the hairline draws down, the name rises, and
 * the numbers count up as they rise (a number in a <Ph> counts too).
 *
 * A struck group arrives with its name alone. On the build an accent stroke
 * travels through the name, the name greys back, and the verdict and the
 * reason rise into the space the numbers would have taken.
 */
export function SampleOverview({
  title,
  lede,
  groups,
  footnote,
  step,
  active = true,
}: SampleOverviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const strikes = groups.some((g) => g.struck);

  useArrival(ref, { active, step }, (tl) => {
    const root = ref.current;
    if (!root) return;
    const restores: (() => void)[] = [];
    root.querySelectorAll(".so-col").forEach((col, i) => {
      const at = 0.2 + i * 0.16;
      const q = (s: string) => col.querySelectorAll(s);
      const rule = q(".so-rule");
      if (rule.length)
        tl.from(
          rule,
          {
            scaleY: 0,
            duration: 1.1,
            ease: "deck.enter",
            transformOrigin: "50% 0%",
          },
          at - 0.1,
        );
      tl.from(
        q(".so-head"),
        { y: 32, opacity: 0, duration: 0.8, ease: "deck.enter" },
        at,
      );
      q(".so-fig").forEach((fig, j) => {
        const fAt = at + 0.14 + j * 0.16;
        const num = fig.querySelector(".so-num");
        tl.from(
          num,
          { y: 48, opacity: 0, duration: 0.85, ease: "deck.enter" },
          fAt,
        );
        const restore =
          num && countUp(tl, num, { duration: 1.4, ease: "power3.out" }, fAt);
        if (restore) restores.push(restore);
        tl.from(
          fig.querySelector(".so-label"),
          { y: 16, opacity: 0, duration: 0.7, ease: "power3.out" },
          fAt + 0.2,
        );
      });
      // A struck column has no chips, and the footnote is optional: tween
      // only what is there (GSAP warns about an empty target).
      const chips = q(".so-chip");
      if (chips.length)
        tl.from(
          chips,
          {
            y: 18,
            opacity: 0,
            duration: 0.6,
            ease: "deck.enter",
            stagger: 0.07,
          },
          at + 0.55,
        );
    });
    const foot = root.querySelectorAll(".so-foot");
    if (foot.length)
      tl.from(
        foot,
        { y: 12, opacity: 0, duration: 0.7, ease: "deck.enter" },
        0.2 + groups.length * 0.16 + 0.5,
      );
    return () => restores.forEach((r) => r());
  });

  useSteps(
    ref,
    step,
    (tl, mark) => {
      if (!strikes) return;
      ref.current?.querySelectorAll(".so-col[data-struck]").forEach((col) => {
        const name = col.querySelector(".so-strike");
        tl.fromTo(
          name,
          { backgroundSize: "0% 3px" },
          {
            backgroundSize: "100% 3px",
            duration: 0.6,
            ease: "power3.out",
            immediateRender: true,
          },
          0,
        );
        tl.fromTo(
          name,
          { color: LIVE },
          {
            color: STRUCK,
            duration: 0.5,
            ease: "power1.out",
            immediateRender: true,
          },
          0.45,
        );
        tl.fromTo(
          col.querySelector(".so-icon"),
          { opacity: 1 },
          {
            opacity: 0.5,
            duration: 0.5,
            ease: "power1.out",
            immediateRender: true,
          },
          0.45,
        );
        tl.fromTo(
          col.querySelectorAll(".so-out > *"),
          { y: 28, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.8,
            ease: "deck.enter",
            stagger: 0.12,
            immediateRender: true,
          },
          0.55,
        );
      });
      mark();
    },
    [strikes],
  );

  return (
    <SlideBody>
      <SlideHeader title={title} lede={lede} titleClassName="max-w-none!" />
      <div ref={ref} className="mt-16 flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          {groups.map((g, i) => {
            const s = STAKEHOLDERS[g.stakeholder];
            const [first, ...rest] = g.figures;
            return (
              <div
                key={g.stakeholder}
                data-struck={g.struck ? "" : undefined}
                className="so-col relative flex min-w-0 flex-1 flex-col"
                style={{
                  paddingLeft: i === 0 ? 0 : COL_PAD,
                  paddingRight: COL_PAD,
                }}
              >
                {i > 0 && (
                  <span
                    className="so-rule bg-line-strong absolute inset-y-0 left-0 block w-px"
                    aria-hidden
                  />
                )}
                <div className="so-head flex items-center gap-5">
                  <IconTile
                    stakeholder={g.stakeholder}
                    size={30}
                    className="so-icon"
                  />
                  {/* One line always: a stroke drawn as a background would
                      fall between the lines of a wrapped name. */}
                  <span className="t-h3 text-fg font-semibold whitespace-nowrap">
                    {g.struck ? (
                      // A real stroke through the words, as QuestionsBoard
                      // strikes its questions: a background drawn left to right.
                      <span
                        className="so-strike"
                        style={{
                          backgroundImage:
                            "linear-gradient(var(--accent), var(--accent))",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "0 58%",
                          backgroundSize: "0% 3px",
                        }}
                      >
                        {s.title}
                      </span>
                    ) : (
                      s.title
                    )}
                  </span>
                </div>

                {g.struck && (
                  <div className="so-out mt-12 flex flex-col">
                    <span
                      className="font-display text-fg inline-block self-start font-semibold"
                      style={{
                        fontSize: 44,
                        lineHeight: 1.05,
                        letterSpacing: "-0.03em",
                      }}
                    >
                      {g.struck.verdict}
                    </span>
                    <span className="t-body text-muted mt-5 inline-block self-start">
                      {g.struck.reason}
                    </span>
                  </div>
                )}

                {first && (
                  <div className="so-fig mt-12 flex flex-col">
                    <span
                      className="so-num font-display text-fg inline-block self-start font-semibold tabular-nums"
                      style={{
                        fontSize: 120,
                        lineHeight: 0.9,
                        letterSpacing: "-0.05em",
                      }}
                    >
                      {first.value}
                    </span>
                    <span className="so-label t-body text-muted mt-4 inline-block self-start">
                      {first.label}
                    </span>
                  </div>
                )}
                {rest.map((f, j) => (
                  <div key={j} className="so-fig mt-9 flex flex-col">
                    <span
                      className="so-num font-display text-fg inline-block self-start font-semibold tabular-nums"
                      style={{
                        fontSize: 64,
                        lineHeight: 0.95,
                        letterSpacing: "-0.04em",
                      }}
                    >
                      {f.value}
                    </span>
                    <span className="so-label t-body text-muted mt-3 inline-block self-start">
                      {f.label}
                    </span>
                  </div>
                ))}

                <div className="mt-auto flex flex-col items-start gap-3 pt-10">
                  {g.methods.map((m, j) => (
                    <Chip key={j} size={22} className="so-chip">
                      {m}
                    </Chip>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {footnote && (
          <p className="so-foot t-small text-muted border-line mt-10 border-t pt-6">
            {footnote}
          </p>
        )}
      </div>
    </SlideBody>
  );
}
