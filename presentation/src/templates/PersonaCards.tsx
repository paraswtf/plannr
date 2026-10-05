"use client";

import { useRef, type ReactNode } from "react";

import type { Persona } from "~/content/types";
import type { StakeholderId } from "~/deck/types";
import { Icon } from "~/ui/icon";
import { SlideBody, SlideHeader } from "~/ui/layout";
import { Chip } from "~/ui/surfaces";

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
 * No cards: the personas are set like a page, grouped by space and
 * hairlines. Two or three stand as columns, read top to bottom. Four are a
 * list, one persona to a row with its name in the left column, so names
 * coming from (or going to) the timeline's lanes keep their order and travel
 * straight across. On arrival each persona's rule draws in, its icon settles
 * and its words rise, one persona after another, while the names travel in
 * from the timeline (or simply fade, when the slide before has no partner).
 */
export function PersonaCards({
  stakeholder,
  title,
  personas,
  step,
  active = true,
}: PersonaCardsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const list = personas.length >= 4;

  useArrival(ref, { active, step }, (tl) => {
    const items = itemsIn(ref.current);
    items.forEach((item, i) => {
      const at = 0.18 + i * 0.1;
      tl.from(
        item.querySelector(".pc-rule"),
        {
          scaleX: 0,
          duration: 1,
          ease: "deck.enter",
          transformOrigin: "0% 50%",
        },
        at,
      );
      tl.from(
        item.querySelector(".pc-icon"),
        {
          scale: 0.5,
          rotate: -12,
          opacity: 0,
          duration: 0.7,
          ease: "back.out(1.8)",
        },
        at + 0.2,
      );
      tl.from(
        item.querySelectorAll(".pc-in"),
        {
          opacity: 0,
          y: 24,
          duration: 0.75,
          ease: "deck.enter",
          stagger: 0.07,
        },
        at + 0.3,
      );
    });
  });

  return (
    <SlideBody>
      <SlideHeader title={title} titleClassName="max-w-none!" />
      {list ? (
        <div
          ref={ref}
          className="mt-12 grid min-h-0 flex-1"
          style={{ gridAutoRows: "minmax(0, 1fr)" }}
        >
          {personas.map((p) => (
            <Row key={p.id} persona={p} stakeholder={stakeholder} />
          ))}
        </div>
      ) : (
        <div
          ref={ref}
          className="mt-14 grid min-h-0 flex-1 gap-20"
          style={{
            gridTemplateColumns: `repeat(${personas.length}, minmax(0, 1fr))`,
          }}
        >
          {personas.map((p) => (
            <Column key={p.id} persona={p} stakeholder={stakeholder} />
          ))}
        </div>
      )}
    </SlideBody>
  );
}

function itemsIn(root: HTMLElement | null) {
  return Array.from(
    root?.querySelectorAll<HTMLElement>("[data-persona]") ?? [],
  );
}

interface ItemProps {
  persona: Persona;
  stakeholder: StakeholderId;
}

/** The hairline over a persona, drawn on its own so it can draw in. */
function Rule() {
  return (
    <span className="pc-rule bg-line-strong absolute inset-x-0 top-0 h-px" />
  );
}

function IconTile({ persona, size }: { persona: Persona; size: number }) {
  return (
    <span
      className="pc-icon bg-sunken text-fg flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, borderRadius: size > 72 ? 22 : 12 }}
    >
      <Icon name={persona.icon} size={size * 0.5} />
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
      className={`font-display text-fg inline-block leading-[1.08] font-semibold tracking-[-0.025em] whitespace-nowrap ${className ?? ""}`}
      style={{ fontSize: size }}
    >
      {persona.name}
    </h2>
  );
}

function Share({ persona, size }: { persona: Persona; size: number }) {
  if (!persona.share) return null;
  return (
    <Chip icon="users" size={size} className="pc-in tabular self-start">
      {persona.share}
    </Chip>
  );
}

/** Four personas: a row each, name on the left, then who they are and how. */
function Row({ persona, stakeholder }: ItemProps) {
  return (
    <div
      data-persona={persona.id}
      className="relative grid min-h-0 items-start gap-14 pt-7"
      style={{ gridTemplateColumns: "500px minmax(0, 1fr) 600px" }}
    >
      <Rule />
      <div className="flex items-start gap-6">
        <IconTile persona={persona} size={64} />
        <div className="flex min-w-0 flex-col gap-3">
          <Name persona={persona} stakeholder={stakeholder} size={38} />
          <Share persona={persona} size={20} />
        </div>
      </div>
      <p className="pc-in t-body text-body text-pretty">{persona.tagline}</p>
      <ul className="flex flex-col gap-1.5 pt-1">
        {persona.traits.map((t, i) => (
          <li key={i} className="pc-in text-muted text-[23px] leading-[1.36]">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Two or three personas: a column each, read top to bottom. */
function Column({ persona, stakeholder }: ItemProps) {
  return (
    <div
      data-persona={persona.id}
      className="relative flex min-h-0 flex-col pt-10"
    >
      <Rule />
      <IconTile persona={persona} size={88} />
      <div className="mt-9 flex">
        <Name persona={persona} stakeholder={stakeholder} size={56} />
      </div>
      <p className="pc-in t-lede text-muted mt-4 max-w-[30ch] text-pretty">
        {persona.tagline}
      </p>
      <div className="mt-7 flex">
        <Share persona={persona} size={22} />
      </div>
      <ul className="mt-12 flex flex-col">
        {persona.traits.map((t, i) => (
          <li
            key={i}
            className="pc-in border-line text-body border-t py-4 text-[28px] leading-[1.36]"
          >
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
