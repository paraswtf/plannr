"use client";

import type { CSSProperties, ReactNode } from "react";

import { courseTone, LIVE } from "~/ui/mock";

/**
 * Shared pieces for the three student phone demos (PhoneMyDay,
 * PhoneChangeAlert, PhoneFindFaculty). All sizes are phone pixels, drawn on a
 * 393 × 852 screen inside <PhoneFrame>.
 *
 * The three demos sit on consecutive slides with the same device flip id, so
 * they must also share the device's height: PHONE_HEIGHT.
 */

export const PHONE_HEIGHT = 800;
export const SCREEN_W = 393;
export const SCREEN_H = 852;
/** Width of the hour labels down the left of a day, as in the app. */
export const GUTTER = 54;

/** "9am", "11:15am", "2:30pm": the app's own hour labels. */
export function hourLabel(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0
    ? `${h12}${suffix}`
    : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

/** Where a day is drawn: its top on the screen, the hours it spans, px per hour. */
export interface DayFrame {
  top: number;
  startHour: number;
  endHour: number;
  rowH: number;
}

export const yOf = (f: DayFrame, hour: number) =>
  f.top + (hour - f.startHour) * f.rowH;

/** The hours down the side and the hairlines they name. Each label is classed `hg-<hour>`. */
export function HourGrid({ frame }: { frame: DayFrame }) {
  const hours = Array.from(
    { length: frame.endHour - frame.startHour + 1 },
    (_, i) => frame.startHour + i,
  );
  return (
    <>
      {hours.map((h) => (
        <div key={h}>
          <span
            className={`hg-${h} absolute -translate-y-1/2 text-right font-mono text-[11px] text-[rgba(44,49,53,0.42)]`}
            style={{ top: yOf(frame, h), left: 0, width: GUTTER - 12 }}
          >
            {hourLabel(h)}
          </span>
          <span
            className="absolute right-0 h-px"
            style={{
              top: yOf(frame, h),
              left: GUTTER,
              background: "rgba(68,88,121,0.13)",
            }}
          />
          {h < frame.endHour && (
            <span
              className="absolute right-0 h-px"
              style={{
                top: yOf(frame, h + 0.5),
                left: GUTTER,
                background: "rgba(68,88,121,0.05)",
              }}
            />
          )}
        </div>
      ))}
    </>
  );
}

/**
 * One class on a day, placed by its hours. The app's block — course colour,
 * hairline ring, title then time and room in mono — a touch larger than the
 * app's own type, so it survives being projected.
 */
export function DayBlock({
  frame,
  start,
  end,
  title,
  course,
  room,
  detail,
  live,
  past,
  className,
  style,
  timeClassName,
  children,
}: {
  frame: DayFrame;
  start: number;
  end: number;
  title: ReactNode;
  /** The course whose colour it takes; defaults to the title. */
  course?: string;
  room?: string;
  detail?: ReactNode;
  live?: boolean;
  past?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Put on the time · room line, to change it from a timeline. */
  timeClassName?: string;
  /** Badges and other overlays, positioned inside the block. */
  children?: ReactNode;
}) {
  const tone = live
    ? LIVE
    : courseTone(course ?? (typeof title === "string" ? title : ""));
  const height = (end - start) * frame.rowH - 4;
  const roomy = height >= 60;
  return (
    <div
      className={`absolute rounded-[12px] px-3 text-left text-[#0d1117] ${className ?? ""}`}
      style={{
        top: yOf(frame, start) + 2,
        height,
        left: GUTTER,
        right: 10,
        paddingTop: roomy ? 7 : 5,
        background: tone.fill,
        boxShadow: `inset 0 0 0 1px ${tone.ring}`,
        opacity: past && !live ? 0.62 : 1,
        ...style,
      }}
    >
      <span className="block truncate pr-12 text-[14.5px] leading-[17px] font-semibold">
        {title}
      </span>
      <span
        className={`mt-[3px] block truncate font-mono text-[11.5px] leading-[14px] text-[rgba(44,49,53,0.72)] ${timeClassName ?? ""}`}
      >
        {[`${hourLabel(start)} – ${hourLabel(end)}`, room]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {detail && roomy && (
        <span className="mt-[3px] block truncate text-[11.5px] leading-[14px] text-[rgba(44,49,53,0.6)]">
          {detail}
        </span>
      )}
      {children}
    </div>
  );
}

/** A small capsule label on a block's top-right corner: NEXT, MOVED, NEW, TEST. */
export function BlockTag({
  children,
  bg = "#0d1117",
  className,
  style,
}: {
  children: ReactNode;
  bg?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`absolute top-[7px] right-[7px] rounded-full px-2 py-[3px] font-mono text-[10px] leading-none font-bold tracking-[0.06em] text-white ${className ?? ""}`}
      style={{ background: bg, ...style }}
    >
      {children}
    </span>
  );
}

/**
 * A touch, as screen recordings show one: a translucent disc with a white
 * rim. It is centred on its x/y, so tween `x` and `y` to the point touched.
 * Starts hidden.
 */
export function Finger({ className }: { className: string }) {
  return (
    <div
      className={`pointer-events-none absolute top-0 left-0 z-50 rounded-full ${className}`}
      style={{
        width: 54,
        height: 54,
        marginLeft: -27,
        marginTop: -27,
        opacity: 0,
        background: "rgba(13,17,23,0.24)",
        boxShadow:
          "inset 0 0 0 2.5px rgba(255,255,255,0.9), 0 8px 22px rgba(13,17,23,0.28)",
      }}
    />
  );
}

/**
 * A dark capsule floating over the app: "Offline", "Added to Google Calendar".
 * The class name goes on a full-width, centring wrapper, which is the thing
 * to tween (place it with `style.top`).
 */
export function Toast({
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
      className={`pointer-events-none absolute inset-x-0 flex justify-center ${className ?? ""}`}
      style={style}
    >
      <div
        className="flex items-center gap-2.5 rounded-full py-2.5 pr-5 pl-3 text-[14.5px] font-semibold whitespace-nowrap text-white"
        style={{
          background: "rgba(13,17,23,0.92)",
          boxShadow: "0 10px 28px rgba(13,17,23,0.28)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** A calendar glyph in a calendar app's blue: not anybody's logo. */
export function CalendarGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="3" width="20" height="19" rx="4" fill="#ffffff" />
      <path d="M2 7a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v2H2z" fill="#4285f4" />
      <text
        x="12"
        y="19.5"
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        fill="#4285f4"
        fontFamily="var(--font-display)"
      >
        13
      </text>
    </svg>
  );
}

/**
 * A Plannr notification, as iOS draws one: MockNotification's look, with
 * type a size up — on these slides the notification is the message.
 */
export function Notice({
  title,
  body,
  time = "now",
  size = "md",
  className,
  style,
}: {
  title: ReactNode;
  body: ReactNode;
  time?: string;
  /** "lg" for a notification that is the whole message of its build. */
  size?: "md" | "lg";
  className?: string;
  style?: CSSProperties;
}) {
  const lg = size === "lg";
  return (
    <div
      className={`flex rounded-[24px] text-[#0d1117] ${lg ? "gap-3.5 p-4" : "gap-3 p-3.5"} ${className ?? ""}`}
      style={{
        background: "rgba(245,246,248,0.9)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 12px 34px rgba(0,0,0,0.22)",
        ...style,
      }}
    >
      <span
        className={`flex shrink-0 items-center justify-center bg-[#0d1117] ${lg ? "h-[50px] w-[50px] rounded-[12px]" : "h-[42px] w-[42px] rounded-[10px]"}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.svg"
          alt=""
          className={`${lg ? "h-[31px]" : "h-[26px]"} w-auto`}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate font-bold ${lg ? "text-[20px]" : "text-[16.5px]"}`}
          >
            {title}
          </span>
          <span
            className={`shrink-0 text-[rgba(44,49,53,0.5)] ${lg ? "text-[14.5px]" : "text-[13px]"}`}
          >
            {time}
          </span>
        </span>
        <span
          className={`mt-0.5 block leading-[1.3] text-[rgba(44,49,53,0.9)] ${lg ? "text-[18.5px]" : "text-[15.5px]"}`}
        >
          {body}
        </span>
      </span>
    </div>
  );
}
