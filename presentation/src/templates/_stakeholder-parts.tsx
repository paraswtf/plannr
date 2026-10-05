"use client";

import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";

import { STAKEHOLDERS, TEAM } from "~/content/team";
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
 * px and hex/rgb: GSAP tweens from the inline value, and it cannot read an
 * `em` width or a `var(--…)` colour (the icon came out 32px and black). The
 * constants below mirror the tokens in globals.css for exactly that reason.
 *
 * And each travelling piece sits in a <Slot>: a box locked to the piece's
 * landed size. The morph resizes the piece in flight, and without the slot
 * that resize would push its neighbours around mid-air (the subtitle rode up
 * over the growing title).
 */

/** The stage's tokens as plain values, for inline styles on travellers. */
export const INK = {
  fg: "#10141b",
  body: "#353d4a",
  muted: "#5f6878",
  faint: "#8f97a6",
  raised: "#fbfbfd",
  accent: "#c8305f",
} as const;

/**
 * The card's edge and elevation, as three shadow layers in every state (a
 * hairline ring, then two soft drops) so the morph can tween between them
 * number by number. Mirrors --line / --accent-line and --shadow-1/2/3.
 */
const SHADOW = {
  /** Resting: a hairline and --shadow-1. */
  plain:
    "inset 0 0 0 1px rgba(16, 24, 40, 0.08), 0 1px 1px rgba(16, 24, 40, 0.04), 0 2px 8px -2px rgba(16, 24, 40, 0.06)",
  /** The card being handed over to: an accent hairline, lifted on --shadow-3. */
  lit: "inset 0 0 0 1.5px rgba(200, 48, 95, 0.5), 0 6px 16px -8px rgba(16, 24, 40, 0.16), 0 44px 96px -32px rgba(16, 24, 40, 0.34)",
  /** The opener's sheet: a hairline on --shadow-2. */
  panel:
    "inset 0 0 0 1px rgba(16, 24, 40, 0.08), 0 2px 4px rgba(16, 24, 40, 0.04), 0 18px 48px -18px rgba(16, 24, 40, 0.2)",
} as const;

export function cardShadow(
  _stakeholder: StakeholderId,
  state: "plain" | "lit" | "panel",
) {
  return SHADOW[state];
}

/**
 * Kept for old imports. The stakeholders no longer have colours of their own
 * (DESIGN.md): every one of them resolves to the single accent.
 */
export const STAKE_RGB: Record<StakeholderId, string> = {
  students: "200, 48, 95",
  faculty: "200, 48, 95",
  coordinators: "200, 48, 95",
  admins: "200, 48, 95",
};
export const rgba = (id: StakeholderId, alpha: number) =>
  `rgba(${STAKE_RGB[id]}, ${alpha})`;
export const rgb = (id: StakeholderId) => `rgb(${STAKE_RGB[id]})`;

/** Kept for old imports: the coloured wash is gone, so this paints nothing. */
export function tintBackground(_id: StakeholderId, _strength = 1) {
  return "none";
}

/**
 * Each stakeholder's photo, the same file and crop on the map card and on the
 * section opener, so the picture itself can travel between them. (The
 * opener's `photo` prop, set in the section file, carries the credit.)
 */
export const STAKE_PHOTO: Record<
  StakeholderId,
  { src: string; alt: string; position: string }
> = {
  students: {
    src: "/images/stakeholders/students.jpg",
    alt: "Students checking their phones in a lecture hall",
    position: "50% 40%",
  },
  faculty: {
    src: "/images/stakeholders/faculty.jpg",
    alt: "A lecturer teaching a class",
    position: "50% 30%",
  },
  coordinators: {
    src: "/images/stakeholders/coordinators.jpg",
    alt: "A coordinator's desk: notes, keyboard and tablet",
    position: "50% 55%",
  },
  admins: {
    src: "/images/stakeholders/admins.jpg",
    alt: "Server racks",
    position: "40% 50%",
  },
};

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
      className={`flex shrink-0 items-start justify-start *:shrink-0 ${className ?? ""}`}
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

