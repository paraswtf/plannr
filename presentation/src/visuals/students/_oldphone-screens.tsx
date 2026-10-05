import { Icon } from "~/ui/icon";

/*
 * The three apps a student goes through today, drawn in phone pixels
 * (393 × 852) for OldPhoneFlow. They are look-alikes, not copies: a browser,
 * a mail app and a group chat, with no third-party marks.
 *
 * Class names prefixed `op-` are what OldPhoneFlow's timeline animates.
 */

export const SCREEN_W = 393;
export const SCREEN_H = 852;

/* ---------------------------------------------------------------- status */

/** The top 54px, on mobile data: a weak signal and "4G", no wifi. */
export function OldStatusBar({ time }: { time: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between"
      style={{ height: 54, padding: "0 30px 0 46px", color: "#0d1117" }}
    >
      <span
        className="op-time text-[17px] font-semibold tracking-[-0.01em]"
        style={{ fontFamily: "-apple-system, var(--font-body)" }}
      >
        {time}
      </span>
      <span className="flex items-center gap-[6px]">
        <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden>
          <rect x="0" y="8" width="3" height="4" rx="1" fill="#0d1117" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="#0d1117" />
          <rect
            x="10"
            y="3"
            width="3"
            height="9"
            rx="1"
            fill="#0d1117"
            fillOpacity="0.25"
          />
          <rect
            x="15"
            y="0"
            width="3"
            height="12"
            rx="1"
            fill="#0d1117"
            fillOpacity="0.25"
          />
        </svg>
        <span
          className="text-[14px] font-bold"
          style={{ fontFamily: "-apple-system, var(--font-body)" }}
        >
          4G
        </span>
        <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden>
          <rect
            x="0.5"
            y="0.5"
            width="23"
            height="12"
            rx="3.5"
            fill="none"
            stroke="#0d1117"
            strokeOpacity="0.4"
          />
          <rect x="2" y="2" width="8" height="9" rx="2" fill="#0d1117" />
          <path
            d="M25 4.5v4a2 2 0 0 0 0-4z"
            fill="#0d1117"
            fillOpacity="0.45"
          />
        </svg>
      </span>
    </div>
  );
}

/** A fingertip on the glass. Position it with x / y (it is centred on 0,0). */
export function Touch({ className }: { className: string }) {
  return (
    <span
      className={`absolute top-0 left-0 z-40 block rounded-full ${className}`}
      style={{
        width: 46,
        height: 46,
        marginLeft: -23,
        marginTop: -23,
        background: "rgba(68,88,121,0.38)",
        boxShadow:
          "inset 0 0 0 2.5px rgba(255,255,255,0.9), 0 6px 18px rgba(13,17,23,0.28)",
        visibility: "hidden",
      }}
    />
  );
}

/* --------------------------------------------------------------- browser */

/** The desktop page, at its own size: the whole college on one grid. */
export const PAGE = { width: 1284, height: 800 } as const;
const HEAD = 136; // page header, date bar and area line above the grid
const TIME_COL = 64;
const ROOM_W = 100;
const ROW_H = 74;
const HEAD_ROW = 28;
const MARGIN = 10;

const ROOMS = [
  "301",
  "302",
  "303",
  "304",
  "305",
  "401",
  "402",
  "403",
  "Lab 1",
  "Lab 2",
  "Lab 3",
  "Seminar Hall",
];
const TIMES = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
];
const DIVS = [
  "BCA-B",
  "BBA(IT)-A",
  "BCA-C",
  "MSc(CA)-A",
  "BBA(IT)-B",
  "MBA(IT)-A",
  "BCA-B",
  "BBA(IT)-C",
];
const SEMS = ["SEM I", "SEM III", "SEM V", "SEM VII"];
const CODES = [
  "DT (PK)",
  "CC (DF)",
  "DM (DM)",
  "WT (PI)",
  "CS (DF)",
  "BA (PK)",
  "ST (PI)",
  "SE (DM)",
];
const TYPES = [
  "#ffccff",
  "#99cccc",
  "#ff9999",
  "#ffff99",
  "#c0e0ff",
  "#ffcc99",
  "#ccffcc",
];

