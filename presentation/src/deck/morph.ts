"use client";

import { useLayoutEffect, type RefObject } from "react";

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
 *   `var(--x)` / color-mix() colours set inline. A unitless inline
 *   line-height (`lineHeight: 1.15`) is read as 1.15px and collapses the
 *   lines in flight: set line heights with a class.
 * - Put the type size (and line height) on the flip element itself, not on
 *   a child, so the text grows or shrinks with the box as it travels.
 * - A traveller is lifted above its siblings while it flies (z-index 20).
 *   That only reaches the page if no ancestor between it and the slide makes
 *   a stacking context of its own (a z-index, a transform, an opacity below
 *   1), so keep such ancestors out of the way of a box that crosses others.
 * - A traveller carries `data-flying` while it flies, so a style can differ
 *   in flight (`[&[data-flying]]:…`): a one-line chip can let its text wrap
 *   as it does on the row it comes from, and take its one line on landing.
 * - A grid of boxes flying into a column (or back) passes boxes through each
 *   other's in-between sizes. Mark the template's root `data-flip-stagger`
 *   (on the slide either side) and the travellers leave one after another,
 *   in their order in that column (see columnOrder).
 * - A slide that should wait for its travellers to land before playing its
 *   own arrival can ask `arrivesByMorph(root)` while it builds it.
 * - A travelling element keeps its place in the layout while it flies, so if
 *   it changes size its neighbours move with it. Give it a parent box of a
 *   fixed size when they should stay put (see Slot in
 *   src/templates/_stakeholder-parts.tsx).
 */

/** Computed styles that morph along with the box. */
const MORPH_PROPS =
  "backgroundColor,color,borderRadius,boxShadow,fontSize,letterSpacing,lineHeight,opacity,padding";

/**
 * A problem's text while it flies between a two-line row of the list and a
 * one-line chip (ProblemTrack's cell and FeatureShowcase's chip). In flight
 * the box is a size container (Flip gives it an explicit size then); while its content
 * box is shorter than two lines the text runs on one line, clipped by a
 * soft fade in the box's right padding, instead of a second line cut
 * through. Text that fits ends where the fade begins, so it is never faded.
 */
export const FLIGHT_BOX = "[&[data-flying]]:[container:flight/size]";
export const FLIGHT_TEXT =
  "[@container_flight_(max-height:2.5em)]:-mr-[14px] [@container_flight_(max-height:2.5em)]:grow [@container_flight_(max-height:2.5em)]:overflow-hidden [@container_flight_(max-height:2.5em)]:whitespace-nowrap [@container_flight_(max-height:2.5em)]:[mask-image:linear-gradient(to_right,#000_calc(100%_-_14px),transparent)]";

/** Between one traveller leaving and the next, on a staggered morph. */
export const MORPH_STAGGER = 0.06;

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
  /** Reduced motion: nothing travels, the slides just cross-fade, quickly. */
  dissolve?: boolean;
  onComplete: () => void;
}

