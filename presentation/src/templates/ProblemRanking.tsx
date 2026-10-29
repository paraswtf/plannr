"use client";

import { useRef, type ReactNode } from "react";

import { Derived, ofText, pct, Pct } from "~/content/research";
import {
  baseScore,
  problemScore,
  rankProblems,
  SCOPE,
  share,
  type Problem,
} from "~/content/types";
import type { StakeholderId } from "~/deck/types";
import { useSteps } from "~/deck/useSteps";
import { SlideBody, SlideHeader } from "~/ui/layout";

import { TEXT_TONE } from "./_problem-tone";
import { LIT_CELL } from "./ProblemTrack";

export interface ProblemRankingProps {
  stakeholder: StakeholderId;
  title: ReactNode;
  /**
   * The problems in the order they arrive: as told (after the board), or by
   * reach (after a reach chart, `byReach`). Eight at most.
   */
  problems: Problem[];
  /** How many of the top problems to light once ranked. Default 3. */
  top?: number;
  /** One small line under the table: where reach and severity come from. */
  footnote?: ReactNode;
  /**
   * The line under the Reach head. Default "of the people we asked"; a
   * section whose reach is still an estimate says so here.
   */
  reachSub?: ReactNode;
  /**
   * 0: the problems as given. 1: reach (bars). 2: severity (pips).
   * 3: the score before scope, counting up, and the rows sort by it.
   * 4: scope (pips and a word). 5: the score recounts with scope, the rows
   * sort again, the ranks arrive and the top rows light.
   * Steps = 6.
   */
  step: number;
}

/*
 * The table is laid out on fixed canvas columns, so every row lines up with
 * its head and a row can travel to another row's place exactly.
 *
 *   rank | problem cell | reach | severity | scope | score
 */
const W = 1664;
const RANK_W = 60;
const RANK_GAP = 18;
const CELL_W = 714;
const GAP = 40;
const REACH_W = 250;
const SEV_W = 112;
const SCOPE_W = 230;
const SCORE_W = 120;

const CELL_X = RANK_W + RANK_GAP;
const REACH_X = CELL_X + CELL_W + GAP;
const SEV_X = REACH_X + REACH_W + GAP;
const SCOPE_X = SEV_X + SEV_W + GAP;
const SCORE_X = SCOPE_X + SCOPE_W + GAP;

const BAR_W = 160;
const BAR_H = 14;
const PCT_W = 78;
const PIP = { w: 14, h: 30, gap: 6 } as const;

/** The height under the heads that the rows may use. */
const ROWS_AREA = 668;
/**
 * The most a row takes. A short list (six or fewer) gets taller rows, so the
 * table still fills the slide rather than ending halfway down it.
 */
const pitchFor = (count: number) =>
  Math.min(count <= 6 ? 120 : 96, Math.floor(ROWS_AREA / Math.max(1, count)));
/**
 * A dimmed problem's ink: the ink at 45% over the ground, as a plain colour.
 * The cell is a traveller, so it dims by its colour, which the morph then
 * blends on into the list's full ink, rather than by a child's opacity.
 */
const DIM_INK = "#8c8f93";
/**
 * Space between the title and the first row. The column heads stand beside
 * the title, so this only has to clear the title itself.
 */
const HEAD_BAND = 48;

/**
 * The problems, ranked in front of the room, twice: by reach × severity,
 * and then again once scope (how central a problem is to what we automate)
 * comes in. Both times every row physically travels to its new place.
 *
 * The problem cell carries flip id `${stakeholder}-problem-${id}`, shared with
 * the slide before (the board or the chart) and the track after. It is never
 * moved itself (the sort moves the row around it); only its fill and ink are
 * tweened, plain colours, when the top rows light and the rest dim, so both
 * travel on into the list. Rank numbers belong to places in the final order
 * (`${stakeholder}-rank-${i}`), and the rows arrive in them.
 */
