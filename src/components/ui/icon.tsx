import type { CSSProperties } from "react";

/**
 * Icon set ported from the Plannr prototype.
 *
 * These are deliberately not swapped for an icon library: the stroke weights
 * and the shapes (the door, the room grid) are part of the product's visual
 * language, and the prototype's names are used throughout the nav config.
 */

const PATHS = {
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18" />
      <path d="M8 2.5v4" />
      <path d="M16 2.5v4" />
    </>
  ),
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ),
  door: (
    <>
      <path d="M4 21h16" />
      <path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21" />
      <path d="M13.5 12h.01" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  users: (
    <>
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="9" cy="7" r="3.5" />
      <path d="M22 20v-1.5a4 4 0 0 0-3-3.87" />
      <path d="M16 3.6a4 4 0 0 1 0 7.75" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="2.5" width="16" height="19" rx="2" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
      <path d="M10 21.5v-3h4v3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 1.9" />
    </>
  ),
  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.2l2.8 2.8L16.2 9.4" />
    </>
  ),
  x: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  /** Points at the edge the sidebar folds towards; flipped when it is folded. */
  panelFold: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M10 4v16" />
      <path d="M6.6 10.2 5 12l1.6 1.8" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 22 20H2z" />
      <path d="M12 9.5v5" />
      <path d="M12 17.5h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  mapPin: (
    <>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  chevronDown: <path d="m5 9 7 7 7-7" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  layers: (
    <>
      <path d="m12 2.5 9 5-9 5-9-5z" />
      <path d="m3 12.5 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  book: (
    <>
      <path d="M4 4.5A2 2 0 0 1 6 2.5h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 18.5A2 2 0 0 0 6 21.5h13" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="3.5" width="19" height="13" rx="2" />
      <path d="M8.5 20.5h7" />
      <path d="M12 16.5v4" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" />
    </>
  ),
  snow: (
    <>
      <path d="M12 2.5v19" />
      <path d="m4 7 16 10M20 7 4 17" />
    </>
  ),
  square: <rect x="4" y="5" width="16" height="14" rx="2" />,
  mic: (
    <>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3.5" />
    </>
  ),
  star: (
    <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5-4.7-4.6 6.5-.9z" />
  ),
  sparkles: (
    <>
      <path d="m12 3 1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M18.5 15.5 19.4 18l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9z" />
    </>
  ),
  swap: (
    <>
      <path d="M3 8h13" />
      <path d="m12 4 4 4-4 4" />
      <path d="M21 16H8" />
      <path d="m12 12-4 4 4 4" />
    </>
  ),
  logout: (
    <>
      <path d="M10 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H10" />
      <path d="M16 16.5 20.5 12 16 7.5" />
      <path d="M20 12H9" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6.5h16" />
      <path d="M9 6.5V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 6.5 7 20a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 20l1-13.5" />
    </>
  ),
  upload: (
    <>
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
      <path d="M8 8.5 12 4.5l4 4" />
      <path d="M12 4.5V15" />
    </>
  ),
  /** Bow bottom-left, two teeth on the blade — the API key screen. */
  key: (
    <>
      <circle cx="8" cy="16" r="5" />
      <path d="M11.6 12.4 20.5 3.5" />
      <path d="m14.3 9.7 2.3 2.3" />
      <path d="m17.1 6.9 2.3 2.3" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12.5" height="12.5" rx="2.5" />
      <path d="M5 15.5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2" />
    </>
  ),
  /** Rolling a credential: the same thing, come round again. */
  rotate: (
    <>
      <path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1.1 6.7 2.8L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
  color?: string;
  fill?: string;
  className?: string;
  style?: CSSProperties;
}

export function Icon({
  name,
  size = 18,
  stroke = 1.75,
  color = "currentColor",
  fill = "none",
  className,
  style,
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
