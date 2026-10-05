import { useId } from "react";

/**
 * The page inside OldTimetable's browser: an MRBS day view, drawn the way the
 * college's install draws it — a navy banner, a row of links, and a rooms-by-
 * time table far wider and taller than the window. Everything is absolutely
 * placed at 1:1 on the canvas, in 10–11px Verdana, on purpose.
 *
 * Classes carry the hooks OldTimetable animates:
 *   .ot-band, .ot-nav, .ot-thead, .ot-rows, .ot-bars, .ot-progress,
 *   .ot-status (with .ot-status-wait / .ot-status-data), .ot-dim (with its
 *   .ot-hole-<id> openings, see HOLES),
 *   .ot-done (the "everything loaded" bubble the step-1 callout points at)
 */

export const PAGE = {
  width: 940,
  /** The browser's content area: the frame is 800 tall, its bar 52. */
  height: 748,
  bandH: 56,
  gridTop: 132,
  headH: 28,
  rowH: 22,
  timeW: 44,
  colW: 66,
  rows: 28,
  bar: 12,
  /** The "Done" status bubble, bottom-left of the page, above the dim. */
  doneW: 330,
  doneH: 24,
} as const;

const FONT = 'Verdana, Geneva, Tahoma, "DejaVu Sans", Arial, sans-serif';
const NAVY = "#1d3b6e";
const TH = "#4a6a99";
const LINK = "#1a3fa8";

export const ROOMS = [
  "101 (60)",
  "102 (60)",
  "103 (40)",
  "104 (40)",
  "201 (24)",
  "202 (60)",
  "203 (24)",
  "204 (60)",
  "301 (60)",
  "302 (40)",
  "303 (60)",
  "304 (40)",
  "Lab 1 (40)",
  "Lab 2 (40)",
  "Lab 3 (40)",
] as const;

/** MRBS's stock booking-type colours, one per cohort. */
const COHORTS = [
  { label: "BCA Sem VII (DS)", fill: "#ffccff" },
  { label: "BCA (V) - Div. A", fill: "#99cccc" },
  { label: "BCA (V) - Div. B", fill: "#c0e0ff" },
  { label: "BBA(IT) Sem V - Div. A", fill: "#ffff99" },
  { label: "BBA(IT) Sem VII", fill: "#ffcc99" },
  { label: "MBA(IT) Sem I", fill: "#ddffdd" },
  { label: "BCA (III) - Div. C", fill: "#ffb3b3" },
  { label: "BCA + BBA(IT) Sem VII", fill: "#e0d0ff" },
] as const;

const COURSES = [
  "Data Mining - Dr. Mehta",
  "Cloud Computing - Prof. Iyer",
  "Web Technologies",
  "Cyber Security - Dr. Fernandes",
  "Business Analytics",
  "Software Testing - Prof. Kulkarni",
  "Design Thinking (PK)",
  "CC Lab - Grp 2",
  "WT Practical - Lab 2",
  "DM (SM) - Group 1",
  "Business Analytics - Dr. Fernandes",
  "Cyber Sec. Lab",
] as const;

export interface Booking {
  col: number;
  row: number;
  span: number;
  text: string;
  fill: string;
}

/** A small deterministic generator, so the page is the same every run. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length) % list.length]!;
}

/**
 * The one cell the "desktop-sized text" callout points at: Design Thinking at
 * 11:00 (row 6, half-hours from 08:00), the class the next slide follows.
 */
export const PINNED = { col: 1, row: 6, span: 3 } as const;

function buildBookings(): Booking[] {
  const r = rng(13082026);
  const out: Booking[] = [];
  ROOMS.forEach((_, col) => {
    let row = Math.floor(r() * 2);
    while (row < PAGE.rows - 1) {
      if (col === PINNED.col && row <= PINNED.row && row + 4 > PINNED.row) {
        row = PINNED.row;
        out.push({
          ...PINNED,
          text: "BCA-A SEM VII DT (PK) 301",
          fill: "#ffff99",
        });
        row += PINNED.span + 1;
        continue;
      }
      const span = pick(r, [2, 2, 2, 3, 3, 4]);
      const cohort = pick(r, COHORTS);
      const course = pick(r, COURSES);
      const roll = r();
      const text =
        roll < 0.14
          ? `Extra Lecture : ${cohort.label} - ${course}`
          : roll < 0.24
            ? `Resch: ${cohort.label} ${course}`
            : `${cohort.label} - ${course} - ${ROOMS[col]!.split(" ")[0]}`;
      out.push({
        col,
        row,
        span: Math.min(span, PAGE.rows - row),
        text,
        fill: cohort.fill,
      });
      row += span + pick(r, [0, 0, 0, 1, 1, 2]);
    }
  });
  return out;
}

