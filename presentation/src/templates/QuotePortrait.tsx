"use client";

import { useRef, type ReactNode } from "react";

import { gsap } from "~/deck/gsap";
import { useSteps } from "~/deck/useSteps";
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

/** The portrait's width; it bleeds off the left edge and fades into the stage. */
const PORTRAIT_W = 900;
/** Pulled off the left edge a little, so the photo's edge dies before the type. */
const PORTRAIT_SHIFT = -70;

/**
 * A portrait, a quote set large, and what we took from it.
 *
 * Made for a slide without the deck's chrome: the photo runs the full height
 * off the left edge and dissolves into the stage. The quote rises a word at a
 * time as the slide arrives; on the build, it lifts to make room for our
 * reading of it.
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
        { opacity: 0, duration: 1.3, ease: "power2.out" },
        0,
      );
      tl.from(
        ".qp-photo-img",
        { scale: 1.08, xPercent: -2, duration: 2.6, ease: "power3.out" },
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
        { opacity: 0.6, duration: 0.8, ease: "power2.out" },
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
      {/* The portrait, bleeding off the left edge and fading into the stage. */}
      <div
        className="qp-photo absolute inset-y-0 overflow-hidden"
        style={{ width: PORTRAIT_W, left: PORTRAIT_SHIFT }}
      >
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
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(13,17,23,0) 26%, rgba(13,17,23,0.78) 56%, var(--bg) 82%), linear-gradient(0deg, var(--bg) 0%, rgba(13,17,23,0) 26%), linear-gradient(180deg, rgba(13,17,23,0.5) 0%, rgba(13,17,23,0) 18%)",
          }}
        />
      </div>

      {/* A breath of the brand's warmth behind the words. */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: 1300,
          top: 540,
          width: 1400,
          height: 1400,
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle at center, rgba(232,69,94,0.14) 0%, transparent 60%)",
        }}
      />

      <div
        className="absolute inset-y-0 right-[128px] flex items-center"
        style={{ left: 840 }}
      >
        <div className="qp-block relative flex w-full flex-col">
          <div className="qp-said flex flex-col">
            <span
              aria-hidden
              className="qp-mark grad-text font-display block self-start leading-none font-bold"
              style={{
                fontSize: 220,
                height: 120,
                marginLeft: -8,
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
              className="qp-rule mb-7 block h-[3px] w-[64px] origin-left rounded-full"
              style={{ background: "var(--grad-brand-h)" }}
            />
            <p className="t-h3 font-semibold">{author}</p>
            {role && <p className="t-small text-muted mt-2">{role}</p>}
            {source && (
              <p className="t-mono text-faint mt-4 text-[22px] tracking-[0.04em]">
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

      {image?.credit && (
        <p className="qp-credit t-mono absolute bottom-[34px] left-[44px] hidden text-[15px] text-white/45 group-has-[.qp-photo_img]:block">
          {image.credit}
        </p>
      )}
    </div>
  );
}

const quoteType = {
  fontSize: 68,
  lineHeight: 1.1,
  letterSpacing: "-0.03em",
  fontWeight: 600,
} as const;
