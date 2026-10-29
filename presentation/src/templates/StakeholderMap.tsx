"use client";

import { useRef, type ReactNode } from "react";

import { STAKEHOLDER_ORDER, STAKEHOLDERS, TEAM } from "~/content/team";
import type { SpeakerId, StakeholderId } from "~/deck/types";
import { useSteps } from "~/deck/useSteps";
import { SlideBody, SlideHeader } from "~/ui/layout";
import { Avatar } from "~/ui/people";
import { Chip } from "~/ui/surfaces";

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

export interface StakeholderMapProps {
  eyebrow?: ReactNode;
  title?: ReactNode;
  /** Lift one card forward and quieten the rest: used to hand over. */
  highlight?: StakeholderId;
  /**
   * Cards struck off as out of scope: greyed back, the name crossed out, and
   * "Out of scope" where the researcher would be.
   */
  struck?: StakeholderId[];
  /** A line under the cards: "Over to Ravya." */
  caption?: ReactNode;
  /**
   * Whose face goes with the caption. Defaults to whoever researched the
   * highlighted card; set it when handing over with no card lifted.
   */
  presenter?: SpeakerId;
  /** Show who researched each stakeholder. Default true. */
  owners?: boolean;
  /**
   * When true the owners arrive on step 1 instead of at once
   * (the slide then has 2 steps).
   */
  revealOwners?: boolean;
  step: number;
}

/**
 * Card geometry on the canvas. Four of these fill the 1664px content box.
 * Each card is the tray of a double bezel: an 8px rim around the photo plate,
 * so the plate's radius is the card's minus the rim.
 */
const CARD = {
  height: 532,
  gap: 48,
  rim: 8,
  radius: 30,
  photo: 196,
  lift: 22,
} as const;
/** Type sizes on the card; the opener grows each of them. */
export const MAP_SIZES = {
  icon: 20,
  title: 46,
  subtitle: 22,
  owner: 24,
} as const;

/**
 * The four stakeholders as four cards: photo, icon, title, subtitle and who
 * studied them. This slide recurs before every stakeholder section, lifting
 * the next one, and its cards morph into that section's opener.
 *
 * Flip ids, per stakeholder `s` (shared with SectionOpener):
 * `stake-${s}-card` (the card's box), `stake-${s}-photo` (the photo plate),
 * `stake-${s}-icon`, `stake-${s}-title`, `stake-${s}-subtitle`,
 * `stake-${s}-owner` (the researcher's chip).
 *
 * Every visible piece of a card travels, so nothing on the lifted card
 * vanishes when it grows into the opener: the card becomes the opener's
 * sheet and its photo becomes the opener's photo panel.
 *
 * A struck card (out of scope) keeps its place in the row, pressed flat and
 * greyed, its name crossed out and "Out of scope" in place of the researcher.
 */
