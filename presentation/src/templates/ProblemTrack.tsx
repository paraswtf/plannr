"use client";

import { useRef, type ReactNode } from "react";

import { Derived } from "~/content/research";
import {
  problemScore,
  type Evidence,
  type Problem,
  type TrackStatus,
} from "~/content/types";
import { FLIGHT_BOX, FLIGHT_TEXT } from "~/deck/morph";
import type { StakeholderId } from "~/deck/types";
import { useSteps } from "~/deck/useSteps";
import { Bezel } from "~/ui/frames";
import { SlideBody, SlideHeader } from "~/ui/layout";
import { Chip } from "~/ui/surfaces";

import { countUp, useArrival } from "./_research-motion";

export type { Evidence, TrackStatus };

export interface ProblemTrackProps {
  stakeholder: StakeholderId;
  /** One line: the insight about the problems we're on (about 34 characters). */
  title: ReactNode;
  /** The section's problems in ranked order (as the ranking ends); 8 at most. */
  problems: Problem[];
  /** Where each problem stands; one left out is "todo". */
  status: Record<string, TrackStatus>;
  /**
   * The problems answered since the last visit to the list: their marks draw
   * themselves on arrival.
   */
  fresh?: string[];
  /** The numbers for the current problems: one or two. */
  evidence?: Evidence[];
  /** One thing someone said about them; shown when there is one evidence row. */
  quote?: { text: ReactNode; who: ReactNode };
  /**
   * With current problems: 0 the list, 1 the evidence (and quote) rise in.
   * Steps = 2. Without (the recap): a tally of where everything stands, and
   * steps = 1.
   */
  step: number;
  /** False while the slide is leaving or previewed. */
  active?: boolean;
}

/*
 * Laid out on fixed canvas columns, so the list lines up with the ranking it
 * follows and every problem can travel between the two exactly.
 *
 *   list (rank | problem | status)   gap   evidence, quote, or the tally
 */
const LIST_W = 800;
const RANK_W = 60;
const RANK_GAP = 18;
const CELL_X = RANK_W + RANK_GAP;
const CELL_W = 548;
const STATUS_GAP = 14;
const STATUS_X = CELL_X + CELL_W + STATUS_GAP;
const COLUMN_GAP = 64;
const RIGHT_W = 1664 - LIST_W - COLUMN_GAP;
/** The height the rows may use, under a one-line title. */
const ROWS_AREA = 720;
/** Space between the title and the first row. */
const TITLE_GAP = 40;
/** How far an answered or deferred row recedes. */
const RECEDED = 0.4;
/** When a fresh mark starts drawing: once the morph has mostly landed. */
const MARK_AT = 0.7;

/**
 * The lit cell's fill: the accent's soft tint (--accent-soft) laid over the
 * ground, flattened to one opaque colour. A traveller needs a plain, opaque
 * fill: plain so the morph can blend it, opaque so a cell flying over other
 * rows or a feature's text never shows them through. The class below must
 * stay the same colour (Tailwind only sees literal class names).
 */
export const LIT_CELL = "#eee1e8";
const LIT_CELL_BG = "bg-[#eee1e8]";

/** The tally's rows, in the order the recap reads them. */
const TALLY: {
  status: Exclude<TrackStatus, "current">;
  word: string;
  what: string;
}[] = [
  { status: "built", word: "Built", what: "answered by Plannr today" },
  { status: "planned", word: "Planned", what: "designed, and ours to build" },
  {
    status: "later",
    word: "Later",
    what: "beyond what we set out to automate",
  },
  { status: "todo", word: "Open", what: "nothing answers yet" },
];

/**
 * Back to the problems: the ranked list a section walks through, one or two
 * problems at a time.
 *
 * The rows are the ranking's rows, in the order it ends: each problem cell
 * carries `${stakeholder}-problem-${id}` and each rank number
 * `${stakeholder}-rank-${i}`, so the ranking's table settles into this list,
 * the current problems shrink into the chips of the feature that answers
 * them (FeatureShowcase), and come back here marked.
 *
 * The current problems are lit, with the numbers behind them on the right
 * (step 1). Answered ones carry a check (built) or a "Planned" chip, and
 * the ones outside what we automate a "Later" chip; built and later rows
 * recede. The rows answered since the last visit (`fresh`) draw their marks
 * as they land. Without current problems it is the recap: the right column
 * tallies where everything stands.
 *
 * The flip boxes are never tweened: the highlight is a class (an opaque
 * fill, the same one the ranking lights its top rows with), and the receding
 * and the marks are their children's. The cells clip their text, and are
 * safe-centred, so a line that rewraps in flight stays inside its box and
 * overflows only downward; flying to or from a one-line chip, the text runs
 * on one softly faded line while the box is too short for two (FLIGHT_TEXT).
 */
