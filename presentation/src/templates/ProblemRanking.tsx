"use client";

import { Fragment, useRef, type ReactNode } from "react";

import {
  problemScore,
  rankProblems,
  type Persona,
  type Problem,
} from "~/content/types";
import type { StakeholderId } from "~/deck/types";
import { useSteps } from "~/deck/useSteps";
import { Icon } from "~/ui/icon";
import { SlideBody, SlideHeader } from "~/ui/layout";

import { TEXT_TONE } from "./_problem-tone";

export interface ProblemRankingProps {
  stakeholder: StakeholderId;
  eyebrow?: ReactNode;
  title: ReactNode;
  /** The same problems as the ProblemBoard before it, in the same order. */
  problems: Problem[];
  /** The section's personas: one reach column each. */
  personas: Pick<Persona, "id" | "name" | "icon">[];
  /** How many of the top problems to call out once sorted. Default 3. */
  top?: number;
  /**
   * 0: the problems as told. 1: who runs into each (reach). 2: how much it
   * hurts (severity). 3: sorted by reach × severity, top ones lit.
   * Steps = 4.
   */
  step: number;
}

/*
 * The table is laid out on fixed canvas columns, so every row lines up with
 * its header and a row can travel to another row's place exactly.
 *
 *   rank | problem cell | reach (one column per persona) | severity | score
 */
const W = 1664;
const RANK_W = 60;
const RANK_GAP = 18;
const GROUP_GAP = 44;
const SEG = { w: 16, h: 30, gap: 8 } as const;
const METER_W = 5 * SEG.w + 4 * SEG.gap;
const SCORE_W = 168;
/** The height under the header that the rows may use. */
const ROWS_AREA = 668;
/**
 * Space between the title and the first row. The column heads stand in it,
 * beside the title, so it is tall enough that they clear the top bar.
 */
const HEAD_BAND = 82;

const reachColumn = (count: number) =>
  count >= 4 ? 126 : count === 3 ? 150 : 168;
/** "The Just-in-time" → "Just-in-time", each word kept whole (no break at a hyphen). */
const shortName = (name: string) =>
  name
    .replace(/^The\s+/i, "")
    .split(" ")
    .map((word, i) => (
      <Fragment key={i}>
        {i > 0 && " "}
        <span className="whitespace-nowrap">{word}</span>
      </Fragment>
    ));

/**
 * The problems, ranked in front of the audience: reach across the personas,
 * times severity, then every row physically travels to its ranked place.
 *
 * Rows carry flip id `${stakeholder}-problem-${id}`, shared with the notes on
 * ProblemBoard before and the problem cells on SolutionMap after. The flip
 * element (the problem cell) is never tweened: the sort moves the row around
 * it, and the highlight and dimming are drawn by its children.
 */
