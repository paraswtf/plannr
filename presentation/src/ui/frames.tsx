import type { CSSProperties, ReactNode } from "react";

import { Icon } from "./icon";

/**
 * Device frames for the product mock-ups.
 *
 * Both draw their screen at the device's own logical size — a phone screen is
 * 393 × 852, like an iPhone 15 — and scale the whole device to the height you
 * ask for. So a screen is written in phone pixels (16px body text looks like
 * 16px on a phone) and still fills a slide.
 *
 * When a device travels between two slides (same `flipId`), give it the same
 * `height` on both: the box morphs, the drawing inside is scaled once.
 */

export const PHONE_SCREEN = { width: 393, height: 852 } as const;
const BEZEL = 13;
const PHONE = {
  width: PHONE_SCREEN.width + BEZEL * 2,
  height: PHONE_SCREEN.height + BEZEL * 2,
};

export function PhoneFrame({
  children,
  height = 820,
  flipId,
  screen = "light",
  screenBg,
  time = "9:41",
  statusBar = true,
  className,
  style,
}: {
  children: ReactNode;
  /** Height of the whole device on the canvas, in canvas pixels. */
  height?: number;
  flipId?: string;
  /** Colour of the status bar's ink: dark text on a light screen, or not. */
  screen?: "light" | "dark";
  screenBg?: string;
  time?: string;
  statusBar?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const k = height / PHONE.height;
  return (
    <div
      data-flip-id={flipId}
      className={`relative shrink-0 ${className ?? ""}`}
      style={{ width: PHONE.width * k, height, ...style }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          width: PHONE.width,
          height: PHONE.height,
          transform: `scale(${k})`,
        }}
      >
        {/* Body: a dark titanium edge, drawn as rings rather than borders. */}
        <div
          className="absolute inset-0 rounded-[68px]"
          style={{
            background:
              "linear-gradient(160deg, #3a414d, #161a20 40%, #2a3039)",
            // A light stage: the shadow is long, soft and slate-tinted.
            boxShadow:
              "inset 0 0 0 1.5px rgba(255,255,255,0.18), 0 56px 110px -34px rgba(16,24,40,0.42), 0 20px 40px -20px rgba(16,24,40,0.3)",
          }}
        />
        <div
          className="absolute overflow-hidden rounded-[55px]"
          style={{
            left: BEZEL,
            top: BEZEL,
            width: PHONE_SCREEN.width,
            height: PHONE_SCREEN.height,
            background:
              screenBg ?? (screen === "light" ? "#eef0f3" : "#0d1117"),
            color: screen === "light" ? "#0d1117" : "#ffffff",
          }}
        >
          <div data-enter className="absolute inset-0">
            {children}
          </div>
          {statusBar && (
            <StatusBar
              time={time}
              ink={screen === "light" ? "#0d1117" : "#ffffff"}
            />
          )}
          {/* Dynamic island */}
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black"
            style={{ top: 11, width: 124, height: 36 }}
          />
          {/* Home indicator */}
          <div
            className="phone-home-indicator absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{
              bottom: 8,
              width: 134,
              height: 5,
              background:
                screen === "light"
                  ? "rgba(13,17,23,0.85)"
                  : "rgba(255,255,255,0.85)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** The phone's top 54px: the time on the left, signal, wifi and battery. */
export function StatusBar({
  time = "9:41",
  ink = "#0d1117",
}: {
  time?: string;
  ink?: string;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between"
      style={{ height: 54, padding: "0 34px 0 46px", color: ink }}
    >
      <span
        className="text-[17px] font-semibold tracking-[-0.01em]"
        style={{ fontFamily: "-apple-system, var(--font-body)" }}
      >
        {time}
      </span>
      <span className="flex items-center gap-[6px]">
        <svg width="18" height="12" viewBox="0 0 18 12" fill={ink} aria-hidden>
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill={ink} aria-hidden>
          <path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 0 0 8 .4 10.4 10.4 0 0 0 .8 3.3L2 4.6a8.6 8.6 0 0 1 6-2.4zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.6 6.6 0 0 0 8 4a6.6 6.6 0 0 0-4.6 1.8l1.2 1.3c.9-.8 2.1-1.3 3.4-1.3zM8 9.4l1.9-2a2.8 2.8 0 0 0-3.8 0z" />
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden>
          <rect
            x="0.5"
            y="0.5"
            width="23"
            height="12"
            rx="3.5"
            fill="none"
            stroke={ink}
            strokeOpacity="0.4"
          />
          <rect x="2" y="2" width="20" height="9" rx="2" fill={ink} />
          <path d="M25 4.5v4a2 2 0 0 0 0-4z" fill={ink} fillOpacity="0.45" />
        </svg>
      </span>
    </div>
  );
}

/**
 * A desktop browser window: traffic lights, a URL bar, and your page below.
 * `insecure` adds Chrome's "Not secure" label, for plain-HTTP sites.
 */
export function BrowserFrame({
  children,
  url,
  width = 1200,
  height = 760,
  flipId,
  theme = "light",
  insecure = false,
  className,
  style,
  contentStyle,
}: {
  children: ReactNode;
  url: string;
  width?: number;
  height?: number;
  flipId?: string;
  theme?: "light" | "dark";
  insecure?: boolean;
  className?: string;
  style?: CSSProperties;
  contentStyle?: CSSProperties;
}) {
  const dark = theme === "dark";
  return (
    <div
      data-flip-id={flipId}
      className={`relative flex shrink-0 flex-col overflow-hidden rounded-[18px] ${className ?? ""}`}
      style={{
        width,
        height,
        background: dark ? "#151d28" : "#ffffff",
        boxShadow: dark
          ? "inset 0 0 0 1px rgba(255,255,255,0.12), 0 40px 100px rgba(0,0,0,0.5)"
          : "inset 0 0 0 1px rgba(16,24,40,0.1), 0 2px 6px -2px rgba(16,24,40,0.1), 0 48px 100px -36px rgba(16,24,40,0.36)",
        ...style,
      }}
    >
      <div
        className="relative flex h-[52px] shrink-0 items-center px-5"
        style={{
          background: dark ? "#1e2630" : "#eceef1",
          boxShadow: dark
            ? "inset 0 -1px 0 rgba(255,255,255,0.08)"
            : "inset 0 -1px 0 rgba(13,17,23,0.08)",
        }}
      >
        <span className="flex gap-2">
          <span className="h-[13px] w-[13px] rounded-full bg-[#ff5f57]" />
          <span className="h-[13px] w-[13px] rounded-full bg-[#febc2e]" />
          <span className="h-[13px] w-[13px] rounded-full bg-[#28c840]" />
        </span>
        <div
          className="absolute left-1/2 flex h-[32px] w-[min(560px,60%)] -translate-x-1/2 items-center gap-2 rounded-[9px] px-3 text-[15px]"
          style={{
            background: dark ? "rgba(255,255,255,0.07)" : "#ffffff",
            color: dark ? "rgba(255,255,255,0.7)" : "rgba(13,17,23,0.7)",
            boxShadow: dark ? "none" : "inset 0 0 0 1px rgba(13,17,23,0.08)",
          }}
        >
          {insecure ? (
            <span className="flex shrink-0 items-center gap-1.5 font-semibold whitespace-nowrap text-[#c5221f]">
              <Icon name="alert" size={15} stroke={2.2} />
              Not secure
              <span className="mx-1 h-4 w-px bg-current opacity-30" />
            </span>
          ) : (
            <svg
              width="12"
              height="14"
              viewBox="0 0 12 14"
              aria-hidden
              fill="currentColor"
              opacity={0.65}
            >
              <path d="M2 6V4.5a4 4 0 1 1 8 0V6h.5A1.5 1.5 0 0 1 12 7.5v5A1.5 1.5 0 0 1 10.5 14h-9A1.5 1.5 0 0 1 0 12.5v-5A1.5 1.5 0 0 1 1.5 6zm1.6 0h4.8V4.5a2.4 2.4 0 1 0-4.8 0z" />
            </svg>
          )}
          <span className="truncate">{url}</span>
        </div>
      </div>
      <div
        data-enter
        className="relative min-h-0 flex-1 overflow-hidden"
        style={contentStyle}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The double bezel: a tray holding a plate. Wrap anything precious in it, a
 * photo, a product shot, a quote, so it sits on the stage like a machined
 * object rather than a flat rectangle. The inner radius follows the outer one
 * so the curves stay concentric.
 */
export function Bezel({
  children,
  radius = 30,
  pad = 8,
  flipId,
  className,
  coreClassName,
  style,
  coreStyle,
}: {
  children: ReactNode;
  /** Outer radius in canvas pixels; the plate gets radius - pad. */
  radius?: number;
  pad?: number;
  flipId?: string;
  className?: string;
  coreClassName?: string;
  style?: CSSProperties;
  coreStyle?: CSSProperties;
}) {
  return (
    <div
      data-flip-id={flipId}
      className={`bezel ${className ?? ""}`}
      style={{ borderRadius: radius, padding: pad, ...style }}
    >
      <div
        className={`bezel-core relative h-full w-full overflow-hidden ${coreClassName ?? ""}`}
        style={{ borderRadius: radius - pad, ...coreStyle }}
      >
        {children}
      </div>
    </div>
  );
}
