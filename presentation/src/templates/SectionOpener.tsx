"use client";

import { useRef, type ReactNode } from "react";

import { STAKEHOLDERS } from "~/content/team";
import { gsap, useGSAP } from "~/deck/gsap";
import { useDeckRuntime } from "~/deck/runtime";
import type { StakeholderId } from "~/deck/types";

import {
  cardShadow,
  IconTile,
  INK,
  OwnerChip,
  Slot,
  StakePhoto,
  SUBTITLE_MEASURE,
  TitleLines,
  useLockedSlots,
} from "./_stakeholder-parts";

export interface SectionOpenerProps {
  stakeholder: StakeholderId;
  /**
   * The section's number in the talk: "01". No longer drawn (the deck does
   * not number things for decoration); kept so the section files need not
   * change.
   */
  number: string;
  /** Defaults to the stakeholder's title. */
  title?: ReactNode;
  /** Defaults to the stakeholder's subtitle. */
  subtitle?: ReactNode;
  /**
   * One sentence that sets the section up. It rises in with "Presented by"
   * once the card has landed (no extra build).
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
 * The sheet: the map card grown to the content box (x 128-1792, y 132-976),
 * clear of the deck's top bar and progress line. Like the card, it is the
 * tray of a double bezel: the photo plate sits an 8px rim inside its right
 * edge, so the radii stay concentric (30 outside, 22 on the plate).
 */
const SHEET = {
  left: 128,
  right: 128,
  top: 132,
  bottom: 104,
  radius: 30,
  rim: 8,
} as const;
/** Content inset inside the sheet. */
const PAD = { x: 88, top: 72, bottom: 76 } as const;
/** The photo plate's width; it runs the sheet's full height inside the rim. */
const PHOTO = { width: 624, gap: 96 } as const;

/** What each travelling piece grows to (StakeholderMap's MAP_SIZES are the start). */
const SIZES = {
  icon: 32,
  title: 168,
  titleWithPhoto: 128,
  subtitle: 34,
  owner: 32,
} as const;

/**
 * The first slide of a stakeholder's section: their card from the
 * stakeholder map, grown to fill the stage.
 *
 * Shares flip ids with StakeholderMap: `stake-${s}-card`, `-photo`, `-icon`,
 * `-title`, `-subtitle` and `-owner`. Arriving from the map, the lifted card
 * expands into this sheet, its photo strip opens into the tall photo panel,
 * and its icon, title, subtitle and researcher each travel to their new
 * places and sizes. Everything else (the lede, "Presented by", the photo
 * credit) rises in once the sheet has landed. Arriving from anywhere else,
 * the photo slides in from the right on its own.
 */
export function SectionOpener({
  stakeholder,
  title,
  subtitle,
  lede,
  photo,
}: SectionOpenerProps) {
  const root = useRef<HTMLDivElement>(null);
  const { instant } = useDeckRuntime();
  const s = STAKEHOLDERS[stakeholder];
  const withPhoto = photo !== undefined;
  useLockedSlots(root);

  // The pieces that do not travel wait for the sheet to land, then rise.
  useGSAP(
    (_ctx, contextSafe) => {
      if (instant) return;
      gsap.from("[data-opener-in]", {
        opacity: 0,
        y: 28,
        duration: 0.8,
        ease: "deck.enter",
        stagger: 0.09,
        delay: 0.62,
      });
      gsap.from("[data-photo-credit]", {
        opacity: 0,
        duration: 0.6,
        ease: "deck.enter",
        delay: 0.9,
      });
      if (!withPhoto || !contextSafe) return;
      // The photo travels from the map's card when there is one. The morph
      // starts in the deck's layout effect, after this one, so look a frame
      // later: if nothing is moving the photo, it arrived from elsewhere and
      // slides in by itself (before that first frame is painted).
      const slideIn = contextSafe(() => {
        const el = root.current?.querySelector("[data-opener-photo]");
        if (!el || gsap.getTweensOf(el).length > 0) return;
        gsap.from(el, {
          opacity: 0,
          x: 96,
          duration: 1.1,
          ease: "expo.out",
          delay: 0.2,
        });
      });
      const frame = requestAnimationFrame(slideIn);
      return () => cancelAnimationFrame(frame);
    },
    { scope: root },
  );

  const presentedBy = (
    <div className="flex items-center gap-6">
      <span data-no-enter data-opener-in className="t-label text-muted">
        Presented by
      </span>
      <Slot>
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
      {/* The card, grown into the sheet. */}
      <div
        data-flip-id={`stake-${stakeholder}-card`}
        className="bg-card absolute"
        style={{
          left: SHEET.left,
          right: SHEET.right,
          top: SHEET.top,
          bottom: SHEET.bottom,
          padding: SHEET.rim,
          borderRadius: SHEET.radius,
          boxShadow: cardShadow(stakeholder, "panel"),
        }}
      />

      {withPhoto && (
        <StakePhoto
          stakeholder={stakeholder}
          src={photo.src}
          alt={photo.alt}
          position={photo.position}
          credit={photo.credit}
          flipId={`stake-${stakeholder}-photo`}
          radius={SHEET.radius - SHEET.rim}
          data-no-enter
          data-opener-photo
          style={{
            position: "absolute",
            right: SHEET.right + SHEET.rim,
            top: SHEET.top + SHEET.rim,
            bottom: SHEET.bottom + SHEET.rim,
            width: PHOTO.width,
          }}
        />
      )}

      {/* The words, in a column down the sheet's left. */}
      <div
        className="absolute flex flex-col"
        style={{
          left: SHEET.left + PAD.x,
          top: SHEET.top + PAD.top,
          bottom: SHEET.bottom + PAD.bottom,
          right: withPhoto
            ? SHEET.right + SHEET.rim + PHOTO.width + PHOTO.gap
            : SHEET.right + PAD.x,
        }}
      >
        <div className="flex items-center justify-between">
          <Slot>
            <IconTile
              stakeholder={stakeholder}
              size={SIZES.icon}
              flipId={`stake-${stakeholder}-icon`}
            />
          </Slot>
          {presentedBy}
        </div>

        <div className="mt-auto flex flex-col">
          <Slot>
            <h1
              data-flip-id={`stake-${stakeholder}-title`}
              className="font-display font-semibold"
              style={{
                fontSize: withPhoto ? SIZES.titleWithPhoto : SIZES.title,
                lineHeight: 1,
                letterSpacing: "-0.03em",
                color: INK.fg,
              }}
            >
              {title ?? <TitleLines text={s.title} />}
            </h1>
          </Slot>
          <Slot className="mt-6">
            <p
              data-flip-id={`stake-${stakeholder}-subtitle`}
              style={{
                fontSize: SIZES.subtitle,
                lineHeight: 1.36,
                maxWidth: SUBTITLE_MEASURE,
                color: INK.accent,
              }}
            >
              {subtitle ?? s.subtitle}
            </p>
          </Slot>
          {lede !== undefined && (
            <p
              data-no-enter
              data-opener-in
              className="text-body mt-10 max-w-[32ch] text-pretty"
              style={{ fontSize: 30, lineHeight: 1.42 }}
            >
              {lede}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
