"use client";

import { useRef, type ReactNode } from "react";

import { gsap } from "~/deck/gsap";
import { useSteps } from "~/deck/useSteps";
import { Bezel } from "~/ui/frames";
import { ImageSlot } from "~/ui/placeholder";

import {
  bottomIn,
  centreOffset,
  riseWords,
  useEntrance,
} from "./_story-motion";

export interface QuotePortraitProps {
  /** The speaker's photo. Without it, a labelled slot is drawn. */
  image?: { src: string; alt: string; credit?: string; position?: string };
  imageLabel?: string;
  quote: ReactNode;
  author: ReactNode;
  role?: ReactNode;
  /** Where and when it was said: "BusinessWeek, 1998". */
  source?: ReactNode;
  /** Our reading of the quote, on step 1. Steps = takeaway ? 2 : 1. */
  takeaway?: ReactNode;
  step: number;
}

/** The portrait's plate: a tall frame on the left, the full height of the canvas's middle. */
const PORTRAIT = { left: 128, top: 124, width: 600, height: 784 } as const;
/** Where the quote's column starts. */
const QUOTE_LEFT = 856;

/**
 * A portrait, a quote set large, and what we took from it.
 *
 * Made for a slide without the deck's chrome: the photo stands on the left in
 * a double bezel, settling into its frame as the slide arrives, its credit in
 * plain small type at its foot. The quote rises a word at a time; on the
 * build, it lifts to make room for our reading of it.
 */
export function QuotePortrait({
  image,
  imageLabel,
  quote,
  author,
  role,
  source,
  takeaway,
  step,
}: QuotePortraitProps) {
  const root = useRef<HTMLDivElement>(null);

  useEntrance(
    root,
    (tl) => {
      tl.from(
        ".qp-photo",
        { opacity: 0, y: 48, duration: 1.1, ease: "deck.enter" },
        0,
      );
      tl.from(
        ".qp-photo-img",
        { scale: 1.12, yPercent: 2, duration: 2.6, ease: "power3.out" },
        0,
      );
      tl.from(
        ".qp-mark",
        { opacity: 0, y: 40, duration: 0.9, ease: "deck.enter" },
        0.25,
      );
      tl.add(
        riseWords(root.current?.querySelector(".qp-quote") ?? null, {
          stagger: 0.045,
        }),
        0.35,
      );
      tl.from(
        ".qp-rule",
        { scaleX: 0, duration: 0.7, ease: "power3.out" },
        1.15,
      );
      tl.from(
        ".qp-attr > *",
        { opacity: 0, y: 16, duration: 0.7, ease: "deck.enter", stagger: 0.1 },
        1.2,
      );
      tl.from(".qp-credit", { opacity: 0, duration: 0.8 }, 1.4);
    },
    step,
  );

  useSteps(
    root,
    step,
    (tl, mark) => {
      const block = root.current?.querySelector<HTMLElement>(".qp-block");
      const take = root.current?.querySelector<HTMLElement>(".qp-take");
      if (!block || !take) return;
      const before = centreOffset(
        block,
        bottomIn(block, root.current?.querySelector(".qp-attr")),
      );
      gsap.set(block, { y: before });
      tl.to(block, { y: 0, duration: 1, ease: "deck.morph" });
      tl.to(
        ".qp-said",
        { opacity: 0.5, duration: 0.8, ease: "power2.out" },
        0.1,
      );
      tl.fromTo(
        ".qp-take-rule",
        { scaleX: 0 },
        { scaleX: 1, duration: 0.6, ease: "power3.out", immediateRender: true },
        0.45,
      );
      tl.fromTo(
        take,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: "deck.enter",
          immediateRender: true,
        },
        0.5,
      );
      mark();
    },
    [!!takeaway],
  );

  return (
    <div
      ref={root}
      data-no-enter
      className="group absolute inset-0 overflow-hidden"
    >
      {/* The portrait, in a bezel, settling into its frame. */}
      <div className="qp-photo absolute" style={PORTRAIT}>
        <Bezel className="h-full w-full">
          <div className="qp-photo-img absolute inset-0">
            <ImageSlot
              src={image?.src}
              alt={image?.alt}
              position={image?.position}
              label={imageLabel ?? "Portrait"}
              radius={0}
              className="h-full w-full"
            />
          </div>
        </Bezel>
        {image?.credit && (
          <p className="qp-credit text-faint absolute top-full left-2 mt-4 hidden text-[15px] leading-snug group-has-[.qp-photo_img]:block">
            {image.credit}
          </p>
        )}
      </div>

      <div
        className="absolute inset-y-0 right-[128px] flex items-center"
        style={{ left: QUOTE_LEFT }}
      >
        <div className="qp-block relative flex w-full flex-col">
          <div className="qp-said flex flex-col">
            <span
              aria-hidden
              className="qp-mark font-display text-faint/55 block self-start leading-none font-semibold"
              style={{
                fontSize: 180,
                height: 96,
                marginLeft: -6,
                letterSpacing: "-0.04em",
              }}
            >
              &ldquo;
            </span>
            <blockquote
              className="qp-quote font-display text-fg mt-2 text-balance"
              style={quoteType}
            >
              {quote}
            </blockquote>
          </div>
          <div className="qp-attr mt-12 flex flex-col">
            <span
              className="qp-rule bg-fg mb-7 block h-[2px] w-[48px] origin-left rounded-full"
              aria-hidden
            />
            <p className="font-display text-fg text-[30px] leading-tight font-semibold tracking-[-0.015em]">
              {author}
            </p>
            {(role ?? source) && (
              <p className="t-label text-muted mt-3">
                {role}
                {role && source && (
                  <span aria-hidden className="text-faint mx-2.5">
                    ·
                  </span>
                )}
                {source}
              </p>
            )}
          </div>
          {takeaway && (
            <div className="qp-take mt-16 flex flex-col">
              <span
                className="qp-take-rule bg-line-strong mb-10 block h-px w-full origin-left"
                aria-hidden
              />
              <p
                className="t-lede text-fg max-w-[30ch] text-pretty"
                style={{ fontSize: 42, lineHeight: 1.3 }}
              >
                {takeaway}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const quoteType = {
  fontSize: 68,
  lineHeight: 1.1,
  letterSpacing: "-0.03em",
  fontWeight: 600,
} as const;
