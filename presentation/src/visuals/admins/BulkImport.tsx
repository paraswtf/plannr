"use client";

import { useRef, type ReactNode } from "react";

import { useSteps } from "~/deck/useSteps";
import { Icon } from "~/ui/icon";
import { Ph } from "~/ui/placeholder";

import {
  AdminBar,
  APP_BAR,
  CARD_SHADOW,
  Cursor,
  PAD,
  PAGE,
  Stage,
  useIntro,
} from "./_stage";

export interface BulkImportProps {
  step: number;
  active: boolean;
  /** Put on the device frame, so it can travel between feature slides. */
  flipId?: string;
}

/* ── Layout. Page coordinates unless named "box" (the 960 × 844 visual) ─── */

const TOP = APP_BAR + PAD;
const INNER_W = PAGE.w - PAD * 2;
/** The drop zone fills the page, then folds into a 64px bar for the file. */
const ZONE = { x: PAD, y: TOP, w: INNER_W, h: PAGE.h - PAD - TOP } as const;
const BAR_H = 64;
/** Room under the table for the "Applied" toast, so it never covers a row. */
const TOAST_ROOM = 54;
const TABLE = {
  y: TOP + BAR_H + 12,
  h: PAGE.h - PAD - TOAST_ROOM - (TOP + BAR_H + 12),
} as const;
const HEAD_H = 42;
const ROW_H = 44;
/** The diff's own column, opened on the left in build 1. */
const GUTTER = 30;

/** The file icon at rest, and its sizes. */
const FILE = { w: 64, h: 80 } as const;
/** Box: where the file sits on the "desktop", under the window (its name is to its left). */
const START = { x: 830, y: 758 } as const;
/** Box: where it is let go, over the middle of the drop zone. */
const DROP = {
  x: PAGE.x + ZONE.x + ZONE.w / 2 - FILE.w / 2,
  y: PAGE.y + ZONE.y + 150,
} as const;
/** Box: the icon slot at the left of the folded bar, at half size. */
const SLOT = {
  x: PAGE.x + ZONE.x + 16,
  y: PAGE.y + ZONE.y + (BAR_H - FILE.h / 2) / 2,
  k: 0.5,
} as const;
/** Where the pointer's tip holds the file. */
const GRIP = { x: 40, y: 50 } as const;

/** Page: the Apply button's centre, and where the pointer comes from. */
const APPLY = { w: 86, h: 34 } as const;
const APPLY_AT = {
  x: ZONE.x + ZONE.w - 14 - APPLY.w / 2,
  y: ZONE.y + BAR_H / 2,
} as const;
const CURSOR_FROM = { x: 640, y: 470 } as const;

const FILE_NAME = "students-monsoon-26.csv";

/* ── Data ───────────────────────────────────────────────────────────────── */

type Status = "same" | "added" | "changed" | "removed";
type Col = "name" | "prn" | "email" | "group";

interface Row {
  id: string;
  status: Status;
  name: string;
  prn: string;
  email: string;
  group: string;
  /** For a changed row: the column that changed and what it was. */
  was?: { col: Col; value: string };
}

const ROWS: Row[] = [
  {
    id: "r1",
    status: "same",
    name: "Aarav Kulkarni",
    prn: "25030142001",
    email: "aarav.kulkarni@sicsr.ac.in",
    group: "BCA-A",
  },
  {
    id: "r2",
    status: "changed",
    name: "Diya Menon",
    prn: "25030142014",
    email: "diya.menon@sicsr.ac.in",
    group: "BCA-B",
    was: { col: "group", value: "BCA-A" },
  },
  {
    id: "r3",
    status: "removed",
    name: "Rohan Patil",
    prn: "25030143027",
    email: "rohan.patil@sicsr.ac.in",
    group: "BBA(IT)-A",
  },
  {
    id: "r4",
    status: "added",
    name: "Ishaan Nair",
    prn: "26030142031",
    email: "ishaan.nair@sicsr.ac.in",
    group: "BCA-A",
  },
  {
    id: "r5",
    status: "same",
    name: "Meera Joshi",
    prn: "25030142022",
    email: "meera.joshi@sicsr.ac.in",
    group: "BCA-B",
  },
  {
    id: "r6",
    status: "added",
    name: "Kabir Shah",
    prn: "26030143008",
    email: "kabir.shah@sicsr.ac.in",
    group: "BBA(IT)-A",
  },
  {
    id: "r7",
    status: "changed",
    name: "Ananya Rao",
    prn: "25030143016",
    email: "ananya.rao@sicsr.ac.in",
    group: "BBA(IT)-A",
    was: { col: "group", value: "BCA-B" },
  },
  {
    id: "r8",
    status: "added",
    name: "Zoya Khan",
    prn: "26030142040",
    email: "zoya.khan@sicsr.ac.in",
    group: "BCA-B",
  },
  {
    id: "r9",
    status: "same",
    name: "Vihaan Desai",
    prn: "25030143005",
    email: "vihaan.desai@sicsr.ac.in",
    group: "BBA(IT)-A",
  },
  {
    id: "r10",
    status: "same",
    name: "Sana Iyer",
    prn: "25030142033",
    email: "sana.iyer@sicsr.ac.in",
    group: "BCA-B",
  },
];

