"use client";

import { useRef, type ReactNode } from "react";

import { Of, Pct, ofText, pct, projectedCount } from "~/content/research";
import { share, type Ratings, type Tally } from "~/content/types";
import { arrivesByMorph, useFlightSlots } from "~/deck/morph";
import { useSteps } from "~/deck/useSteps";
import { SlideBody, SlideHeader } from "~/ui/layout";

import { countUp, useArrival } from "./_research-motion";
import { Slot } from "./_stakeholder-parts";

/** One bar: something people said, and how many of them said it. */
export interface BarDatum {
  id: string;
  label: ReactNode;
  /** How many of the people asked said it (as collected; shown projected). */
  tally: Tally;
  /** How they rated it, for a stacked chart: high, medium, low. */
  ratings?: Ratings;
  /** Takes the accent on the second build; the rest recede. */
  highlight?: boolean;
  /**
   * Put on the label's box, so it can travel from or to another slide (a
   * problem's `${stakeholder}-problem-${id}`, say). Unique on the slide.
   */
  flipId?: string;
}

/** A panel of bars; two panels sit side by side on one shared 0-100% scale. */
export interface BarPanel {
  title?: ReactNode;
  data: BarDatum[];
}

export interface BarChartProps {
  title: ReactNode;
  lede?: ReactNode;
  /** One panel, or two side by side. */
  panels: BarPanel[];
  /** Where the numbers come from, under the plot. */
  source: ReactNode;
  /** Split each bar by its ratings (high, medium, low), with a legend. */
  stacked?: boolean;
  /** Longest bar first. Default true. */
  sort?: boolean;
  /**
   * The share at the end of the scale, 0 to 1. Default 1 (100%). A small
   * sample whose bars all sit low (faculty, around 20%) reads better on 0.5.
   */
  max?: number;
  /**
   * What the label at a bar's tip leads with: the share ("73%", default) or
   * the head count ("2 of 10", for small samples), the other one after it.
   * With two panels only the lead is shown.
   */
  primary?: "share" | "count";
  /**
   * 0: the bars grow in on arrival. 1 (only when some datum has `highlight`):
   * the highlighted bars take the accent and the rest recede. Steps = 2 with a
   * highlight, else 1.
   */
  step: number;
  /** False while the slide is leaving or previewed: the bars wait for it. */
  active?: boolean;
}

/*
 * The marks. Bars are one grey; the accent is kept for the build that says
 * "these ones". A stacked bar splits by the rating people gave it: high in
 * the accent (it is what hurts), medium in the bar grey, low a step lighter.
 * Validated together on the ground with the dataviz palette checker.
 */
const BAR = "#7c8596";
const ACCENT = "#c8305f";
const SEGMENT: Record<keyof Ratings, string> = {
  high: ACCENT,
  medium: BAR,
  low: "#b9c0cc",
};
const SEGMENT_LABEL: Record<keyof Ratings, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
const LEVELS = ["high", "medium", "low"] as const;

const THICK = 24;
/** The most a row takes; rows share less when there are many. */
const ROW = 92;
/** The gap, in the ground colour, between the segments of a stacked bar. */
const GAP = 2;
/** Between a bar's end and its label. */
const TIP_GAP = 18;
/** How far the rows that are not the point fade on the highlight build. */
const RECEDE = 0.34;
/**
 * A receding label's ink: the ink at RECEDE over the ground, as a plain
 * colour. The label is a traveller, so it recedes by its colour (which the
 * morph carries on to the next slide) rather than by an opacity.
 */
const RECEDED_INK = "#a5a7ac";

/** The column widths, on the 1664px content box. */
function geometry(panels: number, primary: "share" | "count") {
  if (panels > 1) {
    const panel = 800;
    const label = 380;
    const gap = 20;
    // Two panels show only the lead figure at the tip: "82%", or "9 of 11".
    const tip = primary === "count" ? 150 : 84;
    return {
      panel,
      label,
      gap,
      tip,
      track: panel - label - gap - tip,
      font: 24,
    };
  }
  const panel = 1664;
  const label = 520;
  const gap = 32;
  const tip = 212;
  return { panel, label, gap, tip, track: panel - label - gap - tip, font: 26 };
}

