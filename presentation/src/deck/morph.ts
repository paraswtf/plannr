"use client";

import { ENTER, Flip, gsap, MORPH } from "./gsap";

/**
 * The slide-to-slide transition: Keynote's Magic Move, built on GSAP Flip.
 *
 * Any element carrying `data-flip-id` is a candidate. When the next slide has
 * an element with the same id, the new element starts exactly where the old
 * one was — same box, same colour, same type size — and travels to its own
 * place. Everything that has no partner dissolves: the old slide fades out as
 * a whole, and the new slide's other content fades in around the travellers.
 *
 * The rules a slide author needs:
 *
 * - Give an element `data-flip-id="…"` on both slides to make it travel. Ids
 *   must be unique within a slide. Put the id on a block or inline-block box,
 *   not a bare inline span.
 * - Do not tween a flip element yourself; animate its children instead.
 * - Inside a travelling element, mark children with `data-enter` to have them
 *   fade in as it lands (a phone whose screen changes as it moves, say).
 * - Mark a subtree `data-no-enter` when you choreograph its entrance yourself.
 *   Anything you already have a tween on is left alone automatically.
 * - Inline styles on a flip element should be plain px and rgb()/hex: the
 *   morph starts from the computed value and cannot interpolate `em` widths or
 *   `var(--x)` / color-mix() colours set inline.
 * - A travelling element keeps its place in the layout while it flies, so if
 *   it changes size its neighbours move with it. Give it a parent box of a
 *   fixed size when they should stay put (see Slot in
 *   src/templates/_stakeholder-parts.tsx).
 */

/** Computed styles that morph along with the box. */
const MORPH_PROPS =
  "backgroundColor,color,borderRadius,boxShadow,fontSize,letterSpacing,lineHeight,opacity,padding";

export interface MorphCapture {
  state: Flip.FlipState;
}

/** Record where every candidate is, before React swaps the slide. */
export function captureMorph(scopes: Element[]): MorphCapture | null {
  const elements = scopes.flatMap((scope) =>
    Array.from(scope.querySelectorAll<HTMLElement>("[data-flip-id]")),
  );
  if (elements.length === 0) return null;
  if (process.env.NODE_ENV !== "production") warnOnDuplicates(elements);
  return { state: Flip.getState(elements, { props: MORPH_PROPS }) };
}

interface RunMorph {
  capture: MorphCapture | null;
  /** The slide on its way out. It is faded, then unmounted by the caller. */
  from: HTMLElement;
  /** The slide arriving. */
  to: HTMLElement;
  /** Other places a partner may live, such as the deck's top bar. */
  extraScopes: Element[];
  onComplete: () => void;
}

/** Play the transition. Returns its timeline, so it can be finished early. */
export function runMorph({
  capture,
  from,
  to,
  extraScopes,
  onComplete,
}: RunMorph): gsap.core.Timeline {
  const lookup = (capture?.state.idLookup ?? {}) as Record<
    string,
    Flip.ElementState | undefined
  >;

  const candidates = [to, ...extraScopes].flatMap((scope) =>
    Array.from(scope.querySelectorAll<HTMLElement>("[data-flip-id]")),
  );
  const travellers = candidates.filter((el) => {
    const id = el.dataset.flipId;
    return id !== undefined && lookup[id] !== undefined;
  });

  // The partners that are being replaced must vanish at once: the new
  // element is drawn over the old one's place from the first frame.
  const replaced = travellers
    .map((el) => lookup[el.dataset.flipId!]!.element)
    .filter((old) => from.contains(old));

  const tl = gsap.timeline({
    onComplete: () => {
      if (replaced.length > 0) gsap.set(replaced, { clearProps: "visibility" });
      onComplete();
    },
  });

  gsap.set(to, { autoAlpha: 1, pointerEvents: "auto" });
  gsap.set(from, { pointerEvents: "none" });
  if (replaced.length > 0) gsap.set(replaced, { visibility: "hidden" });

  if (capture && travellers.length > 0) {
    tl.add(
      Flip.from(capture.state, {
        targets: travellers,
        duration: MORPH.duration,
        ease: MORPH.ease,
        nested: true,
        prune: true,
        absolute: false,
        scale: false,
      }),
      0,
    );
  }

  tl.to(from, { autoAlpha: 0, duration: 0.42, ease: "power1.out" }, 0);

  const units = enterUnits(to, new Set(travellers));
  if (units.length > 0) {
    tl.from(
      units,
      {
        opacity: 0,
        duration: ENTER.duration,
        ease: "power2.out",
        stagger: { amount: Math.min(0.42, units.length * 0.045) },
        immediateRender: true,
      },
      0.14,
    );
  }

  // Never shorter than the morph, so a slide with nothing to fade in still
  // holds the old one long enough to dissolve.
  if (tl.duration() < MORPH.duration)
    tl.to({}, { duration: MORPH.duration }, 0);
  return tl;
}

/**
 * The pieces of the new slide that fade in.
 *
 * The slide is split around the travellers: a subtree with no traveller in it
 * fades as one piece, and a subtree holding one is opened up so that its other
 * children fade while the traveller stays fully opaque in flight.
 */
function enterUnits(root: Element, travellers: Set<Element>): Element[] {
  const units: Element[] = [];
  const holdsTraveller = (el: Element) => {
    for (const t of travellers) if (el !== t && el.contains(t)) return true;
    return false;
  };
  const visit = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (child.hasAttribute("data-no-enter")) continue;
      if (travellers.has(child)) {
        units.push(...Array.from(child.querySelectorAll("[data-enter]")));
        continue;
      }
      if (holdsTraveller(child)) visit(child);
      else units.push(child);
    }
  };
  visit(root);
  return units.filter(
    (el) =>
      gsap.getTweensOf(el).length === 0 &&
      getComputedStyle(el).opacity !== "0" &&
      getComputedStyle(el).visibility !== "hidden",
  );
}

function warnOnDuplicates(elements: HTMLElement[]) {
  const seen = new Map<string, HTMLElement>();
  for (const el of elements) {
    const id = el.dataset.flipId!;
    const other = seen.get(id);
    if (other?.closest("[data-slide]") === el.closest("[data-slide]")) {
      console.warn(`[deck] data-flip-id "${id}" is used twice on one slide`);
    }
    seen.set(id, el);
  }
}
