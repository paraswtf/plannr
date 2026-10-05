import type { CSSProperties, ReactNode } from "react";

import { Icon, type IconName } from "./icon";

/**
 * Pieces of the Plannr app, for drawing it on slides.
 *
 * These copy the real app's look (src/components/app/schedule/day-calendar.tsx
 * and friends) rather than importing it: the deck has no data layer, and a
 * mock-up wants fixed, legible sample data. Sizes are in phone pixels, for use
 * inside <PhoneFrame>; they work in a <BrowserFrame> too.
 */

/** The app's course palette (src/lib/course-colour.ts): fill and ring. */
export const COURSE_TONES = [
  { fill: "#8da524", ring: "#333d02" }, // moss
  { fill: "#40f8d4", ring: "#13816c" }, // mint
  { fill: "#63effc", ring: "#137d86" }, // ice
  { fill: "#29abb7", ring: "#034045" }, // teal
  { fill: "#7dc7fa", ring: "#0b5e8a" }, // sky
  { fill: "#8e9cf8", ring: "#3026a4" }, // periwinkle
  { fill: "#d77ce0", ring: "#6b0774" }, // orchid
  { fill: "#fbafdb", ring: "#a6207d" }, // blossom
] as const;

export type CourseTone = (typeof COURSE_TONES)[number];

/** The app's own hash, so a course is the same colour on every slide. */
export function courseTone(title: string): CourseTone {
  const key = title.trim().toLowerCase().replace(/\s+/g, " ");
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return COURSE_TONES[hash % COURSE_TONES.length]!;
}

/** Fill for "one of yours" and "happening now", as on the app's grids. */
export const MINE = { fill: "#ffc667", ring: "#d99425" } as const;
export const LIVE = { fill: "#ffa7a4", ring: "#dc3848" } as const;

/**
 * A class on the schedule: the course's colour, its title, then time and
 * room in mono. Position it yourself (it is a block, full width of its box).
 */
export function MockClass({
  title,
  time,
  room,
  detail,
  tone,
  live,
  past,
  className,
  style,
}: {
  title: ReactNode;
  time?: string;
  room?: string;
  /** Extra line, e.g. the teacher. */
  detail?: ReactNode;
  /** Defaults to the course's colour, from its title. */
  tone?: { fill: string; ring: string };
  live?: boolean;
  past?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const t =
    tone ?? (live ? LIVE : courseTone(typeof title === "string" ? title : ""));
  return (
    <div
      className={`overflow-hidden rounded-xl px-3 py-2 text-left ${className ?? ""}`}
      style={{
        background: t.fill,
        boxShadow: `inset 0 0 0 1px ${t.ring}`,
        opacity: past && !live ? 0.62 : 1,
        color: "#0d1117",
        ...style,
      }}
    >
      <span className="block truncate text-[13px] leading-tight font-semibold">
        {title}
      </span>
      {(time ?? room) && (
        <span className="mt-0.5 block truncate font-mono text-[11px] text-[rgba(44,49,53,0.7)]">
          {[time, room].filter(Boolean).join(" · ")}
        </span>
      )}
      {detail && (
        <span className="mt-0.5 block truncate text-[11px] text-[rgba(44,49,53,0.55)]">
          {detail}
        </span>
      )}
    </div>
  );
}

/** The app's top bar on a phone: page title, a date line, and your face. */
export function MockAppBar({
  title,
  subtitle,
  initials = "S",
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  initials?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-end justify-between px-5 pt-[62px] pb-3 ${className ?? ""}`}
    >
      <div>
        {subtitle && (
          <div className="font-mono text-[11.5px] tracking-[0.04em] text-[rgba(44,49,53,0.55)] uppercase">
            {subtitle}
          </div>
        )}
        <div className="font-display text-[28px] leading-tight font-bold tracking-[-0.02em] text-[#0d1117]">
          {title}
        </div>
      </div>
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-bold text-white"
        style={{ background: "var(--slate)" }}
      >
        {initials}
      </span>
    </div>
  );
}

const TABS: { icon: IconName; label: string }[] = [
  { icon: "calendar", label: "Schedule" },
  { icon: "grid", label: "Timetable" },
  { icon: "door", label: "Rooms" },
  { icon: "settings", label: "Settings" },
];

/** The phone's bottom tab bar, with one tab lit. */
export function MockTabBar({ active = 0 }: { active?: number }) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex justify-around px-4 pt-2 pb-7"
      style={{
        background: "rgba(255,255,255,0.92)",
        boxShadow: "inset 0 1px 0 rgba(68,88,121,0.14)",
      }}
    >
      {TABS.map((tab, i) => (
        <span
          key={tab.label}
          className="flex flex-col items-center gap-1 text-[10.5px] font-semibold"
          style={{
            color: i === active ? "var(--slate)" : "rgba(44,49,53,0.42)",
          }}
        >
          <Icon name={tab.icon} size={22} stroke={i === active ? 2 : 1.75} />
          {tab.label}
        </span>
      ))}
    </div>
  );
}

/**
 * An iOS notification banner from Plannr. Place it near the top of a phone
 * screen (top ≈ 56px) or on a lock screen.
 */
export function MockNotification({
  title,
  body,
  time = "now",
  app = "Plannr",
  className,
  style,
}: {
  title: ReactNode;
  body: ReactNode;
  time?: string;
  app?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`flex gap-3 rounded-[22px] p-3.5 text-[#0d1117] ${className ?? ""}`}
      style={{
        background: "rgba(245,246,248,0.86)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
        ...style,
      }}
    >
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] bg-[#0d1117]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="h-[24px] w-auto" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-semibold">{title}</span>
          <span className="shrink-0 text-[13px] text-[rgba(44,49,53,0.5)]">
            {time}
          </span>
        </span>
        <span className="mt-0.5 block text-[14.5px] leading-snug text-[rgba(44,49,53,0.86)]">
          {body}
        </span>
        <span className="sr-only">{app}</span>
      </span>
    </div>
  );
}

/** A white card on the app's paper background, with the hairline ring. */
export function MockCard({
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
      className={`rounded-[14px] bg-white ${className ?? ""}`}
      style={{
        boxShadow:
          "inset 0 0 0 1px rgba(68,88,121,0.28), 0 2px 10px rgba(13,17,23,0.05)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