/** Where BCA-A is today: Lab 2, at two. */
export const TARGET = { col: 9, row: 5 } as const;

/** Centre of a grid cell, in page pixels. */
export function cellCentre(col: number, row: number) {
  return {
    x: MARGIN + TIME_COL + col * ROOM_W + ROOM_W / 2,
    y: HEAD + HEAD_ROW + row * ROW_H + ROW_H / 2,
  };
}

const rand = (a: number, b: number) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** The old site's day view, drawn at desktop size and scaled by the caller. */
export function DesktopPage() {
  const target = cellCentre(TARGET.col, TARGET.row);
  return (
    <div
      className="op-page absolute top-0 left-0 bg-white text-[#000]"
      style={{
        width: PAGE.width,
        height: PAGE.height,
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div
        className="flex h-[56px] items-center justify-between px-5"
        style={{ background: "#2b4a6f", color: "#fff" }}
      >
        <span className="text-[22px] font-bold">SICSR — Timetable</span>
        <span className="flex gap-5 text-[14px] underline opacity-90">
          <span>Day</span>
          <span>Week</span>
          <span>Month</span>
          <span>Search</span>
          <span>Report</span>
          <span>Help</span>
          <span>Log in</span>
        </span>
      </div>
      <div className="flex h-[50px] items-center justify-between px-5 text-[13px]">
        <span className="text-[#1a0dab] underline">&lt;&lt; Previous day</span>
        <span className="text-[19px] font-bold">
          Thursday 24 September 2026
        </span>
        <span className="text-[#1a0dab] underline">Next day &gt;&gt;</span>
      </div>
      <div className="h-[30px] px-5 text-[13px]">
        Area: <span className="text-[#1a0dab] underline">Main Building</span> ·{" "}
        <span className="text-[#1a0dab] underline">Annexe</span>
      </div>

      <div className="absolute" style={{ left: MARGIN, top: HEAD }}>
        {/* Header row */}
        <div className="flex" style={{ height: HEAD_ROW }}>
          <span
            className="shrink-0"
            style={{
              width: TIME_COL,
              background: "#c8d4e3",
              boxShadow: "inset 0 0 0 0.5px #8a9bb0",
            }}
          />
          {ROOMS.map((r) => (
            <span
              key={r}
              className="flex shrink-0 items-center justify-center text-[13px] font-bold"
              style={{
                width: ROOM_W,
                background: "#c8d4e3",
                boxShadow: "inset 0 0 0 0.5px #8a9bb0",
              }}
            >
              {r}
            </span>
          ))}
        </div>
        {TIMES.map((t, row) => (
          <div key={t} className="flex" style={{ height: ROW_H }}>
            <span
              className="flex shrink-0 items-start justify-center pt-1 text-[12px] font-bold"
              style={{
                width: TIME_COL,
                background: "#e4ebf3",
                boxShadow: "inset 0 0 0 0.5px #8a9bb0",
              }}
            >
              {t}
            </span>
            {ROOMS.map((r, col) => {
              const isTarget = col === TARGET.col && row === TARGET.row;
              const booked = isTarget || rand(row, col) < 0.74;
              const i = Math.floor(rand(col + 3, row + 7) * 1000);
              return (
                <span
                  key={r}
                  className="shrink-0 overflow-hidden px-1 pt-0.5 text-[11.5px] leading-[1.25]"
                  style={{
                    width: ROOM_W,
                    background: booked ? TYPES[i % TYPES.length] : "#ffffff",
                    boxShadow: "inset 0 0 0 0.5px #8a9bb0",
                  }}
                >
                  {booked && (
                    <>
                      <span className="block font-bold">
                        {isTarget ? "BCA-A" : DIVS[i % DIVS.length]}{" "}
                        {isTarget ? "SEM V" : SEMS[i % SEMS.length]}
                      </span>
                      <span className="block">
                        {isTarget ? "DM (DM)" : CODES[(i >> 3) % CODES.length]}
                      </span>
                      <span className="block text-[#1a0dab] underline">
                        {r}
                      </span>
                    </>
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {/* Found it: a ring on BCA-A's cell. */}
      <span
        className="op-found absolute rounded-[6px]"
        style={{
          left: target.x - ROOM_W / 2 - 4,
          top: target.y - ROW_H / 2 - 4,
          width: ROOM_W + 8,
          height: ROW_H + 8,
          boxShadow: "0 0 0 4px #ff5d73, 0 0 24px 6px rgba(255,93,115,0.45)",
          visibility: "hidden",
        }}
      />
    </div>
  );
}

/** The browser's viewport, between the status bar and the bottom bar. */
export const VIEWPORT = { top: 54, height: SCREEN_H - 54 - 104 } as const;

/** A phone browser on the old site: loading at first, then the page. */
export function BrowserApp() {
  return (
    <div className="op-browser absolute inset-0 bg-white">
      <div
        className="absolute inset-x-0 overflow-hidden bg-white"
        style={{ top: VIEWPORT.top, height: VIEWPORT.height }}
      >
        <div
          className="op-pagewrap absolute inset-0"
          style={{ visibility: "hidden" }}
        >
          <DesktopPage />
        </div>

        {/* Still loading */}
        <div className="op-loading absolute inset-0 flex flex-col items-center justify-center gap-6 pb-10">
          <svg
            className="op-spinner"
            width="64"
            height="64"
            viewBox="0 0 64 64"
            aria-hidden
          >
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              stroke="rgba(68,88,121,0.14)"
              strokeWidth="6"
            />
            <path
              d="M32 6a26 26 0 0 1 26 26"
              fill="none"
              stroke="#445879"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </svg>
          <span className="text-[17px] text-[rgba(44,49,53,0.6)]">
            Waiting for time-table.sicsr.ac.in…
          </span>
          <span className="font-mono text-[56px] leading-none font-semibold tracking-[-0.03em] text-[#0d1117]">
            <span className="op-counter">0:12</span>
          </span>
          <span className="rounded-full bg-[#eef0f3] px-3 py-1 font-mono text-[13px] text-[rgba(44,49,53,0.66)]">
            on mobile data
          </span>
        </div>
      </div>

      {/* Bottom bar: the address field over the toolbar. */}
      <div
        className="absolute inset-x-0 bottom-0 bg-[#f7f7f8]"
        style={{ height: 104, boxShadow: "inset 0 1px 0 rgba(13,17,23,0.08)" }}
      >
        <div className="relative mx-3 mt-2 flex h-[46px] items-center justify-between overflow-hidden rounded-[14px] bg-white px-3 shadow-[0_1px_4px_rgba(13,17,23,0.12)]">
          <span className="text-[15px] font-semibold text-[#0d1117]">
            a<span className="text-[19px]">A</span>
          </span>
          <span className="flex items-center gap-1.5 text-[15px] text-[#0d1117]">
            <span className="text-[rgba(44,49,53,0.55)]">Not Secure —</span>{" "}
            time-table.sicsr.ac.in
          </span>
          <Icon name="rotate" size={18} stroke={2} color="#0d1117" />
          <span className="op-progress absolute inset-x-0 bottom-0 h-[3px]">
            <span
              className="op-progress-fill absolute inset-y-0 left-0 w-full origin-left bg-[#0a84ff]"
              style={{ transform: "scaleX(0.45)" }}
            />
          </span>
        </div>
        <div className="mt-2 flex justify-around px-4 text-[#0a84ff]">
          <Icon name="chevronLeft" size={24} stroke={2} />
          <Icon
            name="chevronRight"
            size={24}
            stroke={2}
            color="rgba(10,132,255,0.35)"
          />
          <Icon name="upload" size={22} stroke={2} />
          <Icon name="book" size={22} stroke={2} />
          <Icon name="copy" size={22} stroke={2} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ mail */

const MAILS = [
  {
    from: "Academics Office",
    initial: "A",
    colour: "#4c7bd9",
    at: "7:58 AM",
    subject: "Extra lecture today, 4 PM",
    snippet: "BCA-A: Data Mining extra lecture in Lab 2 today at 4 PM…",
    unread: true,
  },
  {
    from: "Prof. Kulkarni",
    initial: "K",
    colour: "#2e9d6f",
    at: "Yesterday",
    subject: "Re: Timetable for next week",
    snippet: "Please check the updated timetable on the site before…",
    unread: false,
  },
  {
    from: "Academics Office",
    initial: "A",
    colour: "#4c7bd9",
    at: "Sep 21",
    subject: "Revised timetable — Semester V",
    snippet: "The timetable has been revised with effect from Monday…",
    unread: false,
  },
  {
    from: "Dr. Mehta",
    initial: "M",
    colour: "#c2742b",
    at: "Sep 18",
    subject: "Data Mining moves to Lab 2",
    snippet: "From Monday our sessions will be held in Lab 2 instead of…",
    unread: false,
  },
] as const;

/** A mail app, searching for "timetable". */
export function MailApp() {
  return (
    <div className="op-mail absolute inset-0 bg-white">
      <div
        className="absolute inset-x-3 flex h-[52px] items-center gap-3 rounded-full bg-[#edf1f8] px-4"
        style={{ top: 62 }}
      >
        <Icon name="menu" size={22} stroke={2} color="#3c4043" />
        <span className="relative flex-1 text-[17px]">
          <span className="op-search-ph absolute inset-0 text-[rgba(60,64,67,0.62)]">
            Search in mail
          </span>
          <span className="op-search text-[#0d1117]" />
          <span className="ml-px inline-block h-[20px] w-[2px] translate-y-[3px] bg-[#0a84ff]" />
        </span>
        <span className="flex h-[32px] w-[32px] items-center justify-center rounded-full bg-[#d1477a] text-[14px] font-bold text-white">
          S
        </span>
      </div>

      <div className="op-results absolute inset-x-0" style={{ top: 130 }}>
        <div className="op-result px-5 pb-2 text-[13px] font-semibold text-[rgba(60,64,67,0.7)]">
          Top results
        </div>
        {MAILS.map((m, i) => (
          <div
            key={i}
            className={`op-result relative flex gap-3 px-4 py-3 ${i === 0 ? "op-hit" : ""}`}
          >
            {i === 0 && (
              <span
                className="op-hit-bg absolute inset-x-2 inset-y-0.5 rounded-[16px]"
                style={{
                  background: "#fff3f5",
                  boxShadow: "inset 0 0 0 2px #ff5d73",
                  visibility: "hidden",
                }}
              />
            )}
            <span
              className="relative flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full text-[17px] font-semibold text-white"
              style={{ background: m.colour }}
            >
              {m.initial}
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span
                  className={`truncate text-[16px] text-[#0d1117] ${m.unread ? "font-bold" : ""}`}
                >
                  {m.from}
                </span>
                <span
                  className={`shrink-0 text-[12.5px] ${m.unread ? "font-bold text-[#0d1117]" : "text-[rgba(60,64,67,0.62)]"}`}
                >
                  {m.at}
                </span>
              </span>
              <span
                className={`block truncate text-[15px] text-[#0d1117] ${m.unread ? "font-bold" : ""}`}
              >
                {m.subject}
              </span>
              <span className="block truncate text-[14px] text-[rgba(60,64,67,0.68)]">
                {m.snippet}
              </span>
            </span>
          </div>
        ))}
      </div>

      <span
        className="absolute flex items-center gap-2 rounded-[18px] px-5 py-4 text-[15px] font-semibold text-[#0d1117]"
        style={{
          right: 16,
          bottom: 48,
          background: "#c2e7ff",
          boxShadow: "0 3px 10px rgba(13,17,23,0.18)",
        }}
      >
        <Icon name="edit" size={20} stroke={2} />
        Compose
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ chat */

const CHAT = [
  {
    who: "Riya",
    colour: "#c93b72",
    text: "idk, the site isn't loading for me",
    at: "8:57",
  },
  {
    who: "Aman",
    colour: "#2a74c4",
    text: "9 is on. extra lecture at 4??",
    at: "8:58",
  },
  { who: "Neha", colour: "#a8641c", text: "check your mail", at: "8:58" },
] as const;

export const ASK = "is there class today??";

/** The class group chat. */
export function ChatApp() {
  return (
    <div className="op-chat absolute inset-0" style={{ background: "#efeae2" }}>
      <div
        className="absolute inset-x-0 top-0 flex items-end gap-3 px-3 pb-2.5"
        style={{
          height: 112,
          background: "#f6f6f6",
          boxShadow: "inset 0 -1px 0 rgba(13,17,23,0.1)",
        }}
      >
        <Icon name="chevronLeft" size={28} stroke={2.2} color="#1f8f6a" />
        <span className="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-[#25a36b] text-white">
          <Icon name="users" size={22} stroke={2} />
        </span>
        <span className="min-w-0 flex-1 pb-0.5">
          <span className="block text-[17px] leading-tight font-semibold text-[#0d1117]">
            BCA-A · Sem V
          </span>
          <span className="block truncate text-[13px] text-[rgba(44,49,53,0.6)]">
            Riya, Aman, Neha, You and 58 others
          </span>
        </span>
      </div>

      <div
        className="absolute inset-x-0 flex flex-col justify-end px-3"
        style={{ top: 112, bottom: 96, paddingBottom: 10 }}
      >
        <DayChip>Yesterday</DayChip>
        <Bubble
          className="mt-1.5"
          who="Neha"
          colour="#a8641c"
          text="anyone has the DM notes from today?"
          at="18:12"
        />
        <Bubble
          className="mt-1.5"
          mine
          text="uploaded on the drive"
          at="18:40"
        />
        <Bubble
          className="mt-1.5"
          who="Riya"
          colour="#c93b72"
          text="thank youu"
          at="18:41"
        />
        <DayChip>Today</DayChip>
        <Bubble className="op-msg mt-1.5" mine text={ASK} at="8:57" />
        {CHAT.map((m, i) => (
          <Bubble
            key={i}
            className="op-msg mt-1.5"
            who={m.who}
            colour={m.colour}
            text={m.text}
            at={m.at}
          />
        ))}
      </div>

      <div
        className="absolute inset-x-0 bottom-0 flex items-start gap-3 px-3 pt-2.5"
        style={{ height: 96, background: "#f6f6f6" }}
      >
        <Icon name="plus" size={28} stroke={2} color="#1f8f6a" />
        <span className="flex h-[38px] flex-1 items-center rounded-full bg-white px-4 text-[16px] shadow-[inset_0_0_0_1px_rgba(13,17,23,0.1)]">
          <span className="op-type text-[#0d1117]" />
        </span>
        <Icon name="mic" size={26} stroke={2} color="#1f8f6a" />
      </div>
    </div>
  );
}

function DayChip({ children }: { children: string }) {
  return (
    <span className="mx-auto mt-3 mb-1 rounded-lg bg-white/80 px-3 py-1 text-[12.5px] font-semibold text-[rgba(44,49,53,0.66)]">
      {children}
    </span>
  );
}

function Bubble({
  mine,
  who,
  colour,
  text,
  at,
  className = "",
}: {
  mine?: boolean;
  who?: string;
  colour?: string;
  text: string;
  at: string;
  className?: string;
}) {
  return (
    <div
      className={`flex overflow-hidden pb-px ${mine ? "justify-end" : "justify-start"} ${className}`}
    >
      <div
        className="max-w-[290px] rounded-[14px] px-2.5 pt-1.5 pb-1.5 text-[16.5px] leading-snug text-[#0d1117]"
        style={{
          background: mine ? "#d9fdd3" : "#ffffff",
          boxShadow: "0 1px 1px rgba(13,17,23,0.12)",
          borderTopRightRadius: mine ? 4 : 14,
          borderTopLeftRadius: mine ? 14 : 4,
        }}
      >
        {who && (
          <span
            className="block text-[13.5px] font-semibold"
            style={{ color: colour }}
          >
            {who}
          </span>
        )}
        <span>{text}</span>
        <span className="float-right mt-1.5 ml-2.5 flex items-center gap-0.5 text-[11px] text-[rgba(44,49,53,0.5)]">
          {at}
          {mine && <Icon name="check" size={14} stroke={2.4} color="#53bdeb" />}
        </span>
      </div>
    </div>
  );
}
