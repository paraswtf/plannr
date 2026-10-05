"use client";

import { useRef, type ReactNode } from "react";

import { gsap } from "~/deck/gsap";
import { useSteps } from "~/deck/useSteps";
import { Icon, type IconName } from "~/ui/icon";
import { Eyebrow, Glow, SlideBody } from "~/ui/layout";

import { riseWords, useEntrance } from "./_story-motion";

export interface NumberedPointsProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** `icon` waits faintly under the numeral until its rule is reached. */
  points: { title: ReactNode; body?: ReactNode; icon?: IconName }[];
  accent?: string;
  /** Point i appears on step i: the first is there from the start. Steps = points.length. */
  step: number;
}

/** Height of a numeral, and where its centre (the rail's stop) sits in a row. */
const NUMERAL = 84;
/** Rows share about 780px of the column, centred against the title. */
const rowHeight = (count: number) =>
  Math.min(200, Math.floor(780 / Math.max(1, count)));
/** A rail stop not yet reached, and one passed (tweened, so real colours). */
const STOP_OFF = "#0d1117";
const STOP_ON = "#ffffff";
/** How strongly a rule not yet reached shows its numeral and icon. */
const GHOST = 0.32;

/**
 * A short numbered list of rules or principles, one per build.
 *
 * The title holds the left column; the rules stack down the right, threaded on
 * a rail. Each build sends a marker down the rail to the next stop, and the
 * rule rises in beside it as it lands. The rule just said is lit; the earlier
 * ones step back but stay readable.
 */
