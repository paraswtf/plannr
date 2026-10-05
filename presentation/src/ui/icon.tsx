import type { CSSProperties } from "react";

/**
 * Plannr's icon set, copied from the app (src/components/ui/icon.tsx) so the
 * deck draws the product's own shapes, plus the handful a story about a
 * college day needs. Same 24-unit grid and round stroke throughout.
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

  /* ---- Added for the deck: same 24-unit grid, same stroke language. ---- */
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7.5 8 6 8-6" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  laptop: (
    <>
      <rect x="4" y="4.5" width="16" height="11" rx="1.5" />
      <path d="M2 19.5h20" />
    </>
  ),
  message: (
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z" />
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />,
  coffee: (
    <>
      <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
      <path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M8 2.5v3M12 2.5v3" />
    </>
  ),
  alarm: (
    <>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9.5V13l2.5 1.5" />
      <path d="M4 4.5 2.5 6M20 4.5 21.5 6" />
    </>
  ),
  hourglass: (
    <>
      <path d="M6.5 2.5h11M6.5 21.5h11" />
      <path d="M7.5 2.5c0 5 9 5.5 9 9.5s-9 4.5-9 9.5" />
      <path d="M16.5 2.5c0 5-9 5.5-9 9.5s9 4.5 9 9.5" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8.5 7V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v2" />
      <path d="M3 12.5h18" />
    </>
  ),
  cap: (
    <>
      <path d="m12 4 10 5-10 5L2 9z" />
      <path d="M6 11v4.5c0 1.4 2.7 3 6 3s6-1.6 6-3V11" />
      <path d="M22 9v5" />
    </>
  ),
  clipboard: (
    <>
      <path d="M9 4.5H7A2 2 0 0 0 5 6.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-13a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="2.5" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  chart: (
    <>
      <path d="M3.5 20.5h17" />
      <rect x="5" y="11" width="3.5" height="7" rx="1" />
      <rect x="10.25" y="6" width="3.5" height="12" rx="1" />
      <rect x="15.5" y="13.5" width="3.5" height="4.5" rx="1" />
    </>
  ),
  file: (
    <>
      <path d="M14 2.5H7A2 2 0 0 0 5 4.5v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z" />
      <path d="M14 2.5v5h5" />
    </>
  ),
  sheet: (
    <>
      <path d="M14 2.5H7A2 2 0 0 0 5 4.5v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z" />
      <path d="M14 2.5v5h5" />
      <path d="M8.5 12.5h7M8.5 16h7M12 11v8" />
    </>
  ),
  zap: <path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
      <path d="M4 3.5V8h4.5" />
      <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
      <path d="M20 20.5V16h-4.5" />
    </>
  ),
  link: (
    <>
      <path d="M10 13.5a3.5 3.5 0 0 1 0-5l2-2a3.5 3.5 0 0 1 5 5l-1 1" />
      <path d="M14 10.5a3.5 3.5 0 0 1 0 5l-2 2a3.5 3.5 0 0 1-5-5l1-1" />
    </>
  ),
  linkBroken: (
    <>
      <path d="M9 7.5 10.5 6a3.5 3.5 0 0 1 5 5L14 12.5" />
      <path d="M15 16.5 13.5 18a3.5 3.5 0 0 1-5-5L10 11.5" />
      <path d="M4 7h2.5M7 4v2.5M20 17h-2.5M17 20v-2.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 13.5 5.5 5A2 2 0 0 1 7.4 3.5h9.2A2 2 0 0 1 18.5 5L21 13.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 13.5h5l1.5 2.5h5l1.5-2.5h5" />
    </>
  ),
  send: (
    <>
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3 14.5 21l-4-7.5L3 9.5z" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3.5 10v4a1 1 0 0 0 1 1H7l7 4.5v-15L7 9H4.5a1 1 0 0 0-1 1z" />
      <path d="M17.5 9a4 4 0 0 1 0 6" />
    </>
  ),
  gitBranch: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M6 8.5v7" />
      <path d="M18 8.5a6 6 0 0 1-6 6H8.5" />
    </>
  ),
  code: (
    <>
      <path d="m8.5 7-5 5 5 5" />
      <path d="m15.5 7 5 5-5 5" />
    </>
  ),
  heart: (
    <path d="M12 20.5s-8.5-5-8.5-11A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8.5 2.5c0 6-8.5 11-8.5 11z" />
  ),
  rocket: (
    <>
      <path d="M5 15c-1.5 1-2 3.5-2 6 2.5 0 5-.5 6-2" />
      <path d="M9.5 14.5 7 12c1-4 5-9 13-9.5-.5 8-5.5 12-9.5 13z" />
      <circle cx="15" cy="9" r="1.5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="9" cy="9.5" r="1.8" />
      <path d="m21 15.5-5-5-9 9.5" />
    </>
  ),
  wifiOff: (
    <>
      <path d="M8.8 15.3a5 5 0 0 1 6.4 0" />
      <path d="M5.5 12a10 10 0 0 1 4-2.4M18.5 12a10 10 0 0 0-2.2-1.5" />
      <path d="M2.5 8.5a15 15 0 0 1 5-3M21.5 8.5A15 15 0 0 0 12 5" />
      <path d="M12 19h.01" />
      <path d="M3 3l18 18" />
    </>
  ),
  hand: (
    <>
      <path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V10" />
      <path d="M12 9.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.5 14a1.5 1.5 0 0 1 2.4-1.8L9 15" />
    </>
  ),
  cursor: (
    <>
      <path d="M4.5 3.5 19 10.2l-6.4 2-2.3 6.8z" />
      <path d="m12.6 12.2 6 6" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-4-4L4 16z" />
      <path d="m14 6 4 4" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 18h6M10 21.5h4" />
      <path d="M8.5 15A6.5 6.5 0 1 1 15.5 15c-.7.6-1 1.3-1 2.2V18h-5v-.8c0-.9-.3-1.6-1-2.2z" />
    </>
  ),
  calendarCheck: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18" />
      <path d="M8 2.5v4M16 2.5v4" />
      <path d="m9 14.5 2 2 4-4" />
    </>
  ),
  calendarX: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18" />
      <path d="M8 2.5v4M16 2.5v4" />
      <path d="m10 13 4 4M14 13l-4 4" />
    </>
  ),
  download: (
    <>
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
      <path d="m8 11 4 4 4-4" />
      <path d="M12 15V4" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
      <path d="M12 17h.01" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

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
  size = 24,
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
