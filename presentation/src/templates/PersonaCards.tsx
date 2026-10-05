"use client";

import { useRef, type ReactNode } from "react";

import { STAKEHOLDERS } from "~/content/team";
import type { Persona } from "~/content/types";
import type { StakeholderId } from "~/deck/types";
import { Icon } from "~/ui/icon";
import { SlideBody, SlideHeader } from "~/ui/layout";

import { useArrival } from "./_research-motion";

export interface PersonaCardsProps {
  stakeholder: StakeholderId;
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Two to four. */
  personas: Persona[];
  /** No builds by default: steps = 1. */
  step: number;
  /** False while the slide is leaving or previewed: the cards wait for it. */
  active?: boolean;
}

/**
 * The kinds of user we found, side by side.
 *
 * Each persona's name carries flip id `${stakeholder}-persona-${id}`, the
 * same as its lane on DayTimeline, so the two slides morph either way.
 *
 * Two or three personas stand as tall cards in a row; four sit two by two as
 * wide cards, so every card keeps room for its tagline and habits. On arrival
 * the cards settle in one after another while the names travel in from the
 * timeline (or simply fade, when the slide before has no partner for them).
 */
export function PersonaCards({
  stakeholder,
  eyebrow,
  title,
  personas,
  step,
  active = true,
}: PersonaCardsProps) {
  const color = STAKEHOLDERS[stakeholder].color;
  const ref = useRef<HTMLDivElement>(null);
  const wide = personas.length >= 4;

  useArrival(ref, { active, step }, (tl) => {
    const cards = cardsIn(ref.current);
    cards.forEach((card, i) => {
      const at = 0.18 + i * 0.09;
      tl.from(
        card.querySelector(".pc-bg"),
        { opacity: 0, scale: 0.94, duration: 0.8, ease: "deck.enter" },
        at,
      );
      tl.from(
        card.querySelector(".pc-icon"),
        { scale: 0, rotate: -30, duration: 0.7, ease: "back.out(2)" },
        at + 0.25,
      );
      tl.from(
        card.querySelectorAll(".pc-in"),
        { opacity: 0, y: 22, duration: 0.7, ease: "power3.out", stagger: 0.07 },
        at + 0.35,
      );
    });
  });

  return (
    <SlideBody>
      <SlideHeader
        eyebrow={eyebrow}
        eyebrowColor={color}
        title={title}
        titleClassName="max-w-none!"
      />
      <div
        ref={ref}
        className="mt-12 grid min-h-0 flex-1 gap-7"
        style={{
          gridTemplateColumns: `repeat(${wide ? 2 : personas.length}, minmax(0, 1fr))`,
          gridAutoRows: "minmax(0, 1fr)",
        }}
      >
        {personas.map((p) =>
          wide ? (
            <WideCard
              key={p.id}
              persona={p}
              stakeholder={stakeholder}
              color={color}
            />
          ) : (
            <TallCard
              key={p.id}
              persona={p}
              stakeholder={stakeholder}
              color={color}
            />
          ),
        )}
      </div>
    </SlideBody>
  );
}

function cardsIn(root: HTMLElement | null) {
  return Array.from(
    root?.querySelectorAll<HTMLElement>("[data-persona]") ?? [],
  );
}

interface CardProps {
  persona: Persona;
  stakeholder: StakeholderId;
  color: string;
}

/** The card's surface, drawn on its own layer so it can settle in. */
function CardSurface({ color }: { color: string }) {
  return (
    <div
      className="pc-bg absolute inset-0 rounded-[28px]"
      style={{
        background: `radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, ${color} 9%, transparent) 0%, transparent 55%), var(--bg-card)`,
        boxShadow: "inset 0 0 0 1px var(--line)",
      }}
    />
  );
}

function IconDisc({
  persona,
  color,
  size,
}: {
  persona: Persona;
  color: string;
  size: number;
}) {
  return (
    <span
      className="pc-icon flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${color} 42%, transparent)`,
      }}
    >
      <Icon name={persona.icon} size={size * 0.48} stroke={1.9} />
    </span>
  );
}

function Name({
  persona,
  stakeholder,
  size,
  className,
}: {
  persona: Persona;
  stakeholder: StakeholderId;
  size: number;
  className?: string;
}) {
  return (
    <h2
      data-flip-id={`${stakeholder}-persona-${persona.id}`}
      className={`font-display inline-block leading-[1.08] font-bold tracking-tight whitespace-nowrap ${className ?? ""}`}
      style={{ fontSize: size }}
    >
      {persona.name}
    </h2>
  );
}

function Traits({
  persona,
  color,
  size,
}: {
  persona: Persona;
  color: string;
  size: number;
}) {
  return (
    <ul className="flex flex-col" style={{ gap: size * 0.42 }}>
      {persona.traits.map((t, i) => (
        <li
          key={i}
          className="pc-in flex items-start gap-4"
          style={{ fontSize: size, lineHeight: 1.36 }}
        >
          <span
            className="shrink-0 rounded-full"
            style={{
              width: 8,
              height: 8,
              marginTop: size * 0.5,
              background: color,
            }}
          />
          <span className="text-fg/85">{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Share({ persona, color }: { persona: Persona; color: string }) {
  if (!persona.share) return null;
  return (
    <span
      className="pc-in t-mono inline-flex shrink-0 items-center gap-2.5 rounded-full px-4 py-2 text-[22px] leading-none"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      <Icon name="users" size={22} stroke={2} />
      {persona.share}
    </span>
  );
}

/** Four personas: a wide card, name and share across the top. */
function WideCard({ persona, stakeholder, color }: CardProps) {
  return (
    <div data-persona={persona.id} className="relative min-h-0">
      <CardSurface color={color} />
      <div className="relative flex h-full flex-col px-10 pt-9 pb-8">
        <div className="flex items-center gap-6">
          <IconDisc persona={persona} color={color} size={76} />
          <Name
            persona={persona}
            stakeholder={stakeholder}
            size={38}
            className="self-center"
          />
          <span className="ml-auto">
            <Share persona={persona} color={color} />
          </span>
        </div>
        <p className="pc-in text-muted mt-5 text-[27px] leading-[1.32] text-pretty">
          {persona.tagline}
        </p>
        <div className="mt-auto pt-5">
          <Traits persona={persona} color={color} size={23} />
        </div>
      </div>
    </div>
  );
}

/** Two or three personas: a tall card, read top to bottom. */
function TallCard({ persona, stakeholder, color }: CardProps) {
  return (
    <div data-persona={persona.id} className="relative min-h-0">
      <CardSurface color={color} />
      <div className="relative flex h-full flex-col p-12">
        <div className="flex items-start justify-between gap-6">
          <IconDisc persona={persona} color={color} size={112} />
          <Share persona={persona} color={color} />
        </div>
        <div className="mt-10 flex">
          <Name persona={persona} stakeholder={stakeholder} size={56} />
        </div>
        <p className="pc-in text-muted mt-4 text-[34px] leading-[1.32] text-pretty">
          {persona.tagline}
        </p>
        <div className="pc-in bg-line mt-auto mb-9 h-px" />
        <Traits persona={persona} color={color} size={29} />
      </div>
    </div>
  );
}
