"use client";

import { useRef, type ReactNode } from "react";

import { STAKEHOLDER_ORDER, STAKEHOLDERS, TEAM } from "~/content/team";
import type { StakeholderId } from "~/deck/types";
import { useSteps } from "~/deck/useSteps";
import { SlideBody, SlideHeader } from "~/ui/layout";
import { Avatar } from "~/ui/people";

import {
  cardShadow,
  IconTile,
  OwnerChip,
  Slot,
  SUBTITLE_MEASURE,
  tintBackground,
  TitleLines,
  useLockedSlots,
} from "./_stakeholder-parts";

export interface StakeholderMapProps {
  eyebrow?: ReactNode;
  title?: ReactNode;
  /** Bring one card forward and dim the rest: used to hand over. */
  highlight?: StakeholderId;
  /** A line under the cards: "Over to Ravya." */
  caption?: ReactNode;
  /** Show who researched each stakeholder. Default true. */
  owners?: boolean;
  /**
   * When true the owners arrive on step 1 instead of at once
   * (the slide then has 2 steps).
   */
  revealOwners?: boolean;
  step: number;
}

/** Card geometry on the canvas. Four of these fill the 1664px content box. */
const CARD = { height: 480, gap: 56, pad: 36, lift: 22 } as const;
/** Type sizes on the card; the opener grows each of them. */
export const MAP_SIZES = {
  icon: 40,
  title: 50,
  subtitle: 22,
  owner: 26,
} as const;

/**
 * The four stakeholders as four cards: icon, title, subtitle and who studied
 * them. This slide recurs before every stakeholder section, highlighting the
 * next one, and its cards morph into that section's opener.
 *
 * Flip ids, per stakeholder `s` (shared with SectionOpener):
 * `stake-${s}-card` (the card's box), `stake-${s}-icon`, `stake-${s}-title`,
 * `stake-${s}-subtitle`, `stake-${s}-owner` (the researcher's chip).
 *
 * Every visible piece of a card travels, so nothing on the highlighted card
 * vanishes when it grows into the opener.
 */
export function StakeholderMap({
  eyebrow,
  title,
  highlight,
  caption,
  owners = true,
  revealOwners = false,
  step,
}: StakeholderMapProps) {
  const root = useRef<HTMLDivElement>(null);
  const reveal = owners && revealOwners;
  useLockedSlots(root);

  useSteps(
    root,
    step,
    (tl, mark) => {
      if (!reveal) return;
      // Each researcher steps onto their card: the face first, the name
      // sliding out from behind it, one card after the next.
      STAKEHOLDER_ORDER.forEach((id, i) => {
        const at = i * 0.14;
        tl.from(
          `[data-owner="${id}"] > :first-child`,
          { scale: 0.4, opacity: 0, duration: 0.6, ease: "back.out(1.8)" },
          at,
        );
        tl.from(
          `[data-owner="${id}"] .owner-name`,
          { x: -28, opacity: 0, duration: 0.6, ease: "deck.enter" },
          at + 0.08,
        );
      });
      mark();
    },
    [reveal],
  );

  const captionPerson = highlight ? STAKEHOLDERS[highlight].owner : undefined;

  return (
    <SlideBody>
      <div ref={root} className="contents">
        {title && <SlideHeader eyebrow={eyebrow} title={title} />}
        <div
          className="mt-auto grid grid-cols-4 items-end"
          style={{ columnGap: CARD.gap, paddingTop: CARD.lift }}
        >
          {STAKEHOLDER_ORDER.map((id) => (
            <Card
              key={id}
              stakeholder={id}
              state={
                highlight === undefined
                  ? "even"
                  : highlight === id
                    ? "lit"
                    : "dim"
              }
              owners={owners}
            />
          ))}
        </div>
        {caption && (
          <div className="mt-14 flex items-center gap-5">
            {captionPerson && <Avatar person={captionPerson} size={60} />}
            <p className="t-lede text-fg">{caption}</p>
          </div>
        )}
      </div>
    </SlideBody>
  );
}

function Card({
  stakeholder: id,
  state,
  owners,
}: {
  stakeholder: StakeholderId;
  state: "even" | "lit" | "dim";
  owners: boolean;
}) {
  const s = STAKEHOLDERS[id];
  const lit = state === "lit";
  return (
    // The cell keeps the grid still while the card inside it is resized by a
    // morph (coming back from an opener, it starts stage-sized).
    <div className="relative" style={{ height: CARD.height }}>
      <div
        data-flip-id={`stake-${id}-card`}
        className="bg-card absolute inset-x-0 flex flex-col overflow-hidden"
        style={{
          top: lit ? -CARD.lift : 0,
          height: CARD.height,
          padding: CARD.pad,
          borderRadius: 28,
          opacity: state === "dim" ? 0.42 : 1,
          boxShadow: cardShadow(id, lit ? "lit" : "plain"),
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{
            background: tintBackground(
              id,
              lit ? 1 : state === "even" ? 0.6 : 0.35,
            ),
          }}
        />
        <Slot className="relative">
          <IconTile
            stakeholder={id}
            size={MAP_SIZES.icon}
            flipId={`stake-${id}-icon`}
          />
        </Slot>
        <Slot className="relative mt-auto">
          <h2
            data-flip-id={`stake-${id}-title`}
            className="font-display font-bold"
            style={{
              fontSize: MAP_SIZES.title,
              lineHeight: 0.98,
              letterSpacing: "-0.035em",
            }}
          >
            <TitleLines text={s.title} />
          </h2>
        </Slot>
        {/* Two lines tall on every card, so the four titles share a baseline. */}
        <Slot
          className="relative mt-3"
          style={{ minHeight: MAP_SIZES.subtitle * 1.36 * 2 }}
        >
          <p
            data-flip-id={`stake-${id}-subtitle`}
            className="text-muted"
            style={{
              fontSize: MAP_SIZES.subtitle,
              lineHeight: 1.36,
              maxWidth: SUBTITLE_MEASURE,
            }}
          >
            {s.subtitle}
          </p>
        </Slot>
        {owners && (
          <Slot className="relative mt-7">
            <OwnerChip
              stakeholder={id}
              size={MAP_SIZES.owner}
              flipId={`stake-${id}-owner`}
              data-owner={id}
              aria-label={`Researched by ${TEAM[s.owner].name}`}
            />
          </Slot>
        )}
      </div>
    </div>
  );
}
