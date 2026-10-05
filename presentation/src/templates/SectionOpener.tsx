"use client";

import { useRef, type ReactNode } from "react";

import { STAKEHOLDER_ORDER, STAKEHOLDERS } from "~/content/team";
import { gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";
import type { StakeholderId } from "~/deck/types";
import { ImageSlot } from "~/ui/placeholder";

import {
  cardShadow,
  IconTile,
  OwnerChip,
  rgb,
  rgba,
  Slot,
  SUBTITLE_MEASURE,
  tintBackground,
  TitleLines,
  useLockedSlots,
} from "./_stakeholder-parts";

export interface SectionOpenerProps {
  stakeholder: StakeholderId;
  /** The section's number in the talk: "01". */
  number: string;
  /** Defaults to the stakeholder's title. */
  title?: ReactNode;
  /** Defaults to the stakeholder's subtitle. */
  subtitle?: ReactNode;
  /**
   * One sentence that sets the section up. It rises in with the section
   * number and "Presented by" once the card has landed (no extra build).
   */
  lede?: ReactNode;
  /**
   * A photo of these people at it (public/images/stakeholders/<id>.jpg).
   * Optional: without one the opener must still look finished.
   */
  photo?: { src: string; alt: string; credit?: string; position?: string };
  step: number;
}

/**
 * The panel: the stage inset so the deck's top bar sits above it and the
 * progress line and counter below it, on the dark stage, where they always
 * read. Its edges line up with the top bar's 64px margins.
 */
const PANEL = {
  left: 64,
  right: 64,
  top: 112,
  bottom: 72,
  radius: 48,
} as const;
/** Content inset inside the panel. */
const PAD = { x: 96, top: 72, bottom: 80 } as const;
/** The photo sits this far in from the panel's edge (radius 48 - 24 = 24). */
const PHOTO = { inset: 24, width: 640 } as const;

/** What each travelling piece grows to (StakeholderMap's MAP_SIZES are the start). */
const SIZES = {
  icon: 56,
  title: 176,
  titleWithPhoto: 136,
  subtitle: 36,
  owner: 38,
} as const;

/**
 * The first slide of a stakeholder's section: their card from the
 * stakeholder map, grown to fill the stage.
 *
 * Shares flip ids with StakeholderMap — `stake-${s}-card`, `-icon`, `-title`,
 * `-subtitle` and `-owner` — so arriving from the map, the highlighted card
 * expands into this panel, and its icon, title, subtitle and researcher each
 * travel to their new places and sizes. Everything else (the section number,
 * the lede, "Presented by", the photo) rises in once the panel has landed.
 */
export function SectionOpener({
  stakeholder,
  number,
  title,
  subtitle,
  lede,
  photo,
}: SectionOpenerProps) {
  const root = useRef<HTMLDivElement>(null);
  const { instant } = useDeckRuntime();
  const s = STAKEHOLDERS[stakeholder];
  const withPhoto = photo !== undefined;
  const total = String(STAKEHOLDER_ORDER.length).padStart(2, "0");
  useLockedSlots(root);

  // The pieces that do not travel wait for the panel to land, then rise.
  useGSAP(
    () => {
      if (instant) return;
      gsap.from("[data-opener-in]", {
        opacity: 0,
        y: 28,
        duration: 0.8,
        ease: "deck.enter",
        stagger: 0.09,
        delay: 0.62,
      });
      if (withPhoto) {
        gsap.from("[data-opener-photo]", {
          opacity: 0,
          x: 80,
          duration: 1,
          ease: "expo.out",
          delay: 0.5,
        });
      }
    },
    { scope: root },
  );

  const presentedBy = (
    <div className="flex flex-col items-end">
      <span data-no-enter data-opener-in className="t-eyebrow text-faint">
        Presented by
      </span>
      <Slot className="mt-5">
        <OwnerChip
          stakeholder={stakeholder}
          size={SIZES.owner}
          flipId={`stake-${stakeholder}-owner`}
        />
      </Slot>
    </div>
  );

  return (
    <div ref={root} className="absolute inset-0">
      {/* The card, grown into the stage. */}
      <div
        data-flip-id={`stake-${stakeholder}-card`}
        className="bg-card absolute overflow-hidden"
        style={{
          left: PANEL.left,
          right: PANEL.right,
          top: PANEL.top,
          bottom: PANEL.bottom,
          borderRadius: PANEL.radius,
          boxShadow: cardShadow(stakeholder, "panel"),
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: tintBackground(stakeholder) }}
        />
        <div
          aria-hidden
          data-enter
          className="pointer-events-none absolute"
          style={{
            right: -260,
            top: -340,
            width: 1100,
            height: 1100,
            background: `radial-gradient(circle at center, ${rgba(stakeholder, 0.2)} 0%, transparent 62%)`,
          }}
        />
        {!withPhoto && (
          <span
            aria-hidden
            data-enter
            className="font-display pointer-events-none absolute leading-none font-bold select-none"
            style={{
              right: PAD.x - 18,
              top: PAD.top - 40,
              fontSize: 340,
              letterSpacing: "-0.06em",
              color: "transparent",
              WebkitTextStroke: `2px ${rgba(stakeholder, 0.34)}`,
            }}
          >
            {number}
          </span>
        )}
      </div>

      {withPhoto && (
        <div
          data-no-enter
          data-opener-photo
          className="absolute"
          style={{
            right: PANEL.right + PHOTO.inset,
            top: PANEL.top + PHOTO.inset,
            bottom: PANEL.bottom + PHOTO.inset,
            width: PHOTO.width,
          }}
        >
          <ImageSlot
            src={photo.src}
            alt={photo.alt}
            credit={photo.credit}
            position={photo.position}
            label={`Photo: ${s.title.toLowerCase()} at SICSR`}
            radius={PANEL.radius - PHOTO.inset}
            className="h-full w-full"
          />
        </div>
      )}

      {/* The words, in a column down the panel's left. */}
      <div
        className="absolute flex flex-col"
        style={{
          left: PANEL.left + PAD.x,
          top: PANEL.top + PAD.top,
          bottom: PANEL.bottom + PAD.bottom,
          right: withPhoto
            ? PANEL.right + PHOTO.inset + PHOTO.width + 88
            : PANEL.right + PAD.x,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-7">
            <Slot>
              <IconTile
                stakeholder={stakeholder}
                size={SIZES.icon}
                flipId={`stake-${stakeholder}-icon`}
              />
            </Slot>
            <span
              data-no-enter
              data-opener-in
              className="t-eyebrow flex items-center gap-3"
            >
              <span style={{ color: s.color }}>Stakeholder {number}</span>
              <span className="text-faint">/ {total}</span>
            </span>
          </div>
          {withPhoto && presentedBy}
        </div>

        <div className="mt-auto flex items-end justify-between gap-16">
          <div className="flex min-w-0 flex-col">
            <Slot>
              <h1
                data-flip-id={`stake-${stakeholder}-title`}
                className="font-display font-bold"
                style={{
                  fontSize: withPhoto ? SIZES.titleWithPhoto : SIZES.title,
                  lineHeight: 0.98,
                  letterSpacing: "-0.035em",
                }}
              >
                {title ?? <TitleLines text={s.title} />}
              </h1>
            </Slot>
            <Slot className="mt-7">
              <p
                data-flip-id={`stake-${stakeholder}-subtitle`}
                style={{
                  fontSize: SIZES.subtitle,
                  lineHeight: 1.36,
                  maxWidth: SUBTITLE_MEASURE,
                  color: rgb(stakeholder),
                }}
              >
                {subtitle ?? s.subtitle}
              </p>
            </Slot>
            {lede !== undefined && (
              <p
                data-no-enter
                data-opener-in
                className="text-muted mt-8 max-w-[34ch] text-pretty"
                style={{ fontSize: 32, lineHeight: 1.36 }}
              >
                {lede}
              </p>
            )}
          </div>
          {!withPhoto && <div className="shrink-0">{presentedBy}</div>}
        </div>
      </div>
    </div>
  );
}
