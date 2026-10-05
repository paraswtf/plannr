"use client";

import { useEffect, useState, type RefObject } from "react";

import { gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";

/*
 * Motion shared by the bookend templates (Cover, Findings, MergeApps,
 * Roadmap, OpenSource, Credits, Thanks).
 *
 * A rule all of them follow: an element is moved by the entrance OR by the
 * build timeline, never by both. Where a piece needs both (it rises in as the
 * slide arrives, then travels on a later build), it gets two boxes: the outer
 * one belongs to the builds, the inner one to the entrance. That way a slide
 * arrived at on its last build (coming back from the next one) can never
 * record a half-entered state as the place a build returns to.
 */

/**
 * A slide's own entrance, played once as it arrives. Skipped in the
 * presenter's previews and in snapshots taken with `instant`: there the slide
 * is simply in its resting state.
 */
export function useEntrance(
  scope: RefObject<Element | null>,
  build: (tl: gsap.core.Timeline) => void,
  dependencies: unknown[] = [],
) {
  const { instant } = useDeckRuntime();
  useGSAP(
    () => {
      if (instant) return;
      build(gsap.timeline());
    },
    { scope, dependencies: [instant, ...dependencies] },
  );
}

/** A short, deterministic pseudo-random sequence, so server and client agree. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The brand gradient's stops, for the few drawings that are the brand (the
 * mark itself). Slides use the one accent, `ACCENT`, for anything else.
 */
export const BRAND = {
  violet: "#7a2e8f",
  berry: "#c9306c",
  magenta: "#e8455e",
  coral: "#f2743c",
  amber: "#f6a73b",
  slate: "#445879",
} as const;

/**
 * The deck's accent and neutrals as plain hex, for SVG attributes and
 * elements that travel in a morph (where var() cannot be interpolated).
 * They mirror the tokens in globals.css.
 */
export const ACCENT = "#c8305f";
export const INK = {
  fg: "#10141b",
  body: "#353d4a",
  muted: "#5f6878",
  faint: "#8f97a6",
  rule: "#d3d7de",
  ground: "#f2f3f6",
  raised: "#fbfbfd",
} as const;

/**
 * Whether the slide around `scope` is the one on screen.
 *
 * Uses `active` when the section passes it. When it does not, it reads the
 * slide's own frame instead: SlideFrame marks every slide that is not the
 * current one `aria-hidden`, so watching that attribute tells a loop when to
 * stop without the section having to thread a prop through.
 */
export function useSlideActive(
  scope: RefObject<Element | null>,
  active: boolean | undefined,
): boolean {
  const [fromFrame, setFromFrame] = useState(true);
  useEffect(() => {
    if (active !== undefined) return;
    const frame = scope.current?.closest("[data-slide]");
    if (!frame) return;
    const read = () =>
      setFromFrame(frame.getAttribute("aria-hidden") !== "true");
    read();
    const observer = new MutationObserver(read);
    observer.observe(frame, {
      attributes: true,
      attributeFilter: ["aria-hidden"],
    });
    return () => observer.disconnect();
  }, [scope, active]);
  return active ?? fromFrame;
}
