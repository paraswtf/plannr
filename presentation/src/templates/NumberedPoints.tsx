"use client";

import { useRef, type ReactNode } from "react";

import { gsap } from "~/deck/gsap";
import { useSteps } from "~/deck/useSteps";
import { Icon, type IconName } from "~/ui/icon";
import { SlideBody } from "~/ui/layout";

import { riseWords, useEntrance } from "./_story-motion";

export interface NumberedPointsProps {
  /** Accepted and not drawn: the deck puts no label above a title. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** `icon` sits on the rail, waiting faintly until its rule is reached. */
  points: { title: ReactNode; body?: ReactNode; icon?: IconName }[];
  /** Ignored: the rail is always the deck's one accent. */
  accent?: string;
  /** Point i appears on step i: the first is there from the start. Steps = points.length. */
  step: number;
}

/** The icon tile on the rail; the rail runs through the tiles' centres. */
const TILE = 72;
/** The marker: a ring standing this far outside the current tile. */
const HALO = 7;
/** Rows share about 780px of the column, centred against the title. */
const rowHeight = (count: number) =>
  Math.min(200, Math.floor(780 / Math.max(1, count)));
/**
 * A tile not yet reached (the sunken grey) and one reached (the raised
 * white). Tweened, so real colours rather than tokens.
 */
const STOP_OFF = "#e9ebf0";
const STOP_ON = "#fbfbfd";
/** How strongly a rule not yet reached shows its icon. */
const GHOST = 0.45;

/**
 * A short list of rules or principles, one per build.
 *
 * The title holds the left column; the rules stack down the right, threaded on
 * a rail of icon tiles. Order is the rail's: each build sends the accent ring
 * down to the next tile, the lit part of the rail following it, and the rule
 * rises in beside it as it lands. The rule just said is lit; the earlier ones
 * step back but stay readable.
 */