/**
 * The stakeholder's photo as a bezel plate: the inner half of a double bezel
 * whose tray is the card (on the map) or the sheet (on the opener), so its
 * radius is the tray's minus the 8px rim and the curves stay concentric.
 *
 * It is one travelling element on both slides. The picture inside is laid out
 * with object-fit, so as the morph reshapes the plate from the card's wide
 * strip to the opener's tall panel the crop changes continuously.
 */
export function StakePhoto({
  stakeholder,
  src,
  alt,
  position,
  credit,
  quiet = false,
  radius = 22,
  flipId,
  className,
  style,
  ...rest
}: {
  stakeholder: StakeholderId;
  src?: string;
  alt?: string;
  position?: string;
  /** Plain small type at the photo's foot (the licence asks for it). */
  credit?: string;
  /** Greyed back, for the cards that are not being talked about. */
  quiet?: boolean;
  radius?: number;
  flipId?: string;
  className?: string;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "style">) {
  const fallback = STAKE_PHOTO[stakeholder];
  const file = src ?? fallback.src;
  const [failed, setFailed] = useState<string | null>(null);
  const shown = failed !== file;
  return (
    <div
      {...rest}
      data-flip-id={flipId}
      className={`relative overflow-hidden ${className ?? ""}`}
      style={{ borderRadius: radius, backgroundColor: "#e7e9ee", ...style }}
    >
      {shown ? (
        // A plain <img>: the deck is a static export with images served as-is.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={file}
          alt={alt ?? fallback.alt}
          onError={() => setFailed(file)}
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            objectPosition: position ?? fallback.position,
            filter: quiet ? "grayscale(1) contrast(0.94)" : undefined,
            opacity: quiet ? 0.84 : 1,
          }}
        />
      ) : (
        <div className="text-faint absolute inset-0 flex items-center justify-center">
          <Icon
            name={STAKEHOLDERS[stakeholder].icon}
            weight="light"
            style={{ width: "30%", height: "30%" }}
          />
        </div>
      )}
      {/* The plate's own edge: a hairline and a lit top lip, over the photo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          boxShadow:
            "inset 0 0 0 1px rgba(16, 24, 40, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.35)",
        }}
      />
      {shown && credit && (
        <span
          data-photo-credit
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end px-5 pt-12 pb-4 text-[15px] text-white/90"
          style={{
            background:
              "linear-gradient(to top, rgba(16,20,27,0.4), rgba(16,20,27,0))",
          }}
        >
          {credit}
        </span>
      )}
    </div>
  );
}

/** The stakeholder's icon on a quiet tile. Size it with the `size` (font-size) prop. */
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
        borderRadius: Math.round(size * 0.6),
        color: INK.fg,
        backgroundColor: "#eceef2",
        boxShadow: "inset 0 0 0 1px rgba(16, 24, 40, 0.06)",
      }}
    >
      <Icon
        name={s.icon}
        weight="light"
        style={{ width: "1.1em", height: "1.1em" }}
      />
    </span>
  );
}

/**
 * An Avatar measured in em, so it scales with the chip it sits in: the same
 * rounded square as the deck's Avatar.
 */
export function EmAvatar({
  person,
  size = 1.6,
}: {
  person: SpeakerId;
  size?: number;
}) {
  const p = TEAM[person];
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden"
      style={{
        width: `${size}em`,
        height: `${size}em`,
        borderRadius: "30%",
        background: "#e3e6ec",
        boxShadow: "inset 0 0 0 1px rgba(16, 24, 40, 0.08)",
        color: INK.fg,
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
          className="font-display font-semibold"
          style={{ fontSize: `${size * 0.42}em`, letterSpacing: "-0.02em" }}
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
      style={{ fontSize: size, gap: "0.46em", color: INK.fg, ...style }}
    >
      <EmAvatar person={owner} />
      <span className="owner-name font-display leading-none font-medium tracking-[-0.015em] whitespace-nowrap">
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
