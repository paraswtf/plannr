"use client";

/**
 * GSAP, registered once, with every plugin the deck uses.
 *
 * Import from here rather than from "gsap" directly, so a slide can never use
 * a plugin that was not registered. All of these ship in the free `gsap`
 * package since 3.13.
 */
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { Flip } from "gsap/Flip";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { SplitText } from "gsap/SplitText";
import { TextPlugin } from "gsap/TextPlugin";

gsap.registerPlugin(
  useGSAP,
  CustomEase,
  DrawSVGPlugin,
  Flip,
  MorphSVGPlugin,
  MotionPathPlugin,
  ScrambleTextPlugin,
  SplitText,
  TextPlugin,
);

/**
 * The deck's two curves. `deck.morph` is the Magic Move curve: slow out of the
 * old place, quick through the middle, a long settle into the new one.
 * `deck.enter` is what everything that appears rather than travels uses.
 */
CustomEase.create("deck.morph", "M0,0 C0.6,0 0.2,1 1,1");
CustomEase.create("deck.enter", "M0,0 C0.16,1 0.3,1 1,1");

export const MORPH = { duration: 0.95, ease: "deck.morph" } as const;
export const ENTER = { duration: 0.75, ease: "deck.enter" } as const;

export {
  CustomEase,
  DrawSVGPlugin,
  Flip,
  gsap,
  MorphSVGPlugin,
  MotionPathPlugin,
  ScrambleTextPlugin,
  SplitText,
  TextPlugin,
  useGSAP,
};
