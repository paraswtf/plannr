"use client";

import { useRef, type ReactNode } from "react";

import { useSteps } from "~/deck/useSteps";
import { Icon, type IconName } from "~/ui/icon";
import { Ph } from "~/ui/placeholder";

import {
  AdminBar,
  APP_BAR,
  CARD_SHADOW,
  PAD,
  PAGE,
  Stage,
  useIntro,
  usePulse,
} from "./_stage";

export interface AdminDashboardProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between feature slides. */
  flipId?: string;
}

/* ── Layout, in page coordinates (the window's page is 930 × 608) ───────── */

const TOP = APP_BAR + PAD;
const INNER_W = PAGE.w - PAD * 2;
const GAP = 14;
const TILE = { h: 104, w: (INNER_W - GAP * 3) / 4 } as const;
const ROW2 = {
  y: TOP + TILE.h + GAP,
  h: PAGE.h - PAD - (TOP + TILE.h + GAP),
} as const;
/** The chart owns the row on arrival, then makes room for the feed. */
const CHART_W = { full: INNER_W, narrow: 466 } as const;
const SIDE = {
  x: PAD + CHART_W.narrow + GAP,
  w: INNER_W - CHART_W.narrow - GAP,
} as const;
const FEED_HEAD = 50;
const ITEM_H = 60;
/** The feed is the whole side column, then keeps its three newest rows and gives the rest to health. */
const FEED_H = { full: ROW2.h, short: FEED_HEAD + 2 + ITEM_H * 3 } as const;
const HEALTH = {
  y: ROW2.y + FEED_H.short + 12,
  h: ROW2.h - FEED_H.short - 12,
} as const;

/* ── Data ───────────────────────────────────────────────────────────────── */

interface Stat {
  key: string;
  label: string;
  icon: IconName;
  value: number;
}

const STATS: Stat[] = [
  { key: "students", label: "Students", icon: "users", value: 643 },
  { key: "faculty", label: "Faculty", icon: "cap", value: 58 },
  { key: "rooms", label: "Rooms", icon: "door", value: 48 },
  { key: "classes", label: "Classes this week", icon: "calendar", value: 1190 },
];

/** Share of room-hours booked, by weekday. */
const USE = [
  { day: "Mon", pct: 82 },
  { day: "Tue", pct: 91 },
  { day: "Wed", pct: 76 },
  { day: "Thu", pct: 88 },
  { day: "Fri", pct: 64 },
  { day: "Sat", pct: 38 },
];
const PEAK = Math.max(...USE.map((u) => u.pct));

interface FeedItem {
  key: string;
  who: string;
  /** Initials in a coloured disc, or an icon for the system. */
  initials?: string;
  icon?: IconName;
  color: string;
  text: ReactNode;
  meta: string;
}

/** On screen when the feed arrives, newest first. */
const OLD: FeedItem[] = [
  {
    key: "o1",
    who: "Dr. Mehta",
    initials: "M",
    color: "#c9306c",
    text: (
      <>
        <b>Dr. Mehta</b> requested a room change
      </>
    ),
    meta: "Requests · 12 min ago",
  },
  {
    key: "o2",
    who: "System",
    icon: "refresh",
    color: "#4e7d3a",
    text: (
      <>
        <b>Calendar sync</b> finished for every student
      </>
    ),
    meta: "System · 20 min ago",
  },
  {
    key: "o3",
    who: "Prof. Kulkarni",
    initials: "K",
    color: "#29abb7",
    text: (
      <>
        <b>Prof. Kulkarni</b> cancelled Web Technologies
      </>
    ),
    meta: "Timetable · 34 min ago",
  },
];

/** Streamed in on build 1, in this order: each lands on top. */
const NEW: FeedItem[] = [
  {
    key: "n1",
    who: "Prof. Iyer",
    initials: "I",
    color: "#f2743c",
    text: (
      <>
        <b>Prof. Iyer</b> approved the Lab 2 swap
      </>
    ),
    meta: "Approvals · 3 min ago",
  },
  {
    key: "n2",
    who: "Bulk import",
    icon: "upload",
    color: "#445879",
    text: (
      <>
        <b>Bulk import:</b> 120 rows
      </>
    ),
    meta: "Paras · 1 min ago",
  },
  {
    key: "n3",
    who: "Tanisha",
    initials: "T",
    color: "#7a2e8f",
    text: (
      <>
        <b>Tanisha</b> moved Cloud Computing to 304
      </>
    ),
    meta: "Timetable · just now",
  },
];

const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");

