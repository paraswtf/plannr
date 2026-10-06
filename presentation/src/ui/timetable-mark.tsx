import { useId } from "react";

/*
 * The timetable site's icon. time-table.sicsr.ac.in has no logo of its own,
 * so this is a small picture of the page, in the page's own colours: its
 * slate (#4b667b, the banner, headings and column of times), the white table
 * and the colours it gives the divisions' bookings. It stands beside the
 * other apps' real logos (ui/brand-marks.ts) on the intro slide's icons and
 * in the closing slide's merge, where its slate window becomes the base of
 * the Plannr mark.
 */

const SLATE = "#4b667b";

/** The icon as data, in its own 164 x 158 box: the window (one path, the
 * part that morphs) and its fill. */
export const TIMETABLE_MARK = {
  width: 164,
  height: 158,
  window:
    "M24 0H140C153.255 0 164 10.7452 164 24V134C164 147.255 153.255 158 140 158H24C10.7452 158 0 147.255 0 134V24C0 10.7452 10.7452 0 24 0Z",
  stops: [
    [0, "#56718a"],
    [1, "#3f586c"],
  ] as [number, string][],
  line: [82, 0, 82, 158] as [number, number, number, number],
} as const;

/* Bookings, in the colours the site gives its divisions. */
const BOOKED = [
  { x: 32, y: 40, w: 38, h: 26, color: "#cc0066" },
  { x: 74, y: 40, w: 38, h: 16, color: "#00cc66" },
  { x: 116, y: 46, w: 36, h: 30, color: "#9933ff" },
  { x: 74, y: 72, w: 38, h: 26, color: "#33ffff" },
  { x: 32, y: 82, w: 38, h: 16, color: "#ff66ff" },
  { x: 116, y: 98, w: 36, h: 22, color: "#00ff80" },
  { x: 32, y: 116, w: 38, h: 24, color: "#3399ff" },
  { x: 74, y: 120, w: 38, h: 18, color: "#ff99cc" },
] as const;

/** Everything on the window: the banner's dots, the page, its column of
 * times, the grid and the bookings. In the mark's own units. */
export function TimetableMarkDetail() {
  return (
    <>
      <circle cx="20" cy="17" r="5" fill="#ffffff" opacity="0.8" />
      <circle cx="36" cy="17" r="5" fill="#ffffff" opacity="0.45" />
      <rect x="8" y="32" width="148" height="116" rx="10" fill="#ffffff" />
      <rect x="8" y="32" width="20" height="116" rx="6" fill={SLATE} />
      <path
        d="M71 36V146M113 36V146M30 69H154M30 104H154"
        stroke="#e7ebee"
        strokeWidth="2"
      />
      {BOOKED.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx="3"
          fill={b.color}
        />
      ))}
    </>
  );
}

/** The whole icon, `width` canvas pixels wide. */
export function TimetableMark({ width }: { width: number }) {
  const id = `tt-${useId().replace(/:/g, "")}`;
  const [x1, y1, x2, y2] = TIMETABLE_MARK.line;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${TIMETABLE_MARK.width} ${TIMETABLE_MARK.height}`}
      width={width}
      height={(width * TIMETABLE_MARK.height) / TIMETABLE_MARK.width}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient
          id={id}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          gradientUnits="userSpaceOnUse"
        >
          {TIMETABLE_MARK.stops.map(([offset, color]) => (
            <stop key={offset} offset={offset} stopColor={color} />
          ))}
        </linearGradient>
      </defs>
      <path d={TIMETABLE_MARK.window} fill={`url(#${id})`} />
      <TimetableMarkDetail />
    </svg>
  );
}