export function ProblemTrack({
  stakeholder,
  title,
  problems,
  status,
  fresh = [],
  evidence = [],
  quote,
  step,
  active = true,
}: ProblemTrackProps) {
  const root = useRef<HTMLDivElement>(null);
  const count = problems.length;
  // A short list (six or fewer) gets taller rows, as the ranking does, so it
  // still fills the slide.
  const pitch = Math.min(
    count <= 6 ? 120 : 96,
    Math.floor(ROWS_AREA / Math.max(1, count)),
  );
  const rowGap = Math.max(10, Math.round(pitch * 0.14));
  const rowH = pitch - rowGap;

  const statusOf = (id: string): TrackStatus => status[id] ?? "todo";
  const isRecap = !problems.some((p) => statusOf(p.id) === "current");
  const freshSet = new Set(fresh);
  const tally = TALLY.map((t) => ({
    ...t,
    n: problems.filter((p) => statusOf(p.id) === t.status).length,
  })).filter((t) => t.n > 0 || t.status === "built");

  // Before the builds: fresh marks draw as the rows land, and the recap's
  // tally counts up.
  useArrival(root, { active, step }, (tl) => {
    const scope = root.current;
    if (!scope) return;
    const restore: (() => void)[] = [];

    // The scores and marks beside the rows wait for the cells to land, so a
    // cell still shrinking from the ranking's width never runs under them.
    tl.fromTo(
      scope.querySelectorAll(".pt-status-in"),
      { opacity: 0 },
      { opacity: 1, duration: 0.45, ease: "power2.out", stagger: 0.03 },
      MARK_AT - 0.1,
    );

    const freshRows = Array.from(
      scope.querySelectorAll<HTMLElement>("[data-pt-fresh]"),
    );
    freshRows.forEach((row, k) => {
      const at = MARK_AT + k * 0.16;
      const tick = row.querySelector(".pt-tick");
      if (tick) {
        tl.fromTo(
          tick,
          { drawSVG: "0% 0%" },
          { drawSVG: "0% 100%", duration: 0.5, ease: "power2.out" },
          at,
        );
      }
      const chip = row.querySelector(".pt-chip");
      if (chip) {
        tl.fromTo(
          chip,
          { autoAlpha: 0, scale: 0.6, transformOrigin: "0% 50%" },
          {
            autoAlpha: 1,
            scale: 1,
            duration: 0.5,
            ease: "back.out(2.2)",
          },
          at,
        );
      }
      const recede = row.querySelectorAll(".pt-recede");
      if (recede.length > 0) {
        tl.fromTo(
          recede,
          { opacity: 1 },
          { opacity: RECEDED, duration: 0.6, ease: "power2.out" },
          at + 0.25,
        );
      }
    });

    const rows = scope.querySelectorAll<HTMLElement>(".pt-tally-row");
    if (rows.length > 0) {
      const start = freshRows.length > 0 ? MARK_AT + 0.2 : 0.3;
      tl.from(
        rows,
        {
          autoAlpha: 0,
          y: 28,
          duration: 0.7,
          ease: "deck.enter",
          stagger: 0.14,
        },
        start,
      );
      rows.forEach((row, k) => {
        const n = row.querySelector(".pt-tally-n");
        if (!n) return;
        const undo = countUp(
          tl,
          n,
          { duration: 0.9, ease: "power2.out" },
          start + k * 0.14,
        );
        if (undo) restore.push(undo);
      });
    }
    return () => restore.forEach((undo) => undo());
  });

  // 1: the numbers behind the current problems rise in.
  useSteps(root, step, (tl, mark) => {
    if (isRecap || evidence.length === 0) return;
    tl.from(".pt-ev", {
      autoAlpha: 0,
      y: 36,
      duration: 0.7,
      ease: "deck.enter",
      stagger: 0.14,
    });
    mark();
  });

  const two = evidence.length > 1;

  return (
    <SlideBody>
      <SlideHeader title={title} titleClassName="max-w-none!" />
      <div
        ref={root}
        className="relative flex items-start"
        style={{ marginTop: TITLE_GAP, height: count * pitch }}
      >
        <ol
          className="relative shrink-0"
          style={{ width: LIST_W, height: count * pitch }}
        >
          {problems.map((p, i) => {
            const s = statusOf(p.id);
            const current = s === "current";
            const recedes = s === "built" || s === "later";
            const isFresh = freshSet.has(p.id) && s !== "todo";
            // Fresh rows recede in their arrival; the rest are drawn so.
            const recede = recedes
              ? isFresh
                ? "pt-recede"
                : "opacity-40"
              : "";
            return (
              <li
                key={p.id}
                data-pt-fresh={isFresh ? "" : undefined}
                className="absolute left-0"
                style={{ top: i * pitch, width: LIST_W, height: rowH }}
              >
                {/* The hairline that rules the list, between this row and the next. */}
                {i < count - 1 && (
                  <span
                    aria-hidden
                    className="bg-line absolute right-0 h-px"
                    style={{ left: CELL_X, top: rowH + rowGap / 2 }}
                  />
                )}
                <span
                  data-flip-id={`${stakeholder}-rank-${i}`}
                  className={`font-display tabular absolute top-0 left-0 inline-block text-[40px] font-semibold tracking-[-0.03em] ${current ? "text-accent" : "text-faint"}`}
                  style={{ width: RANK_W, height: rowH }}
                >
                  <span
                    className={`flex h-full w-full items-center justify-center ${recede}`}
                  >
                    {i + 1}
                  </span>
                </span>
                <div
                  data-flip-id={`${stakeholder}-problem-${p.id}`}
                  className={`absolute top-0 flex items-center-safe overflow-hidden text-[28px] leading-[1.18] font-medium tracking-[-0.005em] ${FLIGHT_BOX} ${current ? `${LIT_CELL_BG} text-fg` : "bg-bg text-fg"}`}
                  style={{
                    left: CELL_X,
                    width: CELL_W,
                    height: rowH,
                    padding: "0px 24px",
                    borderRadius: 12,
                  }}
                >
                  <span
                    className={`line-clamp-2 text-balance ${FLIGHT_TEXT} ${recede}`}
                  >
                    {p.text}
                  </span>
                </div>
                <div
                  className="absolute top-0 flex h-full items-center"
                  style={{ left: STATUS_X, right: 0 }}
                >
                  <div className="pt-status-in flex items-center">
                    <StatusMark status={s} problem={p} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div
          className="shrink-0"
          style={{ width: RIGHT_W, marginLeft: COLUMN_GAP }}
        >
          {isRecap ? (
            <div className="flex flex-col">
              {tally.map((t, k) => (
                <div
                  key={t.status}
                  className={`pt-tally-row flex items-center gap-10 pb-7 ${k > 0 ? "border-line border-t pt-7" : ""}`}
                >
                  <span
                    className={`pt-tally-n t-display tabular w-[150px] shrink-0 text-right ${t.status === "built" ? "text-accent" : "text-fg"}`}
                  >
                    {t.n}
                  </span>
                  <div className="flex min-w-0 flex-col gap-3">
                    <TallyMark status={t.status} word={t.word} />
                    <span className="text-muted text-[26px] leading-[1.3]">
                      {t.what}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col">
              {evidence.map((e, k) => (
                <div
                  key={k}
                  className={`pt-ev ${k > 0 ? "border-line mt-10 border-t pt-10" : ""}`}
                >
                  <p
                    className={`text-accent ${two ? "font-display text-[88px] leading-[0.98] font-semibold tracking-[-0.04em]" : "t-display"}`}
                  >
                    {e.value}
                  </p>
                  <p className="text-body mt-5 max-w-[700px] text-[28px] leading-[1.35] text-pretty">
                    {e.label}
                  </p>
                  {e.source && (
                    <p className="t-small text-muted mt-3">{e.source}</p>
                  )}
                </div>
              ))}
              {quote && !two && (
                <Bezel className="pt-ev mt-12 self-start">
                  <figure className="px-10 py-9">
                    <blockquote className="text-fg text-[30px] leading-[1.4] tracking-[-0.005em] text-pretty">
                      &ldquo;{quote.text}&rdquo;
                    </blockquote>
                    <figcaption className="t-small text-muted mt-5">
                      {quote.who}
                    </figcaption>
                  </figure>
                </Bezel>
              )}
            </div>
          )}
        </div>
      </div>
    </SlideBody>
  );
}

/** What sits beside a row: its score while open, or how it was answered. */
function StatusMark({
  status,
  problem,
}: {
  status: TrackStatus;
  problem: Problem;
}) {
  switch (status) {
    case "built":
      return <Tick />;
    case "planned":
      return (
        <Chip icon="hourglass" size={22} className="pt-chip">
          Planned
        </Chip>
      );
    case "later":
      return (
        <Chip icon="clock" size={22} className="pt-chip">
          Later
        </Chip>
      );
    default:
      return (
        <span
          className={`font-display tabular text-[30px] leading-none font-semibold tracking-[-0.02em] ${status === "current" ? "text-fg" : "text-faint"}`}
          title="Score: reach × severity × scope, out of 100"
        >
          <Derived placeholder={problem.reach.placeholder}>
            {problemScore(problem)}
          </Derived>
        </span>
      );
  }
}

/** The recap's mark for a tally row: the same mark its rows carry. */
function TallyMark({ status, word }: { status: TrackStatus; word: string }) {
  return (
    <Chip
      icon={
        status === "planned"
          ? "hourglass"
          : status === "later"
            ? "clock"
            : undefined
      }
      size={26}
      className="self-start"
    >
      {status === "built" && <Tick size={29} />}
      {word}
    </Chip>
  );
}

/** An ink check, drawn as a stroke so a fresh one can draw itself. */
function Tick({ size = 38 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      className="text-fg shrink-0"
      aria-label="Built"
      role="img"
    >
      <path
        className="pt-tick"
        d="M7 18.5l7 7L29.5 10"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