const BOOKINGS = buildBookings();

const time = (row: number) => {
  const minutes = 8 * 60 + row * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

function Link({ children, bold }: { children: string; bold?: boolean }) {
  return (
    <span
      style={{
        color: LINK,
        textDecoration: "underline",
        fontWeight: bold ? 700 : 400,
      }}
    >
      {children}
    </span>
  );
}

/**
 * The parts of the page a callout rings, in page pixels. Under the callouts
 * the page is washed back, except through these, which OldTimetable opens
 * (`.ot-hole-<callout id>`) as each callout lands.
 */
export const HOLES = [
  {
    id: "one-page",
    x: PAGE.timeW,
    y: PAGE.gridTop,
    w: PAGE.width - PAGE.bar - PAGE.timeW,
    h: PAGE.headH,
  },
  {
    id: "tiny-type",
    x: PAGE.timeW + PINNED.col * PAGE.colW,
    y: PAGE.gridTop + PAGE.headH + PINNED.row * PAGE.rowH,
    w: PAGE.colW,
    h: PINNED.span * PAGE.rowH,
  },
] as const;

export function MrbsPage() {
  const { width, height, bandH, gridTop, headH, rowH, timeW, colW, rows, bar } =
    PAGE;
  const maskId = `ot-wash-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const viewW = width - bar;
  const viewH = height - bar;
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-white"
      style={{
        fontFamily: FONT,
        color: "#000",
        fontSize: 11,
        lineHeight: "13px",
      }}
    >
      {/* Banner */}
      <div
        className="ot-band absolute top-0 left-0 flex items-center justify-between"
        style={{
          width: viewW,
          height: bandH,
          background: NAVY,
          color: "#fff",
          padding: "0 10px",
        }}
      >
        <div className="flex items-center gap-[9px]">
          <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
            <circle cx="17" cy="17" r="15.5" fill="#fff" />
            <circle
              cx="17"
              cy="17"
              r="12"
              fill="none"
              stroke={NAVY}
              strokeWidth="1.5"
            />
            <path
              d="M11 21.5h12M12.5 20V13M17 20V12M21.5 20V13M10.5 12.5 17 9l6.5 3.5z"
              stroke={NAVY}
              strokeWidth="1.4"
              fill="none"
            />
          </svg>
          <div className="flex flex-col">
            <span style={{ fontSize: 13, fontWeight: 700, lineHeight: "16px" }}>
              Symbiosis Institute of Computer Studies and Research
            </span>
            <span style={{ fontSize: 11, lineHeight: "14px", opacity: 0.85 }}>
              Timetable
            </span>
          </div>
        </div>
        <div className="flex items-center gap-[10px]" style={{ fontSize: 10 }}>
          <span className="flex items-center gap-[3px]">
            {["13", "August", "2026"].map((v) => (
              <span
                key={v}
                className="flex items-center gap-[3px] bg-white"
                style={{
                  color: "#000",
                  padding: "1px 3px",
                  boxShadow: "inset 0 0 0 1px #7a8aa6",
                }}
              >
                {v}
                <span style={{ fontSize: 7 }}>▼</span>
              </span>
            ))}
            <span
              className="bg-[#e6e6e6]"
              style={{
                color: "#000",
                padding: "1px 5px",
                boxShadow: "inset 0 0 0 1px #888",
              }}
            >
              Go
            </span>
          </span>
          <span style={{ textDecoration: "underline" }}>Help</span>
          <span style={{ textDecoration: "underline" }}>Report</span>
          <span className="flex items-center gap-[3px]">
            Search:
            <span
              className="inline-block bg-white"
              style={{
                width: 54,
                height: 14,
                boxShadow: "inset 0 0 0 1px #7a8aa6",
              }}
            />
          </span>
          <span style={{ textDecoration: "underline" }}>Log in</span>
        </div>
      </div>

      {/* Areas, view, date, day-to-day links */}
      <div
        className="ot-nav absolute left-0"
        style={{ top: bandH, width: viewW, height: gridTop - bandH }}
      >
        <div
          className="absolute flex items-center gap-[6px]"
          style={{ left: 10, top: 9 }}
        >
          <span style={{ fontWeight: 700 }}>Areas:</span>
          {[
            "SICSR",
            "SICSR Annexe",
            "Computer Labs",
            "Seminar Halls",
            "Exams",
          ].map((a, i) => (
            <span
              key={a}
              style={{
                padding: "1px 5px",
                background: i === 0 ? "#dde5f2" : "transparent",
                boxShadow: i === 0 ? "inset 0 0 0 1px #9fb0cc" : "none",
                color: i === 0 ? "#000" : LINK,
                textDecoration: i === 0 ? "none" : "underline",
              }}
            >
              {a}
            </span>
          ))}
        </div>
        <div
          className="absolute flex items-center gap-[4px]"
          style={{ right: 10, top: 10 }}
        >
          View: <Link bold>Day</Link> | <Link>Week</Link> | <Link>Month</Link>
        </div>
        <div
          className="absolute inset-x-0 text-center"
          style={{ top: 30, fontSize: 14, lineHeight: "18px", fontWeight: 700 }}
        >
          Thursday 13 August 2026
        </div>
        <div
          className="absolute flex justify-between"
          style={{ left: 10, right: 10, top: 54 }}
        >
          <Link>{"<< Go to Day Before"}</Link>
          <Link>Go to Today</Link>
          <Link>{"Go to Day After >>"}</Link>
        </div>
      </div>

      {/* The table, wider and taller than the window */}
      <div
        className="absolute left-0 overflow-hidden"
        style={{ top: gridTop, width: viewW, height: viewH - gridTop }}
      >
        <div
          className="ot-grid absolute top-0 left-0"
          style={{
            width: timeW + colW * ROOMS.length,
            height: headH + rowH * rows,
          }}
        >
          <div
            className="ot-thead absolute top-0 left-0 flex"
            style={{ height: headH }}
          >
            <div
              className="flex items-center justify-center"
              style={{
                width: timeW,
                background: TH,
                color: "#fff",
                fontWeight: 700,
                boxShadow: "inset -1px -1px 0 #c8c8c8",
              }}
            >
              Time
            </div>
            {ROOMS.map((room) => (
              <div
                key={room}
                className="flex items-center justify-center"
                style={{
                  width: colW,
                  background: TH,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 10,
                  boxShadow: "inset -1px -1px 0 #c8c8c8",
                }}
              >
                {room}
              </div>
            ))}
          </div>
          <div
            className="ot-rows absolute left-0"
            style={{
              top: headH,
              width: timeW + colW * ROOMS.length,
              height: rowH * rows,
            }}
          >
            {/* Empty slots: alternating rows, grey hairlines */}
            {Array.from({ length: rows }, (_, row) => (
              <div
                key={row}
                className="absolute left-0 flex"
                style={{
                  top: row * rowH,
                  height: rowH,
                  width: timeW + colW * ROOMS.length,
                }}
              >
                <div
                  className="flex items-start justify-center"
                  style={{
                    width: timeW,
                    background: "#e4eaf4",
                    color: LINK,
                    paddingTop: 4,
                    fontSize: 10,
                    boxShadow: "inset -1px -1px 0 #b9c2d0",
                  }}
                >
                  {time(row)}
                </div>
                {ROOMS.map((room) => (
                  <div
                    key={room}
                    style={{
                      width: colW,
                      background: row % 2 ? "#f4f4f4" : "#fff",
                      boxShadow: "inset -1px -1px 0 #d2d2d2",
                    }}
                  />
                ))}
              </div>
            ))}
            {BOOKINGS.map((b, i) => (
              <div
                key={i}
                className={`absolute overflow-hidden ${b.col === PINNED.col && b.row === PINNED.row ? "ot-pinned" : ""}`}
                style={{
                  left: timeW + b.col * colW,
                  top: b.row * rowH,
                  width: colW,
                  height: b.span * rowH,
                  background: b.fill,
                  boxShadow:
                    "inset -1px -1px 0 #9c9c9c, inset 1px 1px 0 rgba(255,255,255,0.6)",
                  padding: "2px 3px",
                  fontSize: 10,
                  lineHeight: "11px",
                  color: "#111",
                  wordBreak: "break-word",
                }}
              >
                {b.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/*
        Washes the page back towards the stage under the callouts, with a
        hole for each thing a callout rings, so what it points at stays in
        full colour while the rest of the page steps back.
      */}
      <svg
        className="ot-dim pointer-events-none absolute inset-0"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ opacity: 0 }}
        aria-hidden
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <rect width={width} height={height} fill="#fff" />
            {HOLES.map((h) => (
              <rect
                key={h.id}
                className={`ot-hole-${h.id}`}
                x={h.x}
                y={h.y}
                width={h.w}
                height={h.h}
                rx={4}
                fill="#000"
                style={{ opacity: 0 }}
              />
            ))}
          </mask>
        </defs>
        <rect
          width={width}
          height={height}
          fill="#f2f3f6"
          fillOpacity={0.66}
          mask={`url(#${maskId})`}
        />
      </svg>

      {/* The page's own scrollbars: short thumbs, a very big page */}
      <div
        className="ot-bars absolute right-0 bottom-0 left-0"
        style={{
          height: bar,
          background: "#f1f1f1",
          boxShadow: "inset 0 1px 0 #dcdcdc",
        }}
      >
        <div
          className="ot-hthumb absolute rounded-full"
          style={{
            left: timeW + 4,
            top: 3,
            width: 150,
            height: 6,
            background: "#a9a9a9",
          }}
        />
      </div>
      <div
        className="ot-bars absolute top-0 right-0"
        style={{
          width: bar,
          bottom: bar,
          background: "#f1f1f1",
          boxShadow: "inset 1px 0 0 #dcdcdc",
        }}
      >
        <div
          className="absolute rounded-full"
          style={{
            top: 4,
            left: 3,
            width: 6,
            height: 230,
            background: "#a9a9a9",
          }}
        />
      </div>

      {/* Loading: the blue strip under the address bar, and the status bubble */}
      <div
        className="ot-progress absolute top-0 left-0"
        style={{
          height: 3,
          width: width,
          background: "#1a73e8",
          transformOrigin: "0 50%",
          transform: "scaleX(0)",
        }}
      />
      <div
        className="ot-status absolute"
        style={{
          left: 0,
          bottom: 0,
          padding: "3px 8px",
          background: "#f2f2f2",
          color: "#333",
          fontFamily: "-apple-system, system-ui, sans-serif",
          fontSize: 12,
          boxShadow: "inset 0 0 0 1px #c9c9c9",
          borderTopRightRadius: 4,
          opacity: 0,
        }}
      >
        <span className="ot-status-wait">
          Waiting for time-table.sicsr.ac.in…
        </span>
        <span className="ot-status-data" style={{ display: "none" }}>
          Transferring data from time-table.sicsr.ac.in…
        </span>
      </div>
      {/* After loading: what it fetched — the callout "Loads everything" points here */}
      <div
        className="ot-done absolute flex items-center"
        style={{
          left: 0,
          bottom: 0,
          width: PAGE.doneW,
          height: PAGE.doneH,
          padding: "0 9px",
          background: "#f2f2f2",
          color: "#222",
          fontFamily: "-apple-system, system-ui, sans-serif",
          fontSize: 13,
          whiteSpace: "nowrap",
          boxShadow: "inset 0 0 0 1px #c9c9c9",
          borderTopRightRadius: 4,
          opacity: 0,
        }}
      >
        <span>
          <b>Done</b>: every room, every division, all day
        </span>
      </div>
    </div>
  );
}