/** Play the transition. Returns its timeline, so it can be finished early. */
export function runMorph({
  capture,
  from,
  to,
  extraScopes,
  dissolve = false,
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

  // A staggered morph sets each traveller's z-index itself; landing puts the
  // old values back and ends the flight's styles (data-flying).
  const zIndexes = new Map<HTMLElement, string>();
  const land = () => {
    for (const el of travellers) delete el.dataset.flying;
    zIndexes.forEach((z, el) => (el.style.zIndex = z));
  };
  const tl = gsap.timeline({
    onComplete: () => {
      if (replaced.length > 0) gsap.set(replaced, { clearProps: "visibility" });
      land();
      onComplete();
    },
  });

  gsap.set(to, { autoAlpha: 1, pointerEvents: "auto" });
  gsap.set(from, { pointerEvents: "none" });
  if (replaced.length > 0) gsap.set(replaced, { visibility: "hidden" });

  if (dissolve) {
    tl.to(from, { autoAlpha: 0, duration: 0.25, ease: "power1.out" }, 0);
    tl.from(to, { autoAlpha: 0, duration: 0.3, ease: "power1.out" }, 0);
    return tl;
  }

  if (capture && travellers.length > 0) {
    const into = to.querySelector("[data-flip-stagger]") !== null;
    const column = into
      ? to
      : from.querySelector("[data-flip-stagger]") !== null
        ? from
        : null;
    const stagger = column !== null;
    // Flip keeps its own order of the targets, so the stagger goes by each
    // one's turn rather than by its place in the list.
    const turn = new Map(
      stagger
        ? columnOrder(travellers, lookup, column, into, zIndexes).map(
            (el, i) => [el, i] as const,
          )
        : [],
    );
    tl.add(
      Flip.from(capture.state, {
        targets: travellers,
        duration: MORPH.duration,
        ease: MORPH.ease,
        nested: true,
        prune: true,
        absolute: false,
        scale: false,
        // Above their siblings while they fly, so a box travelling back to
        // its row passes over the rows it crosses, not under them. Flip puts
        // the old value back when it lands. Staggered, they leave in turn,
        // and columnOrder has stacked them.
        ...(stagger
          ? {
              stagger: (_: number, el: Element) =>
                (turn.get(el as HTMLElement) ?? 0) * MORPH_STAGGER,
            }
          : { zIndex: 20 }),
        // As soon as the boxes land, while Flip lets go of their sizes.
        onComplete: land,
      }),
      0,
    );
    // Set once Flip has measured where each one lands, so only the flight
    // sees it.
    for (const el of travellers) el.dataset.flying = "";
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
 * The order a staggered morph flies in, and how its travellers stack: by
 * their places in the column (the opted-in slide). Into the column, the top
 * row leaves first; out of it, the bottom row does, so going back plays the
 * way in in reverse. A box lower in the column flies over the ones above it,
 * both ways.
 */
function columnOrder(
  travellers: HTMLElement[],
  lookup: Record<string, Flip.ElementState | undefined>,
  column: HTMLElement,
  arriving: boolean,
  saved: Map<HTMLElement, string>,
): HTMLElement[] {
  const place = new Map(
    Array.from(column.querySelectorAll("[data-flip-id]")).map((el, i) => [
      el,
      i,
    ]),
  );
  const at = (el: HTMLElement) =>
    place.get(arriving ? el : lookup[el.dataset.flipId!]!.element) ?? 0;
  const ordered = [...travellers].sort((a, b) => at(a) - at(b));
  ordered.forEach((el, i) => {
    saved.set(el, el.style.zIndex);
    el.style.zIndex = String(20 + i);
  });
  return arriving ? ordered : ordered.reverse();
}

/**
 * Whether the slide holding `el` is arriving by a morph: some element in it
 * has a partner on the slide it replaces, which is still on the canvas while
 * the new slide builds its arrival. Lets a slide hold its own entrance until
 * its travellers have nearly landed.
 */
export function arrivesByMorph(el: Element | null): boolean {
  const own = el?.closest<HTMLElement>("[data-slide]");
  if (!el || !own) return false;
  const ids = new Set(
    Array.from(el.querySelectorAll<HTMLElement>("[data-flip-id]")).map(
      (t) => t.dataset.flipId,
    ),
  );
  if (ids.size === 0) return false;
  return Array.from(own.parentElement?.children ?? []).some(
    (other) =>
      other !== own &&
      other instanceof HTMLElement &&
      other.dataset.slide !== undefined &&
      Array.from(other.querySelectorAll<HTMLElement>("[data-flip-id]")).some(
        (t) => ids.has(t.dataset.flipId),
      ),
  );
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

/**
 * Locks every `[data-lock]` box under `root` to the size it is laid out at,
 * so the traveller pinned inside it can be any size in flight without moving
 * its neighbours (the same contract as Slot / useLockedSlots in
 * src/templates/_stakeholder-parts.tsx).
 *
 * It runs as a layout effect, before the deck starts the morph. If the fonts
 * were still loading it measures again once they are in, but never while a
 * slot's traveller is in flight: a slide's first font often finishes loading
 * mid-morph, and a measure then would lock the slot to the flying size.
 */
export function useFlightSlots(root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const slots = Array.from(el.querySelectorAll<HTMLElement>("[data-lock]"));
    if (slots.length === 0) return;
    const lock = () => {
      for (const slot of slots) {
        slot.style.width = "";
        slot.style.height = "";
      }
      const sizes = slots.map(
        (slot) => [slot.offsetWidth, slot.offsetHeight] as const,
      );
      slots.forEach((slot, i) => {
        const [w, h] = sizes[i]!;
        slot.style.width = `${w}px`;
        slot.style.height = `${h}px`;
      });
    };
    lock();
    let live = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const relock = () => {
      if (!live) return;
      const flying = slots.some((slot) =>
        Array.from(slot.children).some((child) => gsap.isTweening(child)),
      );
      if (flying) retry = setTimeout(relock, 200);
      else lock();
    };
    if (
      typeof document !== "undefined" &&
      document.fonts &&
      document.fonts.status !== "loaded"
    ) {
      void document.fonts.ready.then(relock);
    }
    return () => {
      live = false;
      if (retry) clearTimeout(retry);
    };
  }, [root]);
}