export function ProblemRanking({
  stakeholder,
  title,
  problems,
  top = 3,
  footnote,
  reachSub = "of the people we asked",
  step,
}: ProblemRankingProps) {
  const root = useRef<HTMLDivElement>(null);
  if (process.env.NODE_ENV !== "production" && problems.length > 8) {
    throw new Error("ProblemRanking: eight problems at most");
  }
  const base = rankProblems(problems, baseScore);
  const ranked = rankProblems(problems);
  const baseOf = new Map(base.map((p, i) => [p.id, i]));
  const rankOf = new Map(ranked.map((p, i) => [p.id, i]));
  const count = problems.length;
  const pitch = pitchFor(count);
  const rowGap = Math.max(10, Math.round(pitch * 0.15));
  const rowH = pitch - rowGap;

  useSteps(root, step, (tl, mark) => {
    const scope = root.current;
    if (!scope) return;
    const rowOf = (id: string) =>
      scope.querySelector<HTMLElement>(`[data-rank-row="${id}"]`);

    /**
     * Every row travels from one order to the next, starting while the scores
     * are still counting. The rows that travel furthest pass over the rest,
     * and every row that moves more than a place swings out as it goes (the
     * climbers to the right, the droppers to the left), so a long drop is
     * watched all the way down. The rows' opaque backings are on only while
     * they sort: that is the only time rows pass over each other.
     */
    const sort = (
      name: string,
      from: Map<string, number>,
      to: Map<string, number>,
    ) => {
      const SORT = 1;
      const STAGGER = 0.045;
      const backings = scope.querySelectorAll(".pr-backing");
      tl.set(backings, { opacity: 1 }, name);
      tl.set(
        backings,
        { opacity: 0 },
        `${name}+=${SORT + (count - 1) * STAGGER}`,
      );
      problems.forEach((p, told) => {
        const row = rowOf(p.id);
        if (!row) return;
        const a = from.get(p.id) ?? told;
        const b = to.get(p.id) ?? told;
        tl.set(row, { zIndex: 1 + Math.abs(b - a) }, name);
        if (a === b) return;
        // Each direction leaves from its leading end: climbers top-down (by
        // the place they climb to), droppers bottom-up (by the place they
        // drop from). The row ahead always leaves first, so two rows moving
        // the same way open the gap between them, never close it.
        const at = `${name}+=${(b > a ? count - 1 - a : b) * STAGGER}`;
        tl.to(
          row,
          { y: (b - told) * pitch, duration: SORT, ease: "deck.morph" },
          at,
        );
        if (b < a || b - a > 1) {
          tl.to(
            row,
            {
              x: b < a ? 30 : -30,
              duration: SORT / 2,
              ease: "sine.inOut",
              yoyo: true,
              repeat: 1,
            },
            at,
          );
        }
      });
      // When the last rows are settling: the payoff lands then, not after.
      return `${name}+=${SORT * 0.7 + (count - 1) * STAGGER}`;
    };

    const head = (target: string) =>
      tl.from(target, {
        autoAlpha: 0,
        y: 18,
        duration: 0.55,
        ease: "deck.enter",
      });

    // 1. Reach: the share of the people asked who raised it, as a bar.
    head(".pr-head-reach");
    tl.from(
      ".pr-reach-track",
      { autoAlpha: 0, duration: 0.35, ease: "power1.out", stagger: 0.03 },
      "<0.1",
    );
    tl.from(
      ".pr-reach-bar",
      {
        scaleX: 0,
        transformOrigin: "0% 50%",
        duration: 0.7,
        ease: "deck.enter",
        stagger: 0.05,
      },
      "<0.1",
    );
    tl.from(
      ".pr-reach-pct",
      {
        autoAlpha: 0,
        x: -10,
        duration: 0.45,
        ease: "deck.enter",
        stagger: 0.05,
      },
      "<0.25",
    );
    mark();

    // 2. Severity: five empty pips per row, then each row's pips rise to its
    // level, one row after another.
    head(".pr-head-sev");
    tl.from(
      ".pr-sev",
      { autoAlpha: 0, duration: 0.35, ease: "power1.out", stagger: 0.03 },
      "<0.1",
    );
    tl.from(
      ".pr-sev-on",
      {
        scaleY: 0,
        transformOrigin: "50% 100%",
        duration: 0.2,
        ease: "back.out(1.8)",
        stagger: 0.022,
      },
      "<0.12",
    );
    mark();

    // 3. The score before scope counts up, and the rows sort by it.
    head(".pr-head-score");
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
        innerText: (_: number, el: HTMLElement) => Number(el.dataset.base ?? 0),
        snap: { innerText: 1 },
        duration: 0.6,
        ease: "power2.out",
        stagger: 0.04,
      },
      "<",
    );
    tl.addLabel("base", "<0.35");
    sort("base", new Map(), baseOf);
    mark();

    // 4. Scope: how central each problem is to what we set out to automate.
    head(".pr-head-scope");
    tl.from(
      ".pr-scope",
      { autoAlpha: 0, duration: 0.35, ease: "power1.out", stagger: 0.03 },
      "<0.1",
    );
    tl.from(
      ".pr-scope-on",
      {
        scaleY: 0,
        transformOrigin: "50% 100%",
        duration: 0.2,
        ease: "back.out(1.8)",
        stagger: 0.022,
      },
      "<0.12",
    );
    tl.from(
      ".pr-scope-word",
      {
        autoAlpha: 0,
        x: -10,
        duration: 0.4,
        ease: "deck.enter",
        stagger: 0.04,
      },
      "<0.2",
    );
    mark();

    // 5. The scores recount with scope, and the rows sort again.
    tl.to(".pr-score-was", {
      autoAlpha: 0,
      y: -12,
      duration: 0.35,
      ease: "power2.in",
    });
    tl.from(
      ".pr-score-now",
      { autoAlpha: 0, y: 12, duration: 0.45, ease: "deck.enter" },
      "<0.2",
    );
    tl.fromTo(
      ".pr-score-n",
      { innerText: (_: number, el: HTMLElement) => Number(el.dataset.base) },
      {
        innerText: (_: number, el: HTMLElement) =>
          Number(el.dataset.score ?? 0),
        snap: { innerText: 1 },
        duration: 0.7,
        ease: "power2.out",
        stagger: 0.04,
        immediateRender: false,
      },
      "<",
    );
    tl.addLabel("final", "<0.35");
    const settled = sort("final", baseOf, rankOf);
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
    // The top rows light and the rest dim on the cells themselves, in plain
    // colours, so the light and the dim travel on into the list.
    tl.to(
      "[data-pr-lit]",
      {
        backgroundColor: LIT_CELL,
        duration: 0.45,
        ease: "power2.out",
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
      "[data-pr-dim]",
      { color: DIM_INK, duration: 0.45, ease: "power2.out" },
      settled,
    );
    tl.to(
      ".pr-dim",
      { opacity: 0.45, duration: 0.45, ease: "power2.out" },
      settled,
    );
    mark();
  });

  return (
    <SlideBody>
      <SlideHeader title={title} titleClassName="max-w-[760px]" />
      {/* Before the builds, the table is the board's (or the chart's)
          problems in a column: the morph staggers them in, and back out. */}
      <div
        ref={root}
        data-flip-stagger={step === 0 ? "" : undefined}
        className="relative"
        style={{ width: W, height: count * pitch, marginTop: HEAD_BAND }}
      >
        {/* Column heads stand beside the title, above the rows. They sit in
            one plain box, never tweened, so that arriving here backwards the
            morph can dissolve them in (it leaves alone what has a tween). */}
        <div>
          <Head
            className="pr-head-reach"
            left={REACH_X}
            width={REACH_W}
            label="Reach"
            sub={reachSub}
          />
          <Head
            className="pr-head-sev"
            left={SEV_X}
            width={SEV_W}
            subWidth={SEV_W + GAP - 6}
            label="Severity"
            sub="how much it hurts, of 5"
          />
          <Head
            className="pr-head-scope"
            left={SCOPE_X}
            width={SCOPE_W}
            label="Scope"
            sub="how central to what we automate"
          />
          <Head
            className="pr-head-score"
            left={SCORE_X}
            width={SCORE_W}
            align="right"
            label="Score"
            sub={
              // Two short lines each, broken where the formula reads.
              <span className="relative block whitespace-nowrap">
                <span className="pr-score-was block">
                  reach
                  <br />× severity
                </span>
                <span className="pr-score-now absolute inset-x-0 top-0 block">
                  with scope,
                  <br />
                  out of 100
                </span>
              </span>
            }
          />
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
          const lit = (rankOf.get(p.id) ?? told) < top;
          const dim = lit ? "" : "pr-dim";
          const placeholder = p.reach.placeholder ?? false;
          const weight = SCOPE[p.scope].weight;
          return (
            <div
              key={p.id}
              data-rank-row={p.id}
              className="absolute left-0"
              style={{ top: told * pitch, width: W, height: rowH }}
            >
              {/*
               * An opaque backing over the row's whole pitch, so a row passing
               * over another hides it. Shown only while the rows sort: at rest
               * it would slice across problems flying in or out. It runs on
               * past the score, so a row swinging out sideways never shows
               * the score of the row under it.
               */}
              <span
                aria-hidden
                data-no-enter
                className="pr-backing bg-bg absolute"
                style={{
                  left: CELL_X - 10,
                  right: -72,
                  top: -rowGap / 2,
                  bottom: -rowGap / 2,
                  opacity: 0,
                  // Feathered in the gap above and below the row, so a row
                  // passing over another slides across it rather than
                  // cutting it with a hard edge.
                  maskImage: `linear-gradient(transparent, #000 ${rowGap / 2}px, #000 calc(100% - ${rowGap / 2}px), transparent)`,
                }}
              />
              {/* The hairline that rules the table. */}
              <span
                aria-hidden
                className="bg-line absolute right-0 h-px"
                style={{ left: CELL_X - 10, bottom: -rowGap / 2 }}
              />
              {/*
               * The problem: a traveller with its own type size (the morph
               * carries it), an opaque fill, and no clamp (every problem
               * fits two lines here; the box clips while it is in flight).
               */}
              <div
                data-flip-id={`${stakeholder}-problem-${p.id}`}
                data-pr-lit={lit ? "" : undefined}
                data-pr-dim={lit ? undefined : ""}
                className="bg-bg text-fg absolute flex items-center overflow-hidden text-[28px] leading-[1.18] font-medium tracking-[-0.005em]"
                style={{
                  left: CELL_X,
                  top: 0,
                  width: CELL_W,
                  height: rowH,
                  padding: "0px 24px",
                  borderRadius: 12,
                }}
              >
                <span className="text-balance">{p.text}</span>
              </div>

              {/* The row's figures, in one plain box that the morph can
                  dissolve in when the table is arrived at backwards. */}
              <div className="absolute inset-0">
                {/* Reach: a bar of the share who raised it, and the share. */}
                <div
                  className={`absolute top-0 flex h-full items-center gap-3 ${dim}`}
                  style={{ left: REACH_X, width: REACH_W }}
                  title={`${ofText(p.reach)} · ${pct(p.reach)}`}
                >
                  <span
                    className="pr-reach-track bg-sunken relative block shrink-0 overflow-hidden"
                    style={{ width: BAR_W, height: BAR_H, borderRadius: 4 }}
                  >
                    <span
                      className="pr-reach-bar bg-muted absolute inset-y-0 left-0 block"
                      style={{
                        width: Math.round(BAR_W * share(p.reach)),
                        borderRadius: "0 4px 4px 0",
                      }}
                    />
                  </span>
                  <span
                    className="pr-reach-pct font-display tabular text-fg inline-block text-right text-[26px] leading-none font-medium tracking-[-0.02em]"
                    style={{ width: PCT_W }}
                  >
                    <Pct t={p.reach} />
                  </span>
                </div>

                {/* Severity as pips: a filled mark per level, an outline for the rest. */}
                <div
                  className={`pr-sev absolute top-0 flex h-full items-center ${dim}`}
                  style={{ left: SEV_X, width: SEV_W }}
                >
                  <Pips filled={p.severity} on="pr-sev-on" />
                </div>

                {/* Scope: its weight as pips (5, 3 or 1), and the tier's name. */}
                <div
                  className={`pr-scope absolute top-0 flex h-full items-center gap-3.5 ${dim}`}
                  style={{ left: SCOPE_X, width: SCOPE_W }}
                >
                  <Pips filled={weight} on="pr-scope-on" />
                  <span
                    className={`pr-scope-word inline-block text-[22px] leading-none font-medium ${p.scope === "core" ? "text-fg" : "text-muted"}`}
                  >
                    {SCOPE[p.scope].label}
                  </span>
                </div>

                <div
                  className={`pr-score absolute top-0 flex h-full items-center justify-end ${dim}`}
                  style={{ left: SCORE_X, width: SCORE_W }}
                >
                  <span className="font-display tabular text-fg relative inline-block text-right text-[44px] leading-none font-semibold tracking-[-0.03em]">
                    <Derived placeholder={placeholder}>
                      <span
                        className="pr-score-n"
                        data-base={baseScore(p)}
                        data-score={problemScore(p)}
                      >
                        {problemScore(p)}
                      </span>
                    </Derived>
                    {/* The top scores take the accent once the sort lands. */}
                    {lit && (
                      <span
                        aria-hidden
                        className="pr-light text-accent bg-bg absolute inset-0"
                        style={{ opacity: 0 }}
                      >
                        <Derived placeholder={placeholder}>
                          {problemScore(p)}
                        </Derived>
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {footnote && (
        <p className="t-small text-muted mt-4" style={{ maxWidth: W }}>
          {footnote}
        </p>
      )}
    </SlideBody>
  );
}

function Pips({ filled, on }: { filled: number; on: string }) {
  return (
    <span className="flex shrink-0 items-end" style={{ gap: PIP.gap }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className="relative block shrink-0"
          style={{ width: PIP.w, height: PIP.h }}
        >
          {n <= filled ? (
            <span
              className={`${on} bg-muted block h-full w-full`}
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
    </span>
  );
}

function Head({
  className,
  left,
  width,
  subWidth,
  align = "left",
  label,
  sub,
}: {
  className: string;
  left: number;
  width: number;
  /** The line under the label may run a little wider than its column. */
  subWidth?: number;
  align?: "left" | "right";
  label: ReactNode;
  sub: ReactNode;
}) {
  return (
    <div
      className={`${className} absolute bottom-full mb-4 ${align === "right" ? "text-right" : ""}`}
      style={{ left, width }}
    >
      <p
        className="font-display text-fg border-b pb-2.5 text-[24px] leading-[1.2] font-medium tracking-[-0.01em]"
        style={{ borderColor: "var(--line-strong)" }}
      >
        {label}
      </p>
      <div
        className={`text-muted mt-3 flex min-h-13.25 items-start text-[22px] leading-[1.2] ${align === "right" ? "ml-auto justify-end" : ""}`}
        style={{ width: subWidth ?? width }}
      >
        {sub}
      </div>
    </div>
  );
}