export function ProblemRanking({
  stakeholder,
  eyebrow,
  title,
  problems,
  personas,
  top = 3,
  step,
}: ProblemRankingProps) {
  const root = useRef<HTMLDivElement>(null);
  const ranked = rankProblems(problems);
  const rankOf = new Map(ranked.map((p, i) => [p.id, i]));
  const count = problems.length;
  const pitch = Math.min(96, Math.floor(ROWS_AREA / Math.max(1, count)));
  const rowGap = Math.max(10, Math.round(pitch * 0.15));
  const rowH = pitch - rowGap;

  const colW = reachColumn(personas.length);
  const reachW = colW * personas.length;
  const cellX = RANK_W + RANK_GAP;
  const cellW =
    W - cellX - GROUP_GAP - reachW - GROUP_GAP - METER_W - GROUP_GAP - SCORE_W;
  const reachX = cellX + cellW + GROUP_GAP;
  const meterX = reachX + reachW + GROUP_GAP;
  const scoreX = meterX + METER_W + GROUP_GAP;

  useSteps(root, step, (tl, mark) => {
    const scope = root.current;
    if (!scope) return;
    const rowOf = (id: string) =>
      scope.querySelector<HTMLElement>(`[data-rank-row="${id}"]`);

    // 1. Reach: who runs into it. The persona heads rise in, then a dot
    // lands wherever that persona has the problem.
    tl.from(".pr-head-reach", {
      autoAlpha: 0,
      y: 18,
      duration: 0.55,
      ease: "deck.enter",
      stagger: 0.07,
    });
    tl.from(
      ".pr-miss",
      { autoAlpha: 0, duration: 0.4, ease: "power1.out" },
      "<0.15",
    );
    tl.from(
      ".pr-hit",
      {
        scale: 0,
        autoAlpha: 0,
        duration: 0.42,
        ease: "back.out(2.6)",
        stagger: 0.028,
      },
      "<",
    );
    mark();

    // 2. Severity: five empty pips per row, then each row's pips rise to its
    // level, one after another.
    tl.from(".pr-head-sev", {
      autoAlpha: 0,
      y: 18,
      duration: 0.55,
      ease: "deck.enter",
    });
    tl.from(
      ".pr-track",
      { autoAlpha: 0, duration: 0.35, ease: "power1.out", stagger: 0.03 },
      "<0.1",
    );
    tl.from(
      ".pr-seg-on",
      {
        scaleY: 0,
        transformOrigin: "50% 100%",
        duration: 0.2,
        ease: "back.out(1.8)",
        stagger: 0.026,
      },
      "<0.12",
    );
    mark();

    // 3. Score, then the sort.
    tl.from(".pr-head-score", {
      autoAlpha: 0,
      y: 18,
      duration: 0.5,
      ease: "deck.enter",
    });
    tl.from(
      ".pr-score",
      {
        autoAlpha: 0,
        x: 18,
        duration: 0.45,
        ease: "deck.enter",
        stagger: 0.04,
      },
      "<0.05",
    );
    tl.fromTo(
      ".pr-score-n",
      { innerText: 0 },
      {
        innerText: (_: number, el: HTMLElement) =>
          Number(el.dataset.score ?? 0),
        snap: { innerText: 1 },
        duration: 0.6,
        ease: "power2.out",
        stagger: 0.04,
      },
      "<",
    );

    // Every row travels from where it was told to where it ranks, starting
    // while the scores are still counting. Rows that climb pass over the
    // ones they overtake, and swing out a little as they are pulled out.
    tl.addLabel("sort", "<0.35");
    const SORT = 1;
    const STAGGER = 0.045;
    problems.forEach((p, told) => {
      const rank = rankOf.get(p.id) ?? told;
      const row = rowOf(p.id);
      if (!row || rank === told) return;
      const at = `sort+=${rank * STAGGER}`;
      const climbs = rank < told;
      tl.set(row, { zIndex: climbs ? 3 : 2 }, at);
      tl.to(
        row,
        { y: (rank - told) * pitch, duration: SORT, ease: "deck.morph" },
        at,
      );
      if (climbs) {
        tl.to(
          row,
          {
            x: 30,
            duration: SORT / 2,
            ease: "sine.inOut",
            yoyo: true,
            repeat: 1,
          },
          at,
        );
      }
    });
    // The payoff lands as the last rows settle, not after.
    const settled = `sort+=${SORT * 0.7 + (count - 1) * STAGGER}`;
    tl.from(
      ".pr-rank-n",
      {
        autoAlpha: 0,
        x: -16,
        duration: 0.4,
        ease: "deck.enter",
        stagger: 0.03,
      },
      settled,
    );
    tl.to(
      ".pr-light",
      { opacity: 1, duration: 0.45, ease: "power2.out", stagger: 0.03 },
      settled,
    );
    tl.to(
      ".pr-dim",
      { opacity: 0.5, duration: 0.45, ease: "power2.out" },
      settled,
    );
    mark();
  });

  return (
    <SlideBody>
      <SlideHeader
        eyebrow={eyebrow}
        title={title}
        titleClassName="max-w-[760px]"
      />
      <div
        ref={root}
        className="relative"
        style={{ width: W, height: count * pitch, marginTop: HEAD_BAND }}
      >
        {/* Column heads sit in the band beside the title, above the rows. */}
        <div
          className="absolute bottom-full mb-5"
          style={{ left: reachX, width: reachW }}
        >
          <HeadLabel className="pr-head-reach">Reach</HeadLabel>
          <div className="mt-4 flex">
            {personas.map((g) => (
              <div
                key={g.id}
                className="pr-head-reach flex flex-col items-center gap-2 text-center"
                style={{ width: colW }}
              >
                <Icon
                  name={g.icon}
                  size={32}
                  stroke={1.5}
                  className="text-muted"
                />
                <span className="font-display text-fg line-clamp-2 min-h-[52px] px-1 text-[22px] leading-[1.15] font-medium tracking-[-0.01em] text-balance">
                  {shortName(g.name)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div
          className="pr-head-sev absolute bottom-full mb-5"
          style={{ left: meterX, width: METER_W + GROUP_GAP / 2 }}
        >
          <HeadLabel>Severity</HeadLabel>
          <p className="text-muted mt-4 flex min-h-[90px] items-end text-[22px] leading-[1.2]">
            how much it hurts, of 5
          </p>
        </div>
        <div
          className="pr-head-score absolute bottom-full mb-5 text-right"
          style={{ left: scoreX, width: SCORE_W }}
        >
          <HeadLabel className="justify-end">Score</HeadLabel>
          <p className="text-muted mt-4 flex min-h-[90px] items-end justify-end text-[22px] leading-[1.2]">
            reach × severity
          </p>
        </div>

        {/* Rank numbers belong to places, not to rows: the rows arrive in them. */}
        {ranked.map((p, i) => (
          <span
            key={p.id}
            data-flip-id={`${stakeholder}-rank-${i}`}
            className={`font-display tabular absolute inline-block text-[40px] font-semibold tracking-[-0.03em] ${i < top ? TEXT_TONE[stakeholder] : "text-faint"}`}
            style={{ left: 0, top: i * pitch, width: RANK_W, height: rowH }}
          >
            <span className="pr-rank-n flex h-full w-full items-center justify-center">
              {i + 1}
            </span>
          </span>
        ))}

        {problems.map((p, told) => {
          const rank = rankOf.get(p.id) ?? told;
          const lit = rank < top;
          return (
            <div
              key={p.id}
              data-rank-row={p.id}
              className="absolute left-0 z-[1]"
              style={{ top: told * pitch, width: W, height: rowH }}
            >
              {/*
               * An opaque backing over the row's whole pitch, so a row passing
               * over another hides it, with the hairline that rules the table.
               */}
              <span
                aria-hidden
                className="bg-bg absolute right-0"
                style={{
                  left: cellX - 10,
                  top: -rowGap / 2,
                  bottom: -rowGap / 2,
                  boxShadow: "inset 0 -1px 0 var(--line)",
                }}
              />
              <div
                data-flip-id={`${stakeholder}-problem-${p.id}`}
                className="bg-bg text-fg absolute flex items-center"
                style={{
                  left: cellX,
                  top: 0,
                  width: cellW,
                  height: rowH,
                  padding: "0 24px",
                  borderRadius: 12,
                }}
              >
                {lit && (
                  <span
                    aria-hidden
                    className="pr-light bg-accent-soft pointer-events-none absolute inset-0 rounded-[12px]"
                    style={{ opacity: 0 }}
                  />
                )}
                <span
                  className={`relative line-clamp-2 text-[28px] leading-[1.18] font-medium tracking-[-0.005em] ${lit ? "" : "pr-dim"}`}
                >
                  {p.text}
                </span>
              </div>

              <div
                className={`absolute top-0 flex h-full ${lit ? "" : "pr-dim"}`}
                style={{ left: reachX, width: reachW }}
              >
                {personas.map((g) => (
                  <div
                    key={g.id}
                    className="flex h-full items-center justify-center"
                    style={{ width: colW }}
                  >
                    {p.personas.includes(g.id) ? (
                      <span className="pr-hit bg-muted block h-[20px] w-[20px] rounded-full" />
                    ) : (
                      <span className="pr-miss bg-line-strong block h-[8px] w-[8px] rounded-full" />
                    )}
                  </div>
                ))}
              </div>

              {/* Severity as pips: a filled mark per level, an empty outline for the rest. */}
              <div
                className={`pr-track absolute top-0 flex h-full items-center ${lit ? "" : "pr-dim"}`}
                style={{ left: meterX, width: METER_W, gap: SEG.gap }}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className="relative flex shrink-0 items-end justify-center"
                    style={{ width: SEG.w, height: SEG.h }}
                  >
                    {n <= p.severity ? (
                      <span
                        className="pr-seg-on bg-muted block h-full w-full"
                        style={{ borderRadius: 4 }}
                      />
                    ) : (
                      <span
                        className="ring-strong block h-full w-full"
                        style={{ borderRadius: 4 }}
                      />
                    )}
                  </span>
                ))}
              </div>

              <div
                className={`pr-score absolute top-0 flex h-full items-center justify-end gap-4 ${lit ? "" : "pr-dim"}`}
                style={{ left: scoreX, width: SCORE_W }}
              >
                <span className="t-mono text-muted text-[22px]">
                  {p.personas.length}×{p.severity}
                </span>
                <span className="font-display tabular text-fg relative inline-block w-[64px] text-right text-[44px] leading-none font-semibold tracking-[-0.03em]">
                  <span className="pr-score-n" data-score={problemScore(p)}>
                    {problemScore(p)}
                  </span>
                  {/* The top scores take the accent once the sort lands. */}
                  {lit && (
                    <span
                      aria-hidden
                      className="pr-score-n pr-light text-accent bg-bg absolute inset-0"
                      data-score={problemScore(p)}
                      style={{ opacity: 0 }}
                    >
                      {problemScore(p)}
                    </span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </SlideBody>
  );
}

function HeadLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`font-display text-fg flex items-center gap-3 border-b pb-2.5 text-[24px] leading-[1.2] font-medium tracking-[-0.01em] ${className ?? ""}`}
      style={{ borderColor: "var(--line-strong)" }}
    >
      {children}
    </p>
  );
}
