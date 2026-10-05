"use client";

import { useRef, type ReactNode } from "react";

import { gsap } from "~/deck/gsap";
import { useSteps } from "~/deck/useSteps";
import { Eyebrow, Glow, SlideBody } from "~/ui/layout";

import {
  bottomIn,
  centreOffset,
  riseWords,
  useEntrance,
} from "./_story-motion";

export interface StatementProps {
  eyebrow?: ReactNode;
  /** Big type. Wrap the phrase that carries it in <Grad>. */
  title: ReactNode;
  /** A paragraph under the title, there from the start. */
  body?: ReactNode;
  /** Lines that arrive one per build after the title: point i on step i + 1. */
  points?: ReactNode[];
  align?: "left" | "center";
  /** Eyebrow dot and bullet colour. */
  accent?: string;
  step: number;
}

/**
 * One big idea, said plainly: a statement slide, optionally building a few
 * supporting lines underneath. Steps = 1 + points.length.
 *
 * The title rises a word at a time as the slide arrives. The block stays
 * optically centred on what is showing: each point that arrives lifts the
 * statement up to make room for itself.
 */
export function Statement({
  eyebrow,
  title,
  body,
  points = [],
  align = "left",
  accent,
  step,
}: StatementProps) {
  const root = useRef<HTMLDivElement>(null);
  const center = align === "center";
  const tone = accent ?? "var(--magenta)";

  useEntrance(
    root,
    (tl) => {
      tl.from(".st-glow", { opacity: 0, duration: 1.4, ease: "power2.out" }, 0);
      if (eyebrow) {
        tl.from(
          ".st-eyebrow",
          { opacity: 0, y: 18, duration: 0.7, ease: "deck.enter" },
          0.1,
        );
      }
      tl.add(riseWords(root.current?.querySelector(".st-title") ?? null), 0.18);
      if (body) {
        tl.from(
          ".st-body",
          { opacity: 0, y: 24, duration: 0.8, ease: "deck.enter" },
          0.55,
        );
      }
    },
    step,
  );

  useSteps(
    root,
    step,
    (tl, mark) => {
      const block = root.current?.querySelector<HTMLElement>(".st-block");
      const items = Array.from(
        root.current?.querySelectorAll<HTMLElement>(".st-point") ?? [],
      );
      if (!block) return;
      const head =
        block.querySelector(".st-body") ?? block.querySelector(".st-title");
      const offsets = [
        bottomIn(block, head),
        ...items.map((li) => bottomIn(block, li)),
      ].map((b) => centreOffset(block, b));

      gsap.set(block, { y: offsets[0] ?? 0 });
      items.forEach((li, i) => {
        const at = `p${i}`;
        tl.addLabel(at);
        tl.to(
          block,
          { y: offsets[i + 1] ?? 0, duration: 0.95, ease: "deck.morph" },
          at,
        );
        const bar = li.querySelector(".st-bar");
        if (bar) {
          tl.fromTo(
            bar,
            { scaleY: 0 },
            {
              scaleY: 1,
              duration: 0.6,
              ease: "power3.out",
              immediateRender: true,
            },
            `${at}+=0.3`,
          );
        }
        tl.fromTo(
          li.querySelector(".st-text"),
          { x: -48, opacity: 0 },
          {
            x: 0,
            opacity: 1,
            duration: 0.85,
            ease: "deck.enter",
            immediateRender: true,
          },
          `${at}+=0.38`,
        );
        mark();
      });
    },
    [points.length],
  );

  return (
    <div ref={root} data-no-enter className="absolute inset-0">
      <Glow
        className="st-glow"
        x={center ? "50%" : "22%"}
        y="48%"
        size={1400}
        color={`color-mix(in srgb, ${tone} 16%, transparent)`}
      />
      <SlideBody className={center ? "items-center text-center" : ""}>
        <div className="relative flex min-h-0 flex-1 flex-col justify-center">
          <div
            className={`st-block relative flex flex-col ${center ? "items-center" : ""}`}
          >
            {eyebrow && (
              <Eyebrow color={accent} className="st-eyebrow">
                {eyebrow}
              </Eyebrow>
            )}
            <h1
              className={`st-title t-display mt-10 max-w-[19ch] text-balance ${center ? "mx-auto" : ""}`}
            >
              {title}
            </h1>
            {body && (
              <p className="st-body t-lede text-muted mt-10 max-w-[46ch] text-pretty">
                {body}
              </p>
            )}
            {points.length > 0 && (
              <ul
                className={`mt-16 flex flex-col gap-8 ${center ? "items-center" : ""}`}
              >
                {points.map((p, i) => (
                  <li
                    key={i}
                    className="st-point relative flex max-w-[1440px] items-stretch gap-8"
                  >
                    {!center && (
                      <span
                        aria-hidden
                        className="st-bar block w-1.25 shrink-0 origin-top rounded-full"
                        style={{ background: tone }}
                      />
                    )}
                    <span
                      className="st-text t-lede block py-1 text-pretty"
                      style={{ fontSize: 40, lineHeight: 1.3 }}
                    >
                      {p}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SlideBody>
    </div>
  );
}