export function StakeholderMap({
  eyebrow,
  title,
  highlight,
  struck = [],
  caption,
  presenter,
  owners = true,
  revealOwners = false,
  step,
}: StakeholderMapProps) {
  const root = useRef<HTMLDivElement>(null);
  const reveal = owners && revealOwners;
  // A struck card has no researcher's chip to step onto it.
  const researched = STAKEHOLDER_ORDER.filter((id) => !struck.includes(id));
  useLockedSlots(root);

  useSteps(
    root,
    step,
    (tl, mark) => {
      if (!reveal) return;
      // Each researcher steps onto their card: the face first, the name
      // sliding out from behind it, one card after the next.
      researched.forEach((id, i) => {
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

  const captionPerson =
    presenter ?? (highlight ? STAKEHOLDERS[highlight].owner : undefined);

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
                struck.includes(id)
                  ? "struck"
                  : highlight === undefined
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
            {captionPerson && <Avatar person={captionPerson} size={56} />}
            <p className="t-lede text-fg">{caption}</p>
          </div>
        )}
      </div>
    </SlideBody>
  );
}

/**
 * A struck card is pressed flat into the ground, like a question struck off
 * QuestionsBoard: the sunken fill, and its hairline with the drops at zero.
 */
const STRUCK_CARD = {
  backgroundColor: "#e9ebf0",
  boxShadow:
    "inset 0 0 0 1px rgba(16, 24, 40, 0.03), 0 1px 1px rgba(16, 24, 40, 0), 0 2px 8px -2px rgba(16, 24, 40, 0)",
};

function Card({
  stakeholder: id,
  state,
  owners,
}: {
  stakeholder: StakeholderId;
  state: "even" | "lit" | "dim" | "struck";
  owners: boolean;
}) {
  const s = STAKEHOLDERS[id];
  const lit = state === "lit";
  const struck = state === "struck";
  return (
    // The cell keeps the grid still while the card inside it is resized by a
    // morph (coming back from an opener, it starts stage-sized).
    <div className="relative" style={{ height: CARD.height }}>
      <div
        data-flip-id={`stake-${id}-card`}
        className="bg-card absolute inset-x-0 flex flex-col"
        style={{
          top: lit ? -CARD.lift : 0,
          height: CARD.height,
          padding: CARD.rim,
          borderRadius: CARD.radius,
          boxShadow: cardShadow(id, lit ? "lit" : "plain"),
          ...(struck ? STRUCK_CARD : null),
        }}
      >
        <Slot>
          <StakePhoto
            stakeholder={id}
            flipId={`stake-${id}-photo`}
            quiet={state === "dim" || struck}
            radius={CARD.radius - CARD.rim}
            style={{ width: "100%", height: CARD.photo }}
          />
        </Slot>
        <div className="flex min-h-0 flex-1 flex-col px-[22px] pt-6 pb-[18px]">
          <Slot style={struck ? { opacity: 0.5 } : undefined}>
            <IconTile
              stakeholder={id}
              size={MAP_SIZES.icon}
              flipId={`stake-${id}-icon`}
            />
          </Slot>
          <Slot className="mt-auto">
            <h2
              data-flip-id={`stake-${id}-title`}
              className="font-display font-semibold"
              style={{
                fontSize: MAP_SIZES.title,
                lineHeight: 1,
                letterSpacing: "-0.03em",
                color: struck ? INK.faint : INK.fg,
                // Crossed out, every line of it, in the name's own grey: the
                // accent stroke belongs to the slide where it was struck off.
                textDecoration: struck ? "line-through" : undefined,
                textDecorationThickness: struck ? "0.06em" : undefined,
              }}
            >
              <TitleLines text={s.title} />
            </h2>
          </Slot>
          {/* Two lines tall on every card, so the four titles share a baseline. */}
          <Slot
            className="mt-2.5"
            style={{ minHeight: MAP_SIZES.subtitle * 1.36 * 2 }}
          >
            <p
              data-flip-id={`stake-${id}-subtitle`}
              style={{
                fontSize: MAP_SIZES.subtitle,
                lineHeight: 1.36,
                maxWidth: SUBTITLE_MEASURE,
                color: INK.muted,
              }}
            >
              {s.subtitle}
            </p>
          </Slot>
          {owners && !struck && (
            <Slot className="mt-5">
              <OwnerChip
                stakeholder={id}
                size={MAP_SIZES.owner}
                flipId={`stake-${id}-owner`}
                data-owner={id}
                aria-label={`Researched by ${TEAM[s.owner].name}`}
              />
            </Slot>
          )}
          {owners && struck && (
            <Slot className="mt-5">
              {/* As tall as the researcher's chip it stands in for, so the
                  titles keep their shared baseline. */}
              <Chip
                size={22}
                style={{
                  height: MAP_SIZES.owner * 1.6,
                  paddingTop: 0,
                  paddingBottom: 0,
                  // The flat card is the chip's own grey: a hairline keeps
                  // it a chip rather than loose words.
                  backgroundColor: "transparent",
                  boxShadow: "inset 0 0 0 1px rgba(16, 24, 40, 0.12)",
                }}
              >
                Out of scope
              </Chip>
            </Slot>
          )}
        </div>
      </div>
    </div>
  );
}