const COLS: { key: Col; label: string; w: number; mono?: boolean }[] = [
  { key: "name", label: "Name", w: 200 },
  { key: "prn", label: "PRN", w: 150, mono: true },
  { key: "email", label: "Email", w: 290, mono: true },
  { key: "group", label: "Group", w: 190 },
];

const TONE: Record<
  Exclude<Status, "same">,
  { tint: string; ink: string; mark: string }
> = {
  added: { tint: "rgba(78,125,58,0.13)", ink: "#2f5f1f", mark: "+" },
  changed: { tint: "rgba(246,167,59,0.17)", ink: "#9a5a00", mark: "~" },
  removed: { tint: "rgba(220,56,72,0.11)", ink: "#a3202e", mark: "−" },
};

/**
 * A term's worth of students in one import, instead of one record at a time.
 *
 * Builds (steps = 3):
 *   0 — a CSV of students dropped in; rows parse.
 *   1 — a preview of the difference: students added, moved to another group
 *       (old value shown) and removed.
 *   2 — apply: one click, and the table updates. (No undo: not built.)
 *
 * The browser window carries `flipId`, at the same size and place as
 * PlannerGenerate's, so it holds still between the two.
 */
export function BulkImport({ step, active, flipId }: BulkImportProps) {
  const ref = useRef<HTMLDivElement>(null);

  // On arrival: the file is picked up off the desktop, carried into the
  // window and let go; the zone folds into a bar and the rows are read in.
  useIntro(ref, step, active, (tl) => {
    const root = ref.current;
    if (!root) return;
    const drag = { x: DROP.x - START.x, y: DROP.y - START.y };
    // The start, drawn at once (the timeline waits for the morph first).
    const now = { immediateRender: true };
    tl.set(
      ".zone",
      { height: ZONE.h, backgroundColor: "rgba(68,88,121,0.04)", ...now },
      0,
    );
    tl.set(".zone-dash, .zone-idle", { opacity: 1, ...now }, 0);
    tl.set(".zone-ring, .zone-folded", { opacity: 0, ...now }, 0);
    tl.set(".table-card", { opacity: 0, y: 24, ...now }, 0);
    tl.fromTo(
      ".cur-a",
      { x: GRIP.x + 70, y: GRIP.y + 60, opacity: 0 },
      { x: GRIP.x, y: GRIP.y, opacity: 1, duration: 0.45, ease: "power2.out" },
    );
    // Press, and the file lifts.
    tl.to(".cur-a .cur-svg", {
      scale: 0.84,
      duration: 0.1,
      ease: "power2.out",
    });
    tl.to(
      ".file-art",
      {
        scale: 1.08,
        boxShadow: "0 24px 44px -10px rgba(16,24,40,0.34)",
        duration: 0.2,
        ease: "power2.out",
      },
      "<",
    );
    tl.to(".file-name", { opacity: 0, x: 8, duration: 0.2 }, "<");
    // The carry: file and pointer travel together, on a curve, into the window.
    tl.to(".drag", {
      motionPath: {
        path: [{ x: drag.x * 0.45, y: drag.y * 0.55 - 60 }, drag],
        curviness: 1.1,
      },
      duration: 1.05,
      ease: "deck.morph",
    });
    // The zone wakes up as the file crosses into it.
    tl.to(".zone-live", { opacity: 1, duration: 0.3 }, "<0.55");
    tl.to(".zone-idle", { opacity: 0, duration: 0.2 }, "<");
    // Let go.
    tl.to(".cur-a .cur-svg", { scale: 1, duration: 0.15 });
    tl.to(
      ".file-art",
      {
        scale: 1,
        boxShadow: "0 10px 22px -8px rgba(16,24,40,0.26)",
        duration: 0.2,
      },
      "<",
    );
    tl.to(
      ".cur-a",
      {
        opacity: 0,
        x: GRIP.x + 40,
        y: GRIP.y + 50,
        duration: 0.35,
        ease: "power2.in",
      },
      "<0.05",
    );
    // The zone folds up into the file's bar, and the file flies to its slot.
    tl.addLabel("fold", ">-0.15");
    tl.to(
      ".zone",
      {
        height: BAR_H,
        backgroundColor: "#ffffff",
        duration: 0.7,
        ease: "deck.morph",
      },
      "fold",
    );
    // The lit zone (which already hides the dashes) fades into the plain bar.
    tl.set(".zone-dash, .zone-idle", { opacity: 0 }, "fold");
    tl.set(".zone-ring", { opacity: 1 }, "fold");
    tl.to(
      ".zone-live",
      { opacity: 0, duration: 0.5, ease: "power2.out" },
      "fold+=0.15",
    );
    tl.to(
      ".file",
      {
        x: SLOT.x - DROP.x,
        y: SLOT.y - DROP.y,
        scale: SLOT.k,
        transformOrigin: "0 0",
        duration: 0.7,
        ease: "deck.morph",
      },
      "fold",
    );
    tl.to(
      ".file-art",
      { boxShadow: "0 0 0 0 rgba(16,24,40,0)", duration: 0.5 },
      "fold+=0.2",
    );
    tl.to(".zone-folded", { opacity: 1, duration: 0.35 }, "fold+=0.45");
    // The rows are read in, top to bottom, and the count runs up.
    tl.to(
      ".table-card",
      { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" },
      "fold+=0.4",
    );
    tl.from(
      ".read-row",
      { opacity: 0, x: -14, duration: 0.3, ease: "power2.out", stagger: 0.05 },
      "fold+=0.6",
    );
    const count = root.querySelector<HTMLElement>(".row-count");
    if (count) {
      const n = { v: 0 };
      tl.to(
        n,
        {
          v: 412,
          duration: 0.7,
          ease: "power1.out",
          onUpdate: () => (count.textContent = String(Math.round(n.v))),
        },
        "fold+=0.6",
      );
    }
  });

  useSteps(ref, step, (tl, mark) => {
    // ── Build 1: the diff. A column opens for the marks, the removed row
    // slides back in, every touched row is tinted, the bar shows the totals.
    tl.to(".cells", { x: GUTTER, duration: 0.5, ease: "deck.morph" });
    tl.to(
      ".row-r3",
      { height: ROW_H, duration: 0.5, ease: "deck.morph" },
      "<0.1",
    );
    tl.fromTo(
      ".row-mark",
      { scale: 0, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.35,
        ease: "back.out(2.4)",
        stagger: 0.05,
      },
      "<0.25",
    );
    tl.fromTo(
      ".row-tint",
      { scaleX: 0 },
      {
        scaleX: 1,
        transformOrigin: "0% 50%",
        duration: 0.5,
        ease: "power3.out",
        stagger: 0.05,
      },
      "<",
    );
    tl.fromTo(
      ".was",
      { width: 0 },
      { width: "auto", duration: 0.5, ease: "power3.out" },
      "<0.05",
    );
    tl.fromTo(".chg-hl", { opacity: 0 }, { opacity: 1, duration: 0.3 }, "<");
    tl.to(
      ".r-matched",
      { y: -BAR_H, opacity: 0, duration: 0.45, ease: "power3.in" },
      "<-0.2",
    );
    tl.fromTo(
      ".r-diff",
      { y: BAR_H, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" },
      ">-0.1",
    );
    tl.fromTo(
      ".chip",
      { scale: 0.7, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.35,
        ease: "back.out(2)",
        stagger: 0.08,
      },
      "<0.1",
    );
    mark();

    // ── Build 2: apply. Click; the bar fills; the table settles to the new data.
    tl.fromTo(
      ".cur-b",
      { x: CURSOR_FROM.x, y: CURSOR_FROM.y, opacity: 0 },
      { opacity: 1, duration: 0.2 },
    );
    tl.to(
      ".cur-b",
      {
        x: APPLY_AT.x - 6,
        y: APPLY_AT.y - 4,
        duration: 0.7,
        ease: "deck.morph",
      },
      "<",
    );
    tl.to(".cur-b .cur-svg", {
      scale: 0.84,
      duration: 0.1,
      ease: "power2.out",
    });
    tl.to(".apply-btn", { scale: 0.94, duration: 0.1 }, "<");
    tl.to(".cur-b .cur-svg", { scale: 1, duration: 0.15 });
    tl.to(".apply-btn", { scale: 1, duration: 0.15 }, "<");
    tl.fromTo(
      ".progress",
      { scaleX: 0 },
      {
        scaleX: 1,
        transformOrigin: "0% 50%",
        duration: 0.8,
        ease: "power2.out",
      },
      "<",
    );
    tl.to(
      ".cur-b",
      {
        opacity: 0,
        x: APPLY_AT.x + 30,
        y: APPLY_AT.y + 60,
        duration: 0.4,
        ease: "power2.in",
      },
      "<0.2",
    );
    tl.addLabel("settle", ">");
    tl.to(
      ".row-r3",
      { height: 0, duration: 0.5, ease: "deck.morph" },
      "settle",
    );
    tl.to(".row-tint", { opacity: 0, duration: 0.5 }, "settle");
    tl.to(".chg-hl", { opacity: 0, duration: 0.4 }, "settle");
    tl.to(".was", { width: 0, duration: 0.5, ease: "deck.morph" }, "settle");
    tl.to(".row-mark", { opacity: 0, scale: 0.4, duration: 0.3 }, "settle");
    tl.to(".cells", { x: 0, duration: 0.5, ease: "deck.morph" }, "settle+=0.1");
    tl.to(".progress", { opacity: 0, duration: 0.3 }, "settle+=0.1");
    tl.to(
      ".r-diff",
      { y: -BAR_H, opacity: 0, duration: 0.4, ease: "power3.in" },
      "settle",
    );
    tl.fromTo(
      ".r-done",
      { y: BAR_H, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" },
      "settle+=0.3",
    );
    // What changed glows green for a moment, so the settle reads as "updated".
    tl.fromTo(
      ".row-flash",
      { opacity: 0.28 },
      { opacity: 0, duration: 0.9, ease: "power1.in", immediateRender: false },
      "settle+=0.35",
    );
    tl.fromTo(
      ".toast",
      { y: 90 },
      { y: 0, duration: 0.55, ease: "back.out(1.4)" },
      "settle+=0.35",
    );
    mark();
  });

  return (
    <Stage stageRef={ref} flipId={flipId} overlay={<DraggedFile />}>
      <AdminBar title="Import people" />

      {/* The drop zone, which folds into the file's bar */}
      <div
        className="zone absolute overflow-hidden rounded-[14px]"
        style={{
          left: ZONE.x,
          top: ZONE.y,
          width: ZONE.w,
          height: BAR_H,
          background: "#ffffff",
        }}
      >
        <svg
          className="zone-dash absolute inset-0 h-full w-full"
          style={{ opacity: 0 }}
          aria-hidden
        >
          <rect
            x="1"
            y="1"
            width="calc(100% - 2px)"
            height="calc(100% - 2px)"
            rx="13"
            fill="none"
            stroke="#9facc2"
            strokeWidth="2"
            strokeDasharray="9 7"
          />
        </svg>
        <div
          className="zone-ring pointer-events-none absolute inset-0 rounded-[14px]"
          style={{ boxShadow: CARD_SHADOW }}
        />
        <div
          className="zone-idle absolute inset-x-0 flex flex-col items-center text-center"
          style={{ top: 230, opacity: 0 }}
        >
          <span className="text-[24px] font-semibold text-[#0d1117]">
            Drop a list of students here
          </span>
          <span className="mt-2 font-mono text-[16px] text-[rgba(44,49,53,0.55)]">
            .csv with a name, PRN, email and group
          </span>
        </div>
        <div
          className="zone-live absolute inset-0 rounded-[14px]"
          style={{
            background: "rgba(68,88,121,0.08)",
            boxShadow: "inset 0 0 0 2px var(--slate)",
            opacity: 0,
          }}
        >
          <div
            className="absolute inset-x-0 flex flex-col items-center text-center"
            style={{ top: 230 }}
          >
            <span className="text-slate text-[24px] font-semibold">
              Let go to read it
            </span>
            <span className="mt-2 font-mono text-[16px] text-[rgba(44,49,53,0.55)]">
              {FILE_NAME}
            </span>
          </div>
        </div>

        {/* Folded: the file's bar */}
        <div
          className="zone-folded absolute inset-x-0 top-0 flex items-center"
          style={{ height: BAR_H, paddingLeft: 16 + 32 + 14 }}
        >
          <span className="flex flex-col">
            <span className="text-[17px] font-semibold text-[#0d1117]">
              {FILE_NAME}
            </span>
            <span className="mt-0.5 font-mono text-[14px] text-[rgba(44,49,53,0.55)]">
              <Ph>
                <span className="row-count">412</span>
              </Ph>{" "}
              students, 4 columns
            </span>
          </span>
          <div
            className="relative ml-auto h-full overflow-hidden"
            style={{ width: 520 }}
          >
            <div className="r-matched absolute inset-y-0 right-4 flex items-center gap-2 text-[14.5px] font-semibold text-[#2f5f1f]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4e7d3a] text-white">
                <Icon name="check" size={14} stroke={2.8} />
              </span>
              All 4 columns matched
            </div>
            <div
              className="r-diff absolute inset-y-0 right-3.5 flex items-center gap-2.5"
              style={{ opacity: 0 }}
            >
              <Chip status="added">
                +<Ph>120</Ph> added
              </Chip>
              <Chip status="changed">
                ~<Ph>14</Ph> changed
              </Chip>
              <Chip status="removed">
                −<Ph>3</Ph> removed
              </Chip>
              <span
                className="apply-btn ml-1.5 flex items-center justify-center rounded-[9px] text-[14.5px] font-semibold text-white"
                style={{
                  width: APPLY.w,
                  height: APPLY.h,
                  background: "var(--slate)",
                }}
              >
                Apply
              </span>
            </div>
            <div
              className="r-done absolute inset-y-0 right-4 flex items-center gap-2 text-[14.5px] font-semibold text-[#2f5f1f]"
              style={{ opacity: 0 }}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4e7d3a] text-white">
                <Icon name="check" size={14} stroke={2.8} />
              </span>
              <span>Students updated</span>
              <span className="font-mono text-[13px] font-medium text-[rgba(44,49,53,0.55)]">
                · just now
              </span>
            </div>
          </div>
          <div
            className="progress absolute inset-x-0 bottom-0 h-0.75"
            style={{ background: "var(--slate)", transform: "scaleX(0)" }}
          />
        </div>
      </div>

      {/* The rows, as read */}
      <div
        className="table-card absolute overflow-hidden rounded-[14px] bg-white"
        style={{
          left: ZONE.x,
          top: TABLE.y,
          width: ZONE.w,
          height: TABLE.h,
          boxShadow: CARD_SHADOW,
        }}
      >
        <div
          className="relative flex items-center"
          style={{ height: HEAD_H, boxShadow: "inset 0 -1px 0 var(--hair)" }}
        >
          <Cells>
            {COLS.map((c) => (
              <span
                key={c.key}
                className="text-[14.5px] font-semibold text-[rgba(44,49,53,0.58)]"
                style={{ width: c.w }}
              >
                {c.label}
              </span>
            ))}
          </Cells>
        </div>
        {ROWS.map((r) => (
          <TableRow key={r.id} row={r} />
        ))}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16"
          style={{
            background: "linear-gradient(rgba(255,255,255,0), #ffffff)",
          }}
        />
      </div>

      {/* The pointer that clicks Apply */}
      <Cursor className="cur-b" style={{ opacity: 0 }} />

      {/* Done */}
      <div
        className="absolute inset-x-0 flex justify-center"
        style={{ bottom: PAD - 4 }}
      >
        <div
          className="toast flex items-center gap-3 rounded-full py-2.5 pr-5 pl-3 text-[15.5px] font-semibold text-white"
          style={{
            background: "#0d1117",
            boxShadow: "0 16px 36px -12px rgba(16,24,40,0.4)",
            transform: "translateY(90px)",
          }}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4e9a3a]">
            <Icon name="check" size={14} stroke={2.8} />
          </span>
          <span>
            Applied · <Ph>137</Ph> changes
          </span>
        </div>
      </div>
    </Stage>
  );
}

/** A row's columns, which shift right when the diff's gutter opens. */
function Cells({ children }: { children: ReactNode }) {
  return (
    <div className="cells relative flex items-center gap-0 pl-4">
      {children}
    </div>
  );
}

function TableRow({ row }: { row: Row }) {
  const removed = row.status === "removed";
  const tone = row.status === "same" ? null : TONE[row.status];
  return (
    <div
      className={`row-${row.id} ${removed ? "" : "read-row"} relative overflow-hidden`}
      style={{ height: removed ? 0 : ROW_H }}
    >
      <div
        className="relative flex h-full items-center"
        style={{ height: ROW_H, boxShadow: "inset 0 -1px 0 var(--hair)" }}
      >
        {tone && (
          <>
            {!removed && (
              <div
                className="row-flash absolute inset-0"
                style={{ background: "#4e9a3a", opacity: 0 }}
              />
            )}
            <div
              className="row-tint absolute inset-0"
              style={{ background: tone.tint, transform: "scaleX(0)" }}
            />
            <span
              className="row-mark absolute flex h-5 w-5 items-center justify-center rounded-md font-mono text-[14px] leading-none font-bold"
              style={{
                left: 14,
                top: (ROW_H - 20) / 2,
                color: tone.ink,
                background: tone.tint,
                opacity: 0,
              }}
            >
              {tone.mark}
            </span>
          </>
        )}
        <Cells>
          {COLS.map((c) => {
            const value = row[c.key];
            const changed = row.was?.col === c.key;
            return (
              <span
                key={c.key}
                className={`relative truncate ${c.mono ? "font-mono text-[15.5px]" : "text-[16.5px]"} ${c.key === "name" ? "font-semibold" : ""}`}
                style={{
                  width: c.w,
                  color: removed ? "rgba(163,32,46,0.75)" : "#0d1117",
                  textDecoration: removed ? "line-through" : undefined,
                }}
              >
                {changed && row.was ? (
                  <span className="relative inline-flex items-center">
                    <span
                      className="chg-hl absolute -inset-x-1.5 -inset-y-1 rounded-md"
                      style={{
                        background: "rgba(246,167,59,0.32)",
                        boxShadow: "inset 0 0 0 1px rgba(217,148,37,0.7)",
                        opacity: 0,
                      }}
                    />
                    <span
                      className="was relative inline-flex overflow-hidden whitespace-nowrap"
                      style={{ width: 0 }}
                    >
                      <span className="text-[rgba(163,32,46,0.8)] line-through">
                        {row.was.value}
                      </span>
                      <span className="px-1.5 text-[#9a5a00]">→</span>
                    </span>
                    <span className="relative font-semibold">{value}</span>
                  </span>
                ) : (
                  value
                )}
              </span>
            );
          })}
        </Cells>
      </div>
    </div>
  );
}

function Chip({
  status,
  children,
}: {
  status: Exclude<Status, "same">;
  children: ReactNode;
}) {
  const t = TONE[status];
  return (
    <span
      className="chip inline-block rounded-full px-3 py-1 font-mono text-[13.5px] font-semibold whitespace-nowrap"
      style={{
        background: t.tint,
        color: t.ink,
        boxShadow: `inset 0 0 0 1px ${t.tint}`,
      }}
    >
      {children}
    </span>
  );
}

/** Overlay: the spreadsheet on the "desktop" under the window, and the hand that carries it. */
function DraggedFile() {
  return (
    <div
      className="drag absolute"
      style={{ left: START.x, top: START.y, width: FILE.w, height: FILE.h }}
    >
      <div className="file absolute inset-0">
        <SheetIcon />
      </div>
      <span className="file-name t-small text-body absolute top-1/2 right-full mr-5 -translate-y-1/2 font-medium whitespace-nowrap">
        {FILE_NAME}
      </span>
      <Cursor className="cur-a" style={{ opacity: 0 }} />
    </div>
  );
}

/** A generic spreadsheet document: a page with a folded corner and a green grid. */
function SheetIcon() {
  return (
    <div
      className="file-art relative h-full w-full rounded-lg"
      style={{
        background: "#ffffff",
        boxShadow: "0 10px 22px -8px rgba(16,24,40,0.26)",
      }}
    >
      <svg
        viewBox="0 0 64 80"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <path d="M44 0 L64 20 L44 20 Z" fill="#cfd8e3" />
        <path d="M44 0 L64 20" stroke="#b4c0cf" strokeWidth="1" />
        <rect
          x="10"
          y="30"
          width="44"
          height="34"
          rx="3"
          fill="#e8f3ec"
          stroke="#2f8a57"
          strokeWidth="2"
        />
        <path
          d="M10 41.5 H54 M10 52.5 H54 M25 30 V64"
          stroke="#2f8a57"
          strokeWidth="1.6"
        />
        <rect x="8" y="68" width="30" height="8" rx="2" fill="#2f8a57" />
      </svg>
    </div>
  );
}