/**
 * A horizontal bar chart of what people told us: one bar per answer, its
 * share of the people asked at the tip, with the head count beside it.
 *
 * On arrival the bars grow from a hairline baseline one after another, and
 * each tip label rides the bar's end out, counting up as it goes. With a
 * highlight, the next build lights the highlighted bars in the accent while
 * the rest recede. A stacked chart splits each bar by how the people who
 * raised it rated it, with a legend.
 *
 * Each row carries a plain-text title for hover ("8 of 11 · 73%"), and the
 * chart has a screen-reader table with every value. A label's box carries
 * the datum's `flipId`, so a problem can travel in from the board before and
 * on to the ranking after. It is never moved itself; only its colour is
 * tweened, on the highlight build, so a receding label carries its tone on
 * into the morph.
 */
export function BarChart({
  title,
  lede,
  panels,
  source,
  stacked = false,
  sort = true,
  max = 1,
  primary = "share",
  step,
  active = true,
}: BarChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const g = geometry(panels.length, primary);
  const scaleEnd = max > 0 ? max : 1;
  const two = panels.length > 1;

  const shown = panels.map((panel) => ({
    ...panel,
    data: sort
      ? [...panel.data].sort((a, b) => share(b.tally) - share(a.tally))
      : panel.data,
  }));
  const all = shown.flatMap((p) => p.data);
  const highlights = all.some((d) => d.highlight);
  // What the motion depends on, as one value (the props are fresh arrays on
  // every render, and the arrival must not replay when the step changes).
  const shape = [
    stacked,
    scaleEnd,
    primary,
    ...all.map(
      (d) => `${d.id}:${d.tally.count}/${d.tally.of}:${d.highlight ? 1 : 0}`,
    ),
  ].join("|");

  if (process.env.NODE_ENV !== "production") {
    const seen = new Set<string>();
    for (const d of all) {
      if (!d.flipId) continue;
      if (seen.has(d.flipId))
        throw new Error(`BarChart: flip id "${d.flipId}" is used twice`);
      seen.add(d.flipId);
    }
  }

  const barPx = (count: number, of: number) =>
    Math.round(Math.min(1, of > 0 ? count / of / scaleEnd : 0) * g.track);

  useArrival(
    ref,
    { active, step },
    (tl) => {
      const root = ref.current;
      if (!root) return;
      const restores: (() => void)[] = [];
      // Arrived at by a morph (the problems flying in from the board), the
      // bars wait until the labels have nearly landed: an opaque label
      // flying over the plot must not cross bars that are already growing.
      const first = arrivesByMorph(root) ? 0.7 : 0.2;
      tl.from(
        root.querySelectorAll(".bc-base"),
        {
          scaleY: 0,
          duration: 0.7,
          ease: "deck.enter",
          transformOrigin: "50% 0%",
        },
        first - 0.15,
      );
      root.querySelectorAll<HTMLElement>(".bc-row").forEach((row, i) => {
        const at = first + i * 0.075;
        const px = Number(row.dataset.px ?? 0);
        const grow = { duration: 1.05, ease: "deck.enter" };
        tl.fromTo(
          row.querySelector(".bc-bar"),
          { clipPath: "inset(0px 100% 0px 0px)" },
          { clipPath: "inset(0px 0% 0px 0px)", ...grow },
          at,
        );
        // The tip label rides the bar's end out, counting up as it goes.
        tl.from(row.querySelector(".bc-ride"), { x: -px, ...grow }, at);
        tl.from(
          row.querySelector(".bc-ride"),
          { opacity: 0, duration: 0.35, ease: "power2.out" },
          at,
        );
        const lead = row.querySelector(".bc-lead");
        const restore = lead && countUp(tl, lead, grow, at);
        if (restore) restores.push(restore);
        const after = row.querySelector(".bc-after");
        if (after)
          tl.from(
            after,
            { opacity: 0, y: 10, duration: 0.6, ease: "deck.enter" },
            at + 0.55,
          );
      });
      const legend = root.querySelector(".bc-legend");
      if (legend)
        tl.from(
          legend.children,
          {
            opacity: 0,
            y: 12,
            duration: 0.6,
            ease: "deck.enter",
            stagger: 0.08,
          },
          0.3,
        );
      return () => restores.forEach((r) => r());
    },
    [shape],
  );

  useSteps(
    ref,
    step,
    (tl, mark) => {
      const root = ref.current;
      if (!root || !highlights) return;
      const dim = root.querySelectorAll(".bc-row[data-lit='0'] .bc-dim");
      tl.to(dim, { opacity: RECEDE, duration: 0.7, ease: "deck.enter" }, 0);
      tl.to(
        root.querySelectorAll(".bc-row[data-lit='0'] .bc-label"),
        { color: RECEDED_INK, duration: 0.7, ease: "deck.enter" },
        0,
      );
      if (!stacked)
        tl.to(
          root.querySelectorAll(".bc-row[data-lit='1'] .bc-fill"),
          {
            backgroundColor: ACCENT,
            duration: 0.7,
            ease: "deck.enter",
            stagger: 0.06,
          },
          0.05,
        );
      mark();
    },
    [shape],
  );

  // The labels' slots keep their laid-out size while a label flies.
  useFlightSlots(ref);

  const rows = Math.max(...shown.map((p) => p.data.length), 1);

  return (
    <SlideBody>
      {/* Before the highlight, the labels are the board's notes in a
          column: the morph staggers them in, and back out. */}
      <div
        ref={ref}
        data-flip-stagger={step === 0 ? "" : undefined}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* A chart's title runs on one line and its lede on a long measure,
            so the plot keeps the height. */}
        <SlideHeader title={title} titleClassName="max-w-[1600px]!" />
        {lede && (
          <p className="t-lede text-muted mt-5 max-w-[1320px]">{lede}</p>
        )}

        {stacked && (
          <div
            className="bc-legend t-small text-muted mt-10 flex items-center gap-8"
            style={{ paddingLeft: g.label + g.gap }}
            aria-hidden
          >
            {LEVELS.map((level) => (
              <span key={level} className="flex items-center gap-3">
                <span
                  className="inline-block"
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    background: SEGMENT[level],
                  }}
                />
                {SEGMENT_LABEL[level]}
              </span>
            ))}
          </div>
        )}

        <div
          className={`flex min-h-0 flex-1 ${stacked ? "mt-6" : two ? "mt-10" : "mt-12"}`}
          style={{ gap: 1664 - panels.length * g.panel }}
          aria-hidden
        >
          {shown.map((panel, p) => (
            <div
              key={p}
              className="flex min-h-0 flex-col"
              style={{ width: g.panel }}
            >
              {panel.title && (
                <h2 className="t-h3 text-fg mb-4">{panel.title}</h2>
              )}
              {/* Every panel has as many rows as the longest, so the bars
                  of two panels sit at one pitch: up to ROW, less when the
                  rows need the room. */}
              <div
                className="grid min-h-0 flex-1"
                style={{
                  gridTemplateRows: `repeat(${rows}, minmax(0, ${ROW}px))`,
                  alignContent: two ? "start" : "center",
                }}
              >
                {/* The baseline every bar grows from. */}
                <span
                  className="bc-base bg-line-strong"
                  style={{
                    gridColumn: 1,
                    gridRow: `1 / ${panel.data.length + 1}`,
                    marginLeft: g.label + g.gap - 1,
                    width: 1,
                  }}
                />
                {panel.data.map((d, i) => {
                  const px = barPx(d.tally.count, d.tally.of);
                  const lit = d.highlight ? 1 : 0;
                  return (
                    <div
                      key={d.id}
                      className="bc-row flex min-h-0 items-center"
                      style={{ gridColumn: 1, gridRow: i + 1 }}
                      data-px={px}
                      data-lit={lit}
                      title={`${ofText(d.tally)} · ${pct(d.tally)}`}
                    >
                      {/* The label sits pinned in a slot locked to its own
                          size, so a label flying in at a note's or a row's
                          size never moves itself or its row. It is opaque
                          (the ground), so its fill blends from the note's
                          paper or the row's cell to the ground, never
                          through transparent. */}
                      <div className="flex shrink-0" style={{ width: g.label }}>
                        <Slot>
                          <span
                            data-flip-id={d.flipId}
                            // The line height is a class, never an inline
                            // number: the morph would read an inline 1.15
                            // as 1.15px and collapse the lines in flight.
                            // The box spans the whole label column rather
                            // than hugging its text, so a label growing
                            // into place has room to spare and never
                            // rewraps in the last moment of the flight.
                            className="bc-label bg-bg text-fg inline-block leading-[1.15]"
                            style={{ width: g.label, fontSize: g.font }}
                          >
                            <span className="line-clamp-2 block font-medium text-balance">
                              {d.label}
                            </span>
                          </span>
                        </Slot>
                      </div>
                      <div
                        className="flex shrink-0 items-center"
                        style={{ marginLeft: g.gap, width: g.track + g.tip }}
                      >
                        <Bar
                          datum={d}
                          px={px}
                          stacked={stacked}
                          segmentPx={(n) => barPx(n, d.tally.of)}
                        />
                        <div
                          className="bc-dim shrink-0"
                          style={{ marginLeft: px > 0 ? TIP_GAP : 0 }}
                        >
                          <div className="bc-ride flex items-baseline gap-3 whitespace-nowrap">
                            <span className="bc-lead font-display text-fg text-[30px] leading-none font-semibold tracking-[-0.02em]">
                              {primary === "count" ? (
                                <Of t={d.tally} />
                              ) : (
                                <Pct t={d.tally} />
                              )}
                            </span>
                            {!two && (
                              <span className="bc-after text-muted text-[22px] leading-none">
                                {primary === "count" ? (
                                  <Pct t={d.tally} />
                                ) : (
                                  <Of t={d.tally} />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <p className="t-small text-muted mt-8">{source}</p>

        <SrTable panels={shown} stacked={stacked} />
      </div>
    </SlideBody>
  );
}

/** One bar: a single grey fill, or the ratings side by side. */
function Bar({
  datum,
  px,
  stacked,
  segmentPx,
}: {
  datum: BarDatum;
  px: number;
  stacked: boolean;
  segmentPx: (n: number) => number;
}) {
  if (px <= 0) return null;
  const ratings = stacked ? datum.ratings : undefined;
  const parts = ratings
    ? LEVELS.filter((level) => ratings[level] > 0).map((level) => ({
        level,
        n: ratings[level],
        w: segmentPx(ratings[level]),
      }))
    : [];
  return (
    <div
      className="bc-bar bc-dim flex shrink-0 overflow-hidden"
      style={{
        width: px,
        height: THICK,
        gap: GAP,
        // Rounded at the data end, square at the baseline.
        borderRadius: "0 4px 4px 0",
      }}
    >
      {parts.length > 0 ? (
        parts.map(({ level, n, w }) => (
          <span
            key={level}
            className="block h-full"
            style={{ flex: `${w} 1 0`, background: SEGMENT[level] }}
            title={`${SEGMENT_LABEL[level]}: ${ofText({ ...datum.tally, count: n })}`}
          />
        ))
      ) : (
        <span
          className="bc-fill block h-full w-full"
          style={{ background: BAR }}
        />
      )}
    </div>
  );
}

/** Every value, for a screen reader: the chart as a table. */
function SrTable({
  panels,
  stacked,
}: {
  panels: BarPanel[];
  stacked: boolean;
}) {
  return (
    <div className="sr-only">
      {panels.map((panel, p) => (
        <table key={p}>
          {panel.title && <caption>{panel.title}</caption>}
          <thead>
            <tr>
              <th scope="col">Answer</th>
              <th scope="col">People</th>
              <th scope="col">Share</th>
              {stacked &&
                LEVELS.map((level) => (
                  <th key={level} scope="col">
                    {SEGMENT_LABEL[level]}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {panel.data.map((d) => (
              <tr key={d.id}>
                <th scope="row">{d.label}</th>
                <td>{ofText(d.tally)}</td>
                <td>{pct(d.tally)}</td>
                {stacked &&
                  LEVELS.map((level) => (
                    <td key={level}>
                      {projectedCount(
                        d.ratings?.[level] ?? 0,
                        d.tally.placeholder,
                      )}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}