export function NumberedPoints({
  eyebrow,
  title,
  points,
  accent,
  step,
}: NumberedPointsProps) {
  const root = useRef<HTMLDivElement>(null);
  const lit = accent ?? "var(--grad-brand)";
  const litRail =
    accent ??
    "linear-gradient(180deg, #7a2e8f 0%, #c9306c 35%, #e8455e 60%, #f6a73b 100%)";

  useEntrance(
    root,
    (tl) => {
      tl.from(".np-glow", { opacity: 0, duration: 1.4, ease: "power2.out" }, 0);
      if (eyebrow) {
        tl.from(
          ".np-eyebrow",
          { opacity: 0, y: 18, duration: 0.7, ease: "deck.enter" },
          0.1,
        );
      }
      tl.add(riseWords(root.current?.querySelector(".np-title") ?? null), 0.16);
      tl.from(
        ".np-track",
        { scaleY: 0, duration: 1.1, ease: "power3.inOut" },
        0.2,
      );
      tl.from(
        ".np-stop",
        {
          scale: 0,
          duration: 0.5,
          ease: "back.out(2)",
          stagger: 0.08,
        },
        0.35,
      );
      tl.from(
        ".np-marker",
        { scale: 0, duration: 0.6, ease: "back.out(2.2)" },
        0.45,
      );
      tl.from(
        ".np-num",
        { opacity: 0, duration: 0.8, ease: "power2.out", stagger: 0.08 },
        0.45,
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
      const rail = root.current?.querySelector<HTMLElement>(".np-rail");
      if (!rail || rows.length === 0) return;
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
        // The marker travels to the next stop, the lit rail following it.
        tl.to(
          ".np-marker",
          { y: stops[i], duration: 0.8, ease: "deck.morph" },
          at,
        );
        tl.to(
          ".np-fill",
          {
            scaleY: (stops[i] ?? 0) / length,
            duration: 0.8,
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
          { opacity: 0.62, duration: 0.6, ease: "power2.out" },
          at,
        );
        tl.to(
          prev.querySelector(".np-stop"),
          { opacity: 0.55, duration: 0.5 },
          at,
        );
        // And the next arrives as the marker lands.
        tl.fromTo(
          row.querySelector(".np-stop"),
          { backgroundColor: STOP_OFF },
          { backgroundColor: STOP_ON, duration: 0.3, immediateRender: true },
          `${at}+=0.6`,
        );
        // Its numeral and icon, waiting faintly on the rail, come up to full.
        tl.fromTo(
          row.querySelector(".np-ghost"),
          { opacity: GHOST },
          {
            opacity: 1,
            duration: 0.6,
            ease: "power2.out",
            immediateRender: true,
          },
          `${at}+=0.45`,
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
        tl.fromTo(
          row.querySelector(".np-lit"),
          { opacity: 0 },
          {
            opacity: 1,
            duration: 0.7,
            ease: "power2.out",
            immediateRender: true,
          },
          `${at}+=0.5`,
        );
        mark();
      });
    },
    [points.length],
  );

  return (
    <div ref={root} data-no-enter className="absolute inset-0">
      <Glow className="np-glow" x="18%" y="50%" size={1300} />
      <SlideBody className="flex-row gap-16">
        <div className="flex w-[640px] shrink-0 flex-col justify-center pb-10">
          {eyebrow && (
            <Eyebrow color={accent} className="np-eyebrow">
              {eyebrow}
            </Eyebrow>
          )}
          <h1 className="np-title t-display mt-10 text-balance">{title}</h1>
        </div>

        <ol
          className="np-rail relative grid min-w-0 flex-1 self-center"
          style={{
            gridTemplateRows: `repeat(${points.length}, ${rowHeight(points.length)}px)`,
          }}
        >
          {/* The rail: a faint track, the lit part, and the marker that travels it. */}
          <span
            aria-hidden
            className="np-track bg-line absolute left-[15px] w-[2px] origin-top"
            style={{
              top: NUMERAL / 2,
              bottom: `calc(${100 / points.length}% - ${NUMERAL / 2}px)`,
            }}
          />
          <span
            aria-hidden
            className="absolute left-[15px] w-[2px]"
            style={{
              top: NUMERAL / 2,
              bottom: `calc(${100 / points.length}% - ${NUMERAL / 2}px)`,
            }}
          >
            <span
              className="np-fill absolute inset-0 origin-top"
              style={{ background: litRail }}
            />
          </span>

          {points.map((p, i) => (
            <li
              key={i}
              className={`np-row np-row-${i} relative flex items-start`}
            >
              <span
                aria-hidden
                className="np-stop absolute left-[8px] h-[16px] w-[16px] rounded-full"
                style={{
                  top: NUMERAL / 2 - 8,
                  background: i === 0 ? STOP_ON : STOP_OFF,
                  boxShadow: "inset 0 0 0 2px var(--line-strong)",
                }}
              />
              <span className="flex min-w-0 flex-1 items-start gap-8 pl-[72px]">
                <span className="np-num block w-[116px] shrink-0">
                  <span
                    className="np-ghost relative flex flex-col"
                    style={{ opacity: i === 0 ? 1 : GHOST }}
                  >
                    <span
                      className="relative block"
                      style={{ height: NUMERAL }}
                    >
                      <span
                        className="t-mono text-faint absolute inset-0 font-light"
                        style={{ fontSize: NUMERAL, lineHeight: 1 }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className="np-lit t-mono absolute inset-0 font-light"
                        style={{
                          fontSize: NUMERAL,
                          lineHeight: 1,
                          background: lit,
                          WebkitBackgroundClip: "text",
                          backgroundClip: "text",
                          color: "transparent",
                          opacity: i === 0 ? 1 : 0,
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </span>
                    {p.icon && (
                      <Icon
                        name={p.icon}
                        size={30}
                        stroke={1.6}
                        className="text-faint mt-5 ml-[6px]"
                      />
                    )}
                  </span>
                </span>
                <span className="flex min-w-0 flex-col pt-[6px]">
                  <span
                    className="np-rise np-head t-h3 block"
                    style={{ fontSize: 44 }}
                  >
                    {p.title}
                  </span>
                  {p.body && (
                    <span className="np-rise t-body text-muted mt-3 block text-pretty">
                      {p.body}
                    </span>
                  )}
                </span>
              </span>
            </li>
          ))}

          <span
            aria-hidden
            className="np-marker pointer-events-none absolute left-0 h-[32px] w-[32px] rounded-full"
            style={{
              top: NUMERAL / 2 - 16,
              background: lit,
              boxShadow: "0 0 32px 4px var(--glow)",
            }}
          >
            <span className="bg-bg absolute inset-[9px] rounded-full" />
          </span>
        </ol>
      </SlideBody>
    </div>
  );
}
