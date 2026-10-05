"use client";

import {
  useLayoutEffect,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";

import { speakerColor, STAKEHOLDERS, TEAM } from "~/content/team";
import type { SpeakerId, StakeholderId } from "~/deck/types";
import { Icon } from "~/ui/icon";

/*
 * The pieces a stakeholder card and its section opener share, so that each
 * one is the same element at two sizes and the Magic Move between them is a
 * smooth grow rather than a swap.
 *
 * Everything inside a travelling piece is sized in `em`. The morph
 * interpolates the travelling box's font-size, so an icon, an avatar or a
 * line break measured in em scales continuously with it, where a pixel size
 * would jump to its new value on the first frame.
 *
 * The travelling box's own inline styles, on the other hand, must be plain
 * px and rgb(): GSAP tweens from the inline value, and it cannot read an
 * `em` width or a `var(--…)` colour (the icon came out 32px and black).
 *
 * And each travelling piece sits in a <Slot>: a box locked to the piece's
 * landed size. The morph resizes the piece in flight, and without the slot
 * that resize would push its neighbours around mid-air (the subtitle rode up
 * over the growing title).
 */

/**
 * The stakeholder colours as RGB, mirroring the --students, --faculty, … tokens
 * in globals.css. Shadows and tints are written as rgba() rather than
 * color-mix() because the morph can interpolate the one and not the other.
 */
export const STAKE_RGB: Record<StakeholderId, string> = {
  students: "255, 93, 115",
  faculty: "246, 167, 59",
  coordinators: "193, 116, 214",
  admins: "134, 163, 214",
};

export const rgba = (id: StakeholderId, alpha: number) =>
  `rgba(${STAKE_RGB[id]}, ${alpha})`;
export const rgb = (id: StakeholderId) => `rgb(${STAKE_RGB[id]})`;

/**
 * A box that keeps the size of what it holds, so a travelling element can be
 * resized by the morph without moving anything around it. Its content is
 * pinned to the top-left; place the slot itself where the content belongs.
 */
export function Slot({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      data-lock
      className={`flex shrink-0 items-start justify-start [&>*]:shrink-0 ${className ?? ""}`}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * Locks every <Slot> under `root` to its laid-out size. Runs as a layout
 * effect, so it is in place before the deck starts the morph (which happens
 * in the deck's own layout effect, after its children's).
 */
export function useLockedSlots(root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const slots = Array.from(el.querySelectorAll<HTMLElement>("[data-lock]"));
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
    // If the fonts were still loading, measure again once they are in. (Never
    // otherwise: a re-measure during a morph would read the in-flight size.)
    let live = true;
    if (
      typeof document !== "undefined" &&
      document.fonts &&
      document.fonts.status !== "loaded"
    ) {
      void document.fonts.ready.then(() => {
        if (live) lock();
      });
    }
    return () => {
      live = false;
    };
  }, [root]);
}

/** The coloured wash on a card and on the opener panel: identical in both. */
export function tintBackground(id: StakeholderId, strength = 1) {
  return `linear-gradient(158deg, ${rgba(id, 0.22 * strength)} 0%, ${rgba(id, 0.08 * strength)} 46%, ${rgba(id, 0.02 * strength)} 100%)`;
}

/**
 * A card's edge and glow. Every state has the same two shadows so the morph
 * can tween between them number by number.
 */
export function cardShadow(
  id: StakeholderId,
  state: "plain" | "lit" | "panel",
) {
  switch (state) {
    case "lit":
      return `inset 0 0 0 2px ${rgba(id, 0.9)}, 0 36px 110px -18px ${rgba(id, 0.5)}`;
    case "panel":
      return `inset 0 0 0 2px ${rgba(id, 0.42)}, 0 36px 110px -18px ${rgba(id, 0.16)}`;
    default:
      return `inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 36px 110px -18px ${rgba(id, 0)}`;
  }
}

/** The stakeholder's icon on a tinted tile. Size it with the `size` (font-size) prop. */
export function IconTile({
  stakeholder,
  size,
  flipId,
  className,
}: {
  stakeholder: StakeholderId;
  /** The icon's size in px; the tile is 2em square around it. */
  size: number;
  flipId?: string;
  className?: string;
}) {
  const s = STAKEHOLDERS[stakeholder];
  return (
    <span
      data-flip-id={flipId}
      className={`inline-flex shrink-0 items-center justify-center self-start ${className ?? ""}`}
      style={{
        fontSize: size,
        width: size * 2,
        height: size * 2,
        borderRadius: Math.round(size * 0.56),
        color: rgb(stakeholder),
        backgroundColor: rgba(stakeholder, 0.14),
        boxShadow: `inset 0 0 0 1px ${rgba(stakeholder, 0.34)}`,
      }}
    >
      <Icon
        name={s.icon}
        stroke={1.6}
        style={{ width: "1.05em", height: "1.05em" }}
      />
    </span>
  );
}

/** An Avatar measured in em, so it scales with the chip it sits in. */
export function EmAvatar({
  person,
  size = 1.6,
}: {
  person: SpeakerId;
  size?: number;
}) {
  const p = TEAM[person];
  const color = speakerColor(person);
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        width: `${size}em`,
        height: `${size}em`,
        background: `color-mix(in srgb, ${color} 22%, var(--bg-raised))`,
        boxShadow: `inset 0 0 0 ${size * 0.04}em color-mix(in srgb, ${color} 70%, transparent)`,
        color,
      }}
    >
      {p.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.photo}
          alt={p.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="font-display font-bold"
          style={{ fontSize: `${size * 0.44}em`, letterSpacing: "-0.02em" }}
        >
          {p.name[0]}
        </span>
      )}
    </span>
  );
}

/** The researcher: avatar and first name. `size` is the name's font size. */
export function OwnerChip({
  stakeholder,
  size,
  flipId,
  className,
  style,
  ...rest
}: {
  stakeholder: StakeholderId;
  size: number;
  flipId?: string;
  className?: string;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLSpanElement>, "children">) {
  const owner = STAKEHOLDERS[stakeholder].owner;
  return (
    <span
      {...rest}
      data-flip-id={flipId}
      className={`inline-flex items-center self-start ${className ?? ""}`}
      style={{ fontSize: size, gap: "0.46em", ...style }}
    >
      <EmAvatar person={owner} />
      <span className="owner-name font-display leading-none font-semibold tracking-[-0.015em] whitespace-nowrap">
        {TEAM[owner].name}
      </span>
    </span>
  );
}

/**
 * A stakeholder's title broken one word per line, the same at every size:
 * "System admins" is two lines on its card and two lines as the opener's
 * hero, so the text never re-wraps while it grows.
 */
export function TitleLines({ text }: { text: string }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => (
        <span key={i} className="block whitespace-nowrap">
          {word}
        </span>
      ))}
    </>
  );
}

/**
 * The subtitle's measure, in em. The card and the opener set the same
 * em width, so the line breaks fall in the same places at both sizes.
 */
export const SUBTITLE_MEASURE = "13.4em";
