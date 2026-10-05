"use client";

import { useRef, type ReactNode, type RefObject } from "react";

import { gsap, SplitText, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";

/*
 * Motion shared by the story templates (Statement, NumberedPoints,
 * VisualSlide, QuestionsBoard, QuotePortrait).
 */

/**
 * A slide's own entrance, played once as it arrives.
 *
 * The morph fades in whatever a slide does not animate itself; anything built
 * here is left to this timeline instead (mark its subtree `data-no-enter` so
 * the morph never fades it twice). In the presenter's previews and snapshots
 * (`instant`) nothing plays: the slide is simply there.
 *
 * Builds are never replayed on a backward move, as in Keynote: when the slide
 * is arrived at from a later one (the presenter stepping back), or opened
 * straight onto a later build, the scope only dissolves in with the morph.
 */
export function useEntrance(
  scope: RefObject<Element | null>,
  build: (tl: gsap.core.Timeline) => void,
  step = 0,
) {
  const { instant } = useDeckRuntime();
  const firstStep = useRef(step);
  useGSAP(
    () => {
      if (instant) return;
      const el = scope.current;
      if (firstStep.current > 0 || arrivedBackwards(el)) {
        if (el) {
          gsap.fromTo(
            el,
            { opacity: 0 },
            {
              opacity: 1,
              duration: 0.6,
              ease: "power2.out",
              clearProps: "opacity",
            },
          );
        }
        return;
      }
      build(gsap.timeline());
    },
    { scope },
  );
}

/**
 * Whether the slide holding `el` is replacing a later slide. The deck keeps
 * the leaving slide mounted beside the new one while they morph, so its id is
 * there to compare against the deck's running order.
 */
function arrivedBackwards(el: Element | null): boolean {
  const own = el?.closest<HTMLElement>("[data-slide]");
  const order =
    typeof window === "undefined" ? undefined : window.__deck?.slides;
  if (!own || !order) return false;
  const index = (id: string | undefined) =>
    order.find((s) => s.id === id)?.index ?? -1;
  const mine = index(own.dataset.slide);
  const siblings = Array.from(own.parentElement?.children ?? []);
  return siblings.some(
    (s) =>
      s !== own &&
      s instanceof HTMLElement &&
      s.dataset.slide !== undefined &&
      index(s.dataset.slide) > mine,
  );
}

/**
 * Raise a heading into place a word at a time.
 *
 * A <Grad> phrase rises as one piece rather than word by word: its gradient
 * is painted through its text (`background-clip: text`), and Chrome neither
 * fades nor moves a child of such an element on its own — a split word would
 * show at full strength from the first frame. Everything moves by `top`
 * (relative positioning), never by a transform, for the same reason. Once the
 * words have landed the split is undone, leaving the heading's own markup.
 */
export function riseWords(
  el: Element | null,
  {
    distance = 0.38,
    duration = 0.95,
    stagger = 0.05,
  }: { distance?: number; duration?: number; stagger?: number } = {},
): gsap.core.Timeline {
  const tl = gsap.timeline();
  if (!(el instanceof HTMLElement)) return tl;
  const grads = Array.from(el.querySelectorAll<HTMLElement>(".grad-text"));
  const split = SplitText.create(el, {
    type: "words",
    wordsClass: "story-word",
    ignore: grads.length > 0 ? grads : undefined,
  });
  const units = [...split.words, ...grads].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  const size = parseFloat(getComputedStyle(el).fontSize) || 80;
  gsap.set(units, { position: "relative", top: 0 });
  tl.fromTo(
    units,
    { top: size * distance, opacity: 0 },
    { top: 0, opacity: 1, duration, ease: "deck.enter", stagger },
  );
  tl.call(() => {
    split.revert();
    if (grads.length > 0) {
      gsap.set(grads, { clearProps: "position,top,opacity" });
    }
  });
  return tl;
}

/**
 * Plain text out of a React node, for choosing a type size by length.
 */
export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean")
    return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) {
    const props = node.props as { children?: ReactNode };
    return textOf(props.children);
  }
  return "";
}

/**
 * How far a vertically centred block must sit below its resting place so that
 * only the part of it shown so far looks centred: half of what is still to
 * come under `shownBottom`. Heights are layout pixels (offset*), so the
 * canvas's scaling does not affect them.
 */
export function centreOffset(block: HTMLElement, shownBottom: number): number {
  return Math.max(0, (block.offsetHeight - shownBottom) / 2);
}

/** Bottom edge of `el` inside `block` (which must be `position: relative`). */
export function bottomIn(
  block: HTMLElement,
  el: Element | null | undefined,
): number {
  if (!(el instanceof HTMLElement)) return 0;
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== block) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return top + el.offsetHeight;
}
