import type { CSSProperties } from "react";

import {
  APP_TILE,
  MARK_SIZE,
  MOODLE_CAP,
  MOODLE_M,
  MOODLE_VIEWBOX,
  WHATSAPP,
} from "~/ui/brand-marks";
import { TimetableMark } from "~/ui/timetable-mark";

import { GmailLogo } from "./_gmail-page";

/*
 * The apps people use today, as their own app icons, matched to the icons
 * the App Store shows for them in October 2026, and the timetable site
 * beside them (it has no logo, so its icon is a small picture of its page,
 * see ui/timetable-mark.tsx):
 *   - Gmail: the gradient M on white, about 77% of the tile's width (the
 *     mark the three-apps slide draws, see _gmail-page.tsx);
 *   - WhatsApp: the white bubble on its green, which runs from #00EC71 at
 *     the top to #00DB41 at the foot, the bubble 71% of the tile;
 *   - Moodle: the orange "m" with the dark mortarboard on white.
 * The marks themselves, and where they come from, are in ui/brand-marks.ts.
 */

const APPS = {
  timetable: { name: "Timetable", tile: APP_TILE.timetable },
  gmail: { name: "Gmail", tile: APP_TILE.gmail },
  whatsapp: { name: "WhatsApp", tile: APP_TILE.whatsapp },
  moodle: { name: "Moodle", tile: APP_TILE.moodle },
} as const;

export type App = keyof typeof APPS;

/** An app's icon: its mark on its tile, `size` canvas pixels square. */
export function AppIcon({
  app,
  size = 72,
  className,
  style,
}: {
  app: App;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { name, tile } = APPS[app];
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        // An app icon's corner, about 22% of its side.
        borderRadius: size * 0.225,
        background: tile,
        boxShadow: "inset 0 0 0 1px rgba(16,24,40,0.08), var(--shadow-1)",
        ...style,
      }}
    >
      {app === "timetable" && (
        <TimetableMark width={size * MARK_SIZE.timetable} />
      )}
      {app === "gmail" && <GmailLogo width={size * MARK_SIZE.gmail} />}
      {app === "whatsapp" && (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          width={size * MARK_SIZE.whatsapp}
          height={size * MARK_SIZE.whatsapp}
          fill="#ffffff"
        >
          <path d={WHATSAPP} />
        </svg>
      )}
      {app === "moodle" && (
        <svg
          aria-hidden
          viewBox={MOODLE_VIEWBOX}
          width={size}
          height={size}
          className="absolute inset-0"
        >
          <path d={MOODLE_CAP} fill="#333333" />
          <path d={MOODLE_M} fill="#f48020" />
        </svg>
      )}
    </span>
  );
}