/**
 * The admin's console, built from scratch: the state of the whole timetable
 * at a glance.
 *
 * Builds (steps = 3):
 *   0 — stat tiles count up (students, faculty, rooms, classes this week) and a chart draws itself.
 *   1 — a live feed of changes, approvals and imports streams in.
 *   2 — a health panel: sync status, data warnings to fix.
 *
 * The browser window carries `flipId`, at the same size and place as
 * BulkImport's, so it holds still between the two.
 */
export function AdminDashboard({ step, active, flipId }: AdminDashboardProps) {
  const ref = useRef<HTMLDivElement>(null);

  usePulse(ref, active, ".live-halo");

  // On arrival: the numbers count up and the chart draws, bar by bar.
  useIntro(ref, step, active, (tl) => {
    const root = ref.current;
    if (!root) return;
    STATS.forEach((s, i) => {
      const el = root.querySelector<HTMLElement>(`.num-${s.key}`);
      if (!el) return;
      // The tiles are already there as the window arrives; only the numbers start at zero.
      el.textContent = "0";
      const n = { v: 0 };
      tl.to(
        n,
        {
          v: s.value,
          duration: 1.1,
          ease: "power3.out",
          onUpdate: () => {
            el.textContent = fmt(n.v);
          },
        },
        i * 0.06,
      );
    });
    USE.forEach((u, i) => {
      const at = 0.15 + i * 0.07;
      const rise = (u.pct / 100) * PLOT_H;
      tl.from(
        `.bar-${i}`,
        {
          scaleY: 0,
          transformOrigin: "50% 100%",
          duration: 0.8,
          ease: "power3.out",
        },
        at,
      );
      tl.from(
        `.val-${i}`,
        { y: rise, opacity: 0, duration: 0.8, ease: "power3.out" },
        at,
      );
      const el = root.querySelector<HTMLElement>(`.val-${i} .v`);
      if (el) {
        const n = { v: 0 };
        tl.to(
          n,
          {
            v: u.pct,
            duration: 0.8,
            ease: "power3.out",
            onUpdate: () => (el.textContent = `${Math.round(n.v)}%`),
          },
          at,
        );
      }
    });
  });

  useSteps(ref, step, (tl, mark) => {
    // ── Build 1: the chart makes room, the feed slides in, and news streams in on top.
    tl.to(".chart-card", {
      width: CHART_W.narrow,
      duration: 0.8,
      ease: "power3.inOut",
    });
    tl.fromTo(
      ".feed-card",
      { x: SIDE.w + 60 },
      { x: 0, duration: 0.8, ease: "power3.inOut" },
      "<",
    );
    const t0 = 0.75;
    NEW.forEach((item, k) => {
      const at = t0 + k * 0.55;
      // Everything already in the list moves down one place…
      const below = [...NEW.slice(0, k).reverse(), ...OLD];
      below.forEach((b, j) => {
        tl.to(
          `.fi-${b.key}`,
          { y: (j + 1) * ITEM_H, duration: 0.45, ease: "power2.inOut" },
          at,
        );
      });
      // …and the new one drops in at the top, lit for a moment.
      tl.fromTo(
        `.fi-${item.key}`,
        { y: -ITEM_H, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.45,
          ease: "power3.out",
          immediateRender: false,
        },
        at + 0.06,
      );
      tl.fromTo(
        `.fi-${item.key} .flash`,
        { opacity: 1 },
        {
          opacity: 0,
          duration: 0.9,
          ease: "power1.in",
          immediateRender: false,
        },
        at + 0.25,
      );
    });
    mark();

    // ── Build 2: the feed shortens and the health panel rises into the space.
    tl.to(".feed-card", {
      height: FEED_H.short,
      duration: 0.7,
      ease: "power3.inOut",
    });
    tl.fromTo(
      ".health-card",
      { y: HEALTH.h + 40 },
      { y: 0, duration: 0.75, ease: "power3.inOut" },
      "<0.05",
    );
    tl.fromTo(
      ".hl-ok",
      { scale: 0 },
      { scale: 1, duration: 0.4, ease: "back.out(2.4)" },
      ">-0.1",
    );
    tl.fromTo(
      ".hl-warn-tint",
      { scaleX: 0 },
      {
        scaleX: 1,
        transformOrigin: "0% 50%",
        duration: 0.55,
        ease: "power3.out",
      },
      ">0.05",
    );
    tl.fromTo(
      ".hl-fix",
      { scale: 0.6, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.2)" },
      "<0.25",
    );
    tl.fromTo(
      ".rooms-flag",
      { scale: 0, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.4)" },
      "<0.1",
    );
    mark();
  });

  return (
    <Stage stageRef={ref} flipId={flipId}>
      <AdminBar
        title="Console"
        right={
          <span className="flex items-center gap-2 font-mono text-[13.5px] font-semibold text-[#3d6b2c]">
            <span className="relative flex h-2.5 w-2.5">
              <span className="live-halo absolute inset-0 rounded-full bg-[#4e9a3a]" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-[#4e9a3a]" />
            </span>
            Live
          </span>
        }
      />

      {/* Stat tiles */}
      {STATS.map((s, i) => (
        <div
          key={s.key}
          className="tile absolute rounded-[14px] bg-white"
          style={{
            left: PAD + i * (TILE.w + GAP),
            top: TOP,
            width: TILE.w,
            height: TILE.h,
            boxShadow: CARD_SHADOW,
          }}
        >
          <div className="absolute top-4 left-4 flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-[9px]"
              style={{
                background: "rgba(68,88,121,0.1)",
                color: "var(--slate)",
              }}
            >
              <Icon name={s.icon} size={18} stroke={2} />
            </span>
            <span className="text-[15px] font-semibold text-[rgba(44,49,53,0.7)]">
              {s.label}
            </span>
          </div>
          <div className="absolute bottom-3 left-4 font-mono text-[40px] leading-none font-bold tracking-[-0.04em] text-[#0d1117]">
            <Ph>
              <span className={`num-${s.key}`}>{fmt(s.value)}</span>
            </Ph>
          </div>
          {s.key === "rooms" && (
            <span
              className="rooms-flag absolute right-3 bottom-4 flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[12.5px] font-semibold"
              style={{
                background: "rgba(246,167,59,0.18)",
                color: "#9a5a00",
                opacity: 0,
              }}
            >
              <Icon name="alert" size={13} stroke={2.4} />3 to fix
            </span>
          )}
        </div>
      ))}

      <ChartCard />
      <FeedCard />
      <HealthCard />
    </Stage>
  );
}

/* ── Chart ──────────────────────────────────────────────────────────────── */

const CHART_HEAD = 98;
const AXIS_W = 44;
const X_LABELS = 34;
const PLOT_H = ROW2.h - CHART_HEAD - X_LABELS - 12;

function ChartCard() {
  return (
    <div
      className="chart-card absolute overflow-hidden rounded-[14px] bg-white"
      style={{
        left: PAD,
        top: ROW2.y,
        width: CHART_W.full,
        height: ROW2.h,
        boxShadow: CARD_SHADOW,
      }}
    >
      <div className="absolute top-4 left-5">
        <div className="text-[17px] font-semibold text-[#0d1117]">
          Room use by weekday
        </div>
        <div className="mt-1 font-mono text-[12.5px] text-[rgba(44,49,53,0.55)]">
          % of room-hours booked · this week
        </div>
      </div>

      {/* Plot */}
      <div
        className="absolute"
        style={{ left: 20, right: 20, top: CHART_HEAD, height: PLOT_H }}
      >
        {[0, 50, 100].map((g) => (
          <div
            key={g}
            className="absolute inset-x-0"
            style={{ bottom: `${g}%`, height: 0 }}
          >
            <span
              className="absolute -translate-y-1/2 font-mono text-[12px] text-[rgba(44,49,53,0.45)]"
              style={{ left: 0, width: AXIS_W - 10, textAlign: "right" }}
            >
              {g}%
            </span>
            <div
              className="absolute right-0"
              style={{
                left: AXIS_W,
                top: 0,
                height: 1,
                background: g === 0 ? "rgba(68,88,121,0.28)" : "var(--hair)",
              }}
            />
          </div>
        ))}
        <div
          className="absolute inset-y-0 right-0 flex"
          style={{ left: AXIS_W }}
        >
          {USE.map((u, i) => (
            <div key={u.day} className="relative h-full flex-1">
              <div
                className={`bar-${i} absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-lg`}
                style={{
                  width: "46%",
                  maxWidth: 64,
                  height: `${u.pct}%`,
                  background: u.pct === PEAK ? "var(--slate)" : "#a9b6cb",
                }}
              />
              <div
                className={`val-${i} absolute inset-x-0 flex justify-center font-mono text-[13.5px] font-semibold`}
                style={{
                  bottom: `calc(${u.pct}% + 6px)`,
                  color: u.pct === PEAK ? "var(--slate)" : "rgba(44,49,53,0.6)",
                }}
              >
                <span className="v rounded bg-white px-1">{u.pct}%</span>
              </div>
              <div
                className="absolute inset-x-0 text-center text-[14px] font-semibold text-[rgba(44,49,53,0.62)]"
                style={{ top: PLOT_H + 10 }}
              >
                {u.day}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Feed ───────────────────────────────────────────────────────────────── */

function FeedRow({
  item,
  slot,
  hidden,
}: {
  item: FeedItem;
  slot: number;
  hidden?: boolean;
}) {
  return (
    <div
      className={`fi-${item.key} absolute inset-x-0 top-0`}
      style={{
        height: ITEM_H,
        transform: `translateY(${slot * ITEM_H}px)`,
        opacity: hidden ? 0 : 1,
      }}
    >
      <div
        className="flash absolute inset-x-2 inset-y-1 rounded-[10px]"
        style={{ background: "rgba(68,88,121,0.1)", opacity: 0 }}
      />
      <div className="relative flex h-full items-center gap-3 px-4">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[16px] font-bold text-white"
          style={{ background: item.color }}
          aria-label={item.who}
        >
          {item.icon ? (
            <Icon name={item.icon} size={19} stroke={2.2} />
          ) : (
            item.initials
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[18px] leading-tight tracking-[-0.01em] text-[rgba(44,49,53,0.9)] [&_b]:font-semibold [&_b]:text-[#0d1117]">
            {item.text}
          </span>
          <span className="mt-1 block truncate font-mono text-[14px] text-[rgba(44,49,53,0.55)]">
            {item.meta}
          </span>
        </span>
      </div>
    </div>
  );
}

function FeedCard() {
  return (
    <div
      className="feed-card absolute overflow-hidden rounded-[14px] bg-white"
      style={{
        left: SIDE.x,
        top: ROW2.y,
        width: SIDE.w,
        height: FEED_H.full,
        boxShadow: CARD_SHADOW,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between px-4"
        style={{ height: FEED_HEAD, boxShadow: "inset 0 -1px 0 var(--hair)" }}
      >
        <span className="text-[19px] font-semibold text-[#0d1117]">
          Activity
        </span>
        <span className="font-mono text-[14px] text-[rgba(44,49,53,0.55)]">
          live
        </span>
      </div>
      <div
        className="absolute inset-x-0 bottom-0 overflow-hidden"
        style={{ top: FEED_HEAD + 2 }}
      >
        {OLD.map((item, j) => (
          <FeedRow key={item.key} item={item} slot={j} />
        ))}
        {NEW.map((item) => (
          <FeedRow key={item.key} item={item} slot={-1} hidden />
        ))}
      </div>
    </div>
  );
}

/* ── Health ─────────────────────────────────────────────────────────────── */

function HealthCard() {
  return (
    <div
      className="health-card absolute overflow-hidden rounded-[14px] bg-white"
      style={{
        left: SIDE.x,
        top: HEALTH.y,
        width: SIDE.w,
        height: HEALTH.h,
        boxShadow: CARD_SHADOW,
      }}
    >
      <div
        className="flex items-center justify-between px-4"
        style={{ height: 42 }}
      >
        <span className="text-[19px] font-semibold text-[#0d1117]">Health</span>
        <span className="font-mono text-[14px] text-[rgba(44,49,53,0.55)]">
          checked 1 min ago
        </span>
      </div>
      <div className="flex items-center gap-3 px-4" style={{ height: 46 }}>
        <span className="hl-ok flex h-8 w-8 items-center justify-center rounded-full bg-[#4e7d3a] text-white">
          <Icon name="check" size={18} stroke={2.8} />
        </span>
        <span className="flex-1 text-[18px] font-semibold text-[#0d1117]">
          Calendar sync
        </span>
        <span
          className="rounded-full px-3 py-0.5 font-mono text-[15px] font-semibold"
          style={{ background: "rgba(78,125,58,0.14)", color: "#2f5f1f" }}
        >
          OK
        </span>
      </div>
      <div
        className="relative mx-2 flex items-center gap-3 px-2"
        style={{ height: 50 }}
      >
        <div
          className="hl-warn-tint absolute inset-0 rounded-[10px]"
          style={{
            background: "rgba(246,167,59,0.16)",
            boxShadow: "inset 0 0 0 1px rgba(217,148,37,0.55)",
          }}
        />
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[#f6a73b] text-[#0d1117]">
          <Icon name="alert" size={18} stroke={2.4} />
        </span>
        <span className="relative flex-1 text-[18px] font-semibold text-[#0d1117]">
          3 rooms missing capacity
        </span>
        <span className="hl-fix relative rounded-lg bg-[#445879] px-3.5 py-1 text-[15px] font-semibold text-white">
          Fix
        </span>
      </div>
    </div>
  );
}
