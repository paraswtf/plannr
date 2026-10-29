"use client";

import { useRef, type RefObject } from "react";

import { CustomEase, gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";

import { arrivedBackwards } from "./_story-motion";

/**
 * The curve a playhead crosses a day on: it leaves its start gently, runs
 * through the middle of the day and takes a long settle into the evening.
 * Asymmetric on purpose (never a plain ease-in-out).
 */
export const SWEEP_EASE = "research.sweep";
CustomEase.create(SWEEP_EASE, "M0,0 C0.38,0.02 0.22,1 1,1");

/**
 * When a sweep on SWEEP_EASE reaches fraction `p` of its distance, as a
 * fraction of its duration. Lets things pop exactly as the playhead passes.
 */
export function sweepTimeAt(p: number) {
  const ease = gsap.parseEase(SWEEP_EASE);
  const target = Math.min(1, Math.max(0, p));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (ease(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * What a slide does on arrival, before any build: numbers counting up, the
 * first lane of a day being swept. One paused timeline that plays once the
 * slide is active, or lands on its end state at once when the deck is in
 * instant mode (presenter preview, snapshots), when the slide is reached on
 * a later build, or when it is arrived at backwards (stepping back into it
 * from the next slide, even a one-build slide).
 *
 * Call it before `useSteps` in the same component, so that when both settle
 * at once the arrival is already in place for the builds to start from.
 */
export function useArrival(
  scope: RefObject<Element | null>,
  { active, step }: { active: boolean; step: number },
  build: (tl: gsap.core.Timeline) => void | (() => void),
  dependencies: unknown[] = [],
) {
  const { instant } = useDeckRuntime();
  const timeline = useRef<gsap.core.Timeline | null>(null);
  // Arriving straight onto a later build: the arrival has "already happened".
  const landed = useRef(step > 0);

  useGSAP(
    () => {
      const tl = gsap.timeline({ paused: true });
      const cleanup = build(tl);
      timeline.current = tl;
      // Arriving backwards (stepping back from the slide after) lands on the
      // end state too: builds are never replayed on a backward move.
      if (instant || landed.current || arrivedBackwards(scope.current)) {
        landed.current = true;
        tl.progress(1);
      } else if (active) tl.play();
      return () => {
        cleanup?.();
        tl.kill();
        timeline.current = null;
      };
    },
    { scope, dependencies },
  );

  useGSAP(
    () => {
      const tl = timeline.current;
      if (!tl) return;
      if (instant) tl.progress(1);
      else if (active && tl.paused() && tl.progress() < 1) tl.play();
    },
    { dependencies: [active, instant] },
  );

  return timeline;
}

/**
 * Count a number up inside `el`, wherever it is: a plain "14", or the "14"
 * inside a <Ph>, or "40+". Finds the first text node that is a number with
 * optional text around it, and tweens it from 0. Anything else is left as it
 * is (the caller reveals it some other way). Returns a function that puts
 * the original text back, for the slide's cleanup; null if nothing counts.
 */
export function countUp(
  tl: gsap.core.Timeline,
  el: Element,
  vars: { duration: number; ease: string },
  position: number | string,
): (() => void) | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Text | null = null;
  let match: RegExpMatchArray | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const m = /^(\s*\D*?)(\d{1,6})(\D*\s*)$/.exec(n.nodeValue ?? "");
    if (m) {
      node = n as Text;
      match = m;
      break;
    }
  }
  if (!node || !match) return null;
  const [, before = "", digits = "0", after = ""] = match;
  const target = Number(digits);
  if (target < 2) return null;
  const original = node.nodeValue;
  const text = node;
  const counter = { v: 0 };
  tl.fromTo(
    counter,
    { v: 0 },
    {
      v: target,
      duration: vars.duration,
      ease: vars.ease,
      onUpdate: () => {
        text.nodeValue = `${before}${Math.round(counter.v)}${after}`;
      },
      onComplete: () => {
        text.nodeValue = original;
      },
      onReverseComplete: () => {
        text.nodeValue = `${before}0${after}`;
      },
    },
    position,
  );
  text.nodeValue = `${before}0${after}`;
  return () => {
    text.nodeValue = original;
  };
}