export function NumberedPoints({ title, points, step }: NumberedPointsProps) {
  const root = useRef<HTMLDivElement>(null);
  const row = rowHeight(points.length);

  useEntrance(
    root,
    (tl) => {
      tl.add(riseWords(root.current?.querySelector(".np-title") ?? null), 0.16);
      tl.from(
        ".np-track",
        { scaleY: 0, duration: 1.2, ease: "deck.morph" },
        0.2,
      );
      tl.from(
        ".np-stop",
        {
          scale: 0.6,
          opacity: 0,
          duration: 0.7,
          ease: "deck.enter",
          stagger: 0.09,
        },
        0.3,
      );
      tl.from(
        ".np-marker",
        { scale: 0.7, opacity: 0, duration: 0.7, ease: "deck.enter" },
        0.55,
      );
      tl.from(
        ".np-row-0 .np-rise",
        {
          y: 40,
          opacity: 0,
          duration: 0.85,
          ease: "deck.enter",
          stagger: 0.08,
        },
        0.5,
      );
    },
    step,
  );

  useSteps(
    root,
    step,
    (tl, mark) => {
      const rows = Array.from(
        root.current?.querySelectorAll<HTMLElement>(".np-row") ?? [],
      );
      if (rows.length === 0) return;
      // Each stop, measured from the first: rows are laid out, not guessed.
      const first = rows[0]!.offsetTop;
      const stops = rows.map((r) => r.offsetTop - first);
      const length = Math.max(1, stops[stops.length - 1] ?? 0);

      gsap.set(".np-marker", { y: 0 });
      gsap.set(".np-fill", { scaleY: 0 });

      rows.forEach((row, i) => {
        if (i === 0) return;
        const prev = rows[i - 1]!;
        const at = `r${i}`;
        tl.addLabel(at);
        // The ring travels to the next tile, the lit rail following it.
        tl.to(
          ".np-marker",
          { y: stops[i], duration: 0.85, ease: "deck.morph" },
          at,
        );
        tl.to(
          ".np-fill",
          {
            scaleY: (stops[i] ?? 0) / length,
            duration: 0.85,
            ease: "deck.morph",
          },
          at,
        );
        // The rule just said steps back, but stays readable.
        tl.to(
          prev.querySelector(".np-lit"),
          { opacity: 0, duration: 0.5, ease: "power2.out" },
          at,
        );
        tl.to(
          prev.querySelector(".np-head"),
          { opacity: 0.55, duration: 0.6, ease: "power2.out" },
          at,
        );
        // And the next tile comes up as the ring lands on it.
        tl.fromTo(
          row.querySelector(".np-stop"),
          { backgroundColor: STOP_OFF },
          {
            backgroundColor: STOP_ON,
            duration: 0.4,
            ease: "power2.out",
            immediateRender: true,
          },
          `${at}+=0.5`,
        );
        tl.fromTo(
          row.querySelector(".np-ghost"),
          { opacity: GHOST },
          {
            opacity: 1,
            duration: 0.5,
            ease: "power2.out",
            immediateRender: true,
          },
          `${at}+=0.45`,
        );
        tl.fromTo(
          row.querySelector(".np-lit"),
          { opacity: 0 },
          {
            opacity: 1,
            duration: 0.6,
            ease: "power2.out",
            immediateRender: true,
          },
          `${at}+=0.55`,
        );
        tl.fromTo(
          row.querySelectorAll(".np-rise"),
          { y: 44, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.85,
            ease: "deck.enter",
            stagger: 0.07,
            immediateRender: true,
          },
          `${at}+=0.42`,
        );
        mark();
      });
    },
    [points.length],
  );

  // The rail runs from the first tile's centre to the last one's.
  const railInset = {
    left: TILE / 2 - 1,
    top: TILE / 2,
    height: row * Math.max(0, points.length - 1),
  };

  return (
    <div ref={root} data-no-enter className="absolute inset-0">
      <SlideBody className="flex-row gap-20">
        <div className="flex w-160 shrink-0 flex-col justify-center pb-10">
          <h1
            className="np-title t-display text-fg text-balance"
            style={{ fontSize: 100 }}
          >
            {title}
          </h1>
        </div>

        <ol
          className="np-rail relative grid min-w-0 flex-1 self-center"
          style={{ gridTemplateRows: `repeat(${points.length}, ${row}px)` }}
        >
          {/* The rail: a quiet track and the lit part that follows the ring. */}
          <span
            aria-hidden
            className="np-track bg-line-strong absolute w-0.5 origin-top"
            style={railInset}
          />
          <span aria-hidden className="absolute w-0.5" style={railInset}>
            <span className="np-fill bg-accent absolute inset-0 origin-top" />
          </span>

          {/* The ring that travels the rail, standing behind the tile it marks. */}
          <span
            aria-hidden
            className="np-marker bg-accent-soft pointer-events-none absolute"
            style={{
              left: -HALO,
              top: -HALO,
              width: TILE + HALO * 2,
              height: TILE + HALO * 2,
              borderRadius: 12 + HALO,
              boxShadow: "inset 0 0 0 2px var(--accent)",
            }}
          />

          {points.map((p, i) => (
            <li
              key={i}
              className={`np-row np-row-${i} relative flex items-start gap-10`}
            >
              <span
                aria-hidden
                className="np-stop relative grid shrink-0 place-items-center rounded-xl"
                style={{
                  width: TILE,
                  height: TILE,
                  background: i === 0 ? STOP_ON : STOP_OFF,
                  boxShadow:
                    "inset 0 0 0 1px rgba(16,24,40,0.08), 0 1px 1px rgba(16,24,40,0.04), 0 2px 8px -2px rgba(16,24,40,0.06)",
                }}
              >
                <span
                  className="np-ghost relative grid place-items-center"
                  style={{ opacity: i === 0 ? 1 : GHOST }}
                >
                  {p.icon && (
                    <>
                      <Icon
                        name={p.icon}
                        size={34}
                        weight="regular"
                        className="text-muted"
                      />
                      <Icon
                        name={p.icon}
                        size={34}
                        weight="regular"
                        className="np-lit text-accent absolute inset-0"
                        style={{ opacity: i === 0 ? 1 : 0 }}
                      />
                    </>
                  )}
                </span>
              </span>
              <span className="flex min-w-0 flex-col pt-2">
                <span
                  className="np-rise np-head t-h2 text-fg block"
                  style={{ fontSize: 46 }}
                >
                  {p.title}
                </span>
                {p.body && (
                  <span className="np-rise t-body text-muted mt-3 block max-w-[52ch] text-pretty">
                    {p.body}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </SlideBody>
    </div>
  );
}
