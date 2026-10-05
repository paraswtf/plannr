"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import { useSteps } from "~/deck/useSteps";
import { Icon } from "~/ui/icon";
import { courseTone } from "~/ui/mock";
import { Ph } from "~/ui/placeholder";

export interface FacultyHuntProps {
  step: number;
  active: boolean;
}

/**
 * A student trying to find one teacher today. There is no page for a person,
 * only for courses, so they read course timetables cell by cell.
 *
 * Builds (steps = 3):
 *   0 — the question: "Where is Prof. <name> right now?"
 *   1 — if you know her courses: scan each course's timetable, a highlight stepping through cells while a counter of cells read climbs.
 *   2 — if you don't: scan every course that day; the counter runs into the hundreds and the grid fills the screen.
 */

/* Everything is placed in canvas pixels inside the 960 × 844 box, so the
 * highlight can step between cells from constants. */
const BOX = { width: 960, height: 844 } as const;

/** One course's timetable for today: divisions across, hours down. */
const GRID = {
  width: 300,
  header: 50,
  colHead: 32,
  timeCol: 48,
  row: 70,
  gap: 30,
  top: 230,
} as const;
const DIVS = ["BCA-A", "BCA-B", "BBA(IT)-A"];
const HOURS = ["09:00", "11:00", "14:00", "16:00"];
const CELL_W = (GRID.width - GRID.timeCol) / DIVS.length;
const GRID_H = GRID.header + GRID.colHead + HOURS.length * GRID.row;
const CELLS = DIVS.length * HOURS.length;

/** The wall of every course today, for build 2. */
const WALL = { cols: 9, rows: 4, top: 222, scale: 0.3 } as const;
const WALL_GAP_X =
  (BOX.width - WALL.cols * GRID.width * WALL.scale) / (WALL.cols - 1);
const WALL_GAP_Y = 12;

/** Her three courses, and where they land in the wall. */
const HER_COURSES = ["Design Thinking", "Cloud Computing", "Data Mining"];
const HER_WALL_SLOTS = [8, 19, 28];
/** She is found in the third course, BCA-B at 11:00. */
const FOUND = { grid: 2, row: 1, col: 1 } as const;
const FOUND_INDEX = FOUND.row * DIVS.length + FOUND.col; // within its grid
const FOUND_AT_KNOWN = FOUND.grid * CELLS + FOUND_INDEX + 1; // cells read in build 1
const FOUND_AT_ALL =
  (HER_WALL_SLOTS[FOUND.grid] ?? 0) * CELLS + FOUND_INDEX + 1; // build 2

const OTHER_COURSES = [
  "Web Technologies",
  "Cyber Security",
  "Business Analytics",
  "Software Testing",
  "Operating Systems",
  "Java Programming",
  "Digital Marketing",
  "Statistics",
  "Networking",
  "Python Lab",
  "Mobile Apps",
  "Cloud Lab",
  "Accounting",
  "AI Fundamentals",
  "Economics",
  "Soft Skills",
  "DBMS",
  "Linux Admin",
  "UX Research",
  "Big Data",
  "Data Structures",
  "E-Commerce",
  "IoT",
  "ERP Systems",
  "Research Methods",
  "Ethics in IT",
  "Game Design",
  "Calculus",
  "Org. Behaviour",
  "Finance Basics",
  "Blockchain",
  "Comms Lab",
  "Project Mgmt",
];

const TEACHERS = [
  "Mehta",
  "Iyer",
  "Rao",
  "Joshi",
  "Shah",
  "Nair",
  "Desai",
  "Pillai",
  "Menon",
  "Bose",
  "Gupta",
];
const ROOMS = ["301", "302", "304", "Lab 1", "Lab 2", "205"];
const PASTELS = ["#c9def2", "#ffe2b0", "#d6ecc6", "#ecd5ef", "#f6d2cf"];

/** A deterministic, plausible cell: teacher and room, or a free period. */
function cellFor(
  seed: number,
  idx: number,
): { who: string; room: string; tone: string } | null {
  const h = (seed * 7919 + idx * 104729) % 9973;
  if (h % 5 === 0) return null;
  return {
    who: TEACHERS[h % TEACHERS.length]!,
    room: ROOMS[(h >> 3) % ROOMS.length]!,
    tone: PASTELS[(seed + (idx % 2)) % PASTELS.length]!,
  };
}

/** Top-left of grid g in build 1. */
const knownPos = (g: number) => ({
  x: g * (GRID.width + GRID.gap),
  y: GRID.top,
});
/** Top-left of wall slot s in build 2. */
const wallPos = (s: number) => ({
  x: (s % WALL.cols) * (GRID.width * WALL.scale + WALL_GAP_X),
  y: WALL.top + Math.floor(s / WALL.cols) * (GRID_H * WALL.scale + WALL_GAP_Y),
});
/** A cell's box, given its grid's top-left and scale. */
const cellRect = (origin: { x: number; y: number }, i: number, k = 1) => ({
  x: origin.x + (GRID.timeCol + (i % DIVS.length) * CELL_W) * k,
  y:
    origin.y +
    (GRID.header + GRID.colHead + Math.floor(i / DIVS.length) * GRID.row) * k,
  width: CELL_W * k,
  height: GRID.row * k,
});

/** The wall, slot by slot: which course sits there. */
const WALL_SLOTS: { course: string; mine: number | null }[] = (() => {
  const slots: { course: string; mine: number | null }[] = [];
  let other = 0;
  for (let s = 0; s < WALL.cols * WALL.rows; s++) {
    const mine = HER_WALL_SLOTS.indexOf(s);
    if (mine >= 0) slots.push({ course: HER_COURSES[mine]!, mine });
    else
      slots.push({
        course: OTHER_COURSES[other++ % OTHER_COURSES.length]!,
        mine: null,
      });
  }
  return slots;
})();

function CourseGrid({
  course,
  seed,
  found,
}: {
  course: string;
  seed: number;
  found?: number;
}) {
  const tone = courseTone(course);
  return (
    <div
      className="font-body overflow-hidden rounded-[18px] bg-white text-[#0d1117]"
      style={{
        width: GRID.width,
        height: GRID_H,
        boxShadow:
          "inset 0 0 0 1px rgba(68,88,121,0.28), 0 14px 34px rgba(0,0,0,0.3)",
      }}
    >
      <div
        className="flex items-center gap-2.5 px-4"
        style={{ height: GRID.header }}
      >
        <span
          className="h-[12px] w-[12px] shrink-0 rounded-full"
          style={{
            background: tone.fill,
            boxShadow: `inset 0 0 0 1px ${tone.ring}`,
          }}
        />
        <span className="truncate text-[18px] font-bold tracking-[-0.01em]">
          {course}
        </span>
      </div>
      <div
        className="flex font-mono text-[14px] text-[rgba(44,49,53,0.62)]"
        style={{ height: GRID.colHead, background: "#eef0f3" }}
      >
        <span style={{ width: GRID.timeCol }} />
        {DIVS.map((d) => (
          <span
            key={d}
            className="flex items-center justify-center"
            style={{ width: CELL_W }}
          >
            {d}
          </span>
        ))}
      </div>
      {HOURS.map((hour, r) => (
        <div
          key={hour}
          className="flex"
          style={{
            height: GRID.row,
            boxShadow: "inset 0 1px 0 rgba(68,88,121,0.14)",
          }}
        >
          <span
            className="flex items-center justify-center font-mono text-[14px] text-[rgba(44,49,53,0.6)]"
            style={{ width: GRID.timeCol }}
          >
            {hour}
          </span>
          {DIVS.map((d, c) => {
            const i = r * DIVS.length + c;
            const isHer = found === i;
            const cell = isHer
              ? { who: "Kulkarni", room: "Lab 2", tone: "#ffc667" }
              : cellFor(seed, i);
            return (
              <span key={d} className="p-[3px]" style={{ width: CELL_W }}>
                {cell && (
                  <span
                    className="flex h-full flex-col justify-center rounded-[8px] px-[6px]"
                    style={{
                      background: cell.tone,
                      boxShadow: isHer
                        ? "inset 0 0 0 1.5px #d99425"
                        : undefined,
                    }}
                  >
                    <span
                      className={`truncate text-[17px] leading-tight ${isHer ? "font-bold tracking-[-0.02em]" : "font-semibold"}`}
                    >
                      {cell.who}
                    </span>
                    <span className="mt-1 truncate font-mono text-[13px] text-[rgba(44,49,53,0.68)]">
                      {cell.room}
                    </span>
                  </span>
                )}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function FacultyHunt({ step }: FacultyHuntProps) {
  const root = useRef<HTMLDivElement>(null);

  useSteps(root, step, (tl, mark) => {
    const known = gsap.utils.toArray<HTMLElement>(".fh-known", root.current);
    const others = gsap.utils.toArray<HTMLElement>(".fh-other", root.current);
    const box = root.current?.querySelector<HTMLElement>(".fh-box") ?? null;
    const countKnown =
      root.current?.querySelector<HTMLElement>(".fh-count-known") ?? null;
    const countAll =
      root.current?.querySelector<HTMLElement>(".fh-count-all") ?? null;
    const countAllN =
      root.current?.querySelector<HTMLElement>(".fh-count-all-n") ?? null;
    if (!box || !countKnown || !countAll || !countAllN) return;

    // Build 0 holds the question in the middle of the box; it travels up.
    gsap.set(".fh-question", {
      y: 300,
      scale: 1.12,
      transformOrigin: "0% 50%",
    });

    // 1 — If you know her courses.
    tl.to(".fh-question", {
      y: 0,
      scale: 1,
      duration: 0.85,
      ease: "deck.morph",
    });
    tl.fromTo(
      ".fh-label-known",
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 0.5, ease: "deck.enter" },
      "-=0.35",
    );
    tl.fromTo(
      known,
      { autoAlpha: 0, y: 60 },
      { autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out", stagger: 0.1 },
      "<0.05",
    );
    tl.fromTo(
      ".fh-counter",
      { autoAlpha: 0, y: 16 },
      { autoAlpha: 1, y: 0, duration: 0.5, ease: "deck.enter" },
      "<0.3",
    );

    // The highlight reads every cell in order, one hop at a time.
    const knownPath = Array.from({ length: FOUND_AT_KNOWN }, (_, n) =>
      cellRect(knownPos(Math.floor(n / CELLS)), n % CELLS),
    );
    const first = knownPath[0]!;
    tl.set(box, first);
    tl.fromTo(
      box,
      { autoAlpha: 0, scale: 1.3 },
      { autoAlpha: 1, scale: 1, duration: 0.3, ease: "power2.out" },
    );
    const hop = 0.045;
    tl.addLabel("scan1");
    knownPath.slice(1).forEach((r, n) => {
      tl.to(
        box,
        { ...r, duration: hop * 0.8, ease: "power2.inOut" },
        `scan1+=${(n + 1) * hop}`,
      );
    });
    const counterA = { n: 1 };
    tl.fromTo(
      counterA,
      { n: 1 },
      {
        n: FOUND_AT_KNOWN,
        duration: (FOUND_AT_KNOWN - 1) * hop,
        ease: "none",
        onUpdate: () =>
          (countKnown.textContent = String(Math.round(counterA.n))),
      },
      "scan1",
    );
    // Found her: the cell lights up, and the answer comes out under the grids.
    tl.to(box, {
      borderColor: "#7cc46a",
      backgroundColor: "rgba(124,196,106,0.22)",
      duration: 0.25,
      ease: "power2.out",
    });
    tl.fromTo(
      ".fh-her-known",
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.25, ease: "power2.out" },
      "<",
    );
    tl.fromTo(
      ".fh-found",
      { autoAlpha: 0, y: 16 },
      { autoAlpha: 1, y: 0, duration: 0.5, ease: "deck.enter" },
      "<0.1",
    );
    mark();

    // 2 — If you don't: every course running today.
    tl.addLabel("all");
    tl.to(
      ".fh-found",
      { autoAlpha: 0, y: -10, duration: 0.3, ease: "power2.in" },
      "all",
    );
    tl.to(box, { autoAlpha: 0, duration: 0.25, ease: "power2.in" }, "all");
    tl.to(
      ".fh-label-known",
      { autoAlpha: 0, y: -18, duration: 0.35, ease: "power2.in" },
      "all",
    );
    tl.fromTo(
      ".fh-label-all",
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 0.5, ease: "deck.enter" },
      "all+=0.3",
    );
    // Her three courses shrink and travel to their places among the rest.
    known.forEach((el, g) => {
      const from = knownPos(g);
      const to = wallPos(HER_WALL_SLOTS[g] ?? 0);
      tl.to(
        el,
        {
          x: to.x - from.x,
          y: to.y - from.y,
          scale: WALL.scale,
          duration: 0.95,
          ease: "deck.morph",
        },
        "all+=0.15",
      );
    });
    tl.set(".fh-her-known", { autoAlpha: 0 }, "all+=0.15");
    // Every other course stacks in around them, from below.
    tl.fromTo(
      others,
      { autoAlpha: 0, y: 120 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.6,
        ease: "power3.out",
        stagger: { each: 0.018, from: "start" },
      },
      "all+=0.45",
    );
    tl.set(countKnown, { autoAlpha: 0 }, "all+=0.6");
    tl.set(countAll, { autoAlpha: 1 }, "all+=0.6");

    // The scan again, through everything, faster and faster.
    const slotOrigin = (s: number) => wallPos(s);
    const allPath = Array.from({ length: FOUND_AT_ALL }, (_, n) =>
      cellRect(slotOrigin(Math.floor(n / CELLS)), n % CELLS, WALL.scale),
    );
    const start = allPath[0]!;
    tl.set(
      box,
      {
        borderColor: "#ff5d73",
        backgroundColor: "rgba(255,93,115,0.18)",
        borderWidth: 2,
      },
      "all+=1.3",
    );
    tl.fromTo(
      box,
      { autoAlpha: 0, ...start },
      { autoAlpha: 1, ...start, duration: 0.2, ease: "power2.out" },
      "all+=1.3",
    );
    const scan = gsap.timeline({ paused: true });
    allPath.slice(1).forEach((r, n) => {
      scan.to(box, { ...r, duration: 0.8, ease: "power1.inOut" }, n + 1);
    });
    const counterB = { n: 1 };
    scan.fromTo(
      counterB,
      { n: 1 },
      {
        n: FOUND_AT_ALL,
        duration: FOUND_AT_ALL - 1,
        ease: "none",
        onUpdate: () =>
          (countAllN.textContent = String(Math.round(counterB.n))),
      },
      0,
    );
    tl.fromTo(
      scan,
      { progress: 0 },
      { progress: 1, duration: 2.6, ease: "power2.in" },
      "all+=1.5",
    );
    // Found, at last: the rest of the wall steps back.
    tl.to(box, {
      borderColor: "#7cc46a",
      backgroundColor: "rgba(124,196,106,0.3)",
      duration: 0.2,
    });
    tl.fromTo(
      ".fh-her-wall",
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.2 },
      "<",
    );
    tl.to(".fh-dim", { opacity: 0.35, duration: 0.5, ease: "power2.out" }, "<");
    tl.fromTo(
      ".fh-cost",
      { autoAlpha: 0, x: 30 },
      { autoAlpha: 1, x: 0, duration: 0.6, ease: "deck.enter" },
      "<0.1",
    );
    mark();
  });

  return (
    <div
      ref={root}
      className="absolute inset-0 flex items-center justify-center"
    >
      <div className="relative shrink-0" style={BOX}>
        {/* The question */}
        <div className="fh-question absolute top-0 left-0 flex items-start gap-5">
          <span
            className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full"
            style={{
              background:
                "color-mix(in srgb, var(--students) 20%, var(--bg-raised))",
              boxShadow:
                "inset 0 0 0 2px color-mix(in srgb, var(--students) 70%, transparent)",
              color: "var(--students)",
            }}
          >
            <Icon name="user" size={36} stroke={2} />
          </span>
          <div>
            <div
              className="bg-raised rounded-[28px] rounded-tl-[8px] px-8 py-6"
              style={{
                boxShadow:
                  "inset 0 0 0 1px var(--line-strong), 0 20px 50px rgba(0,0,0,0.35)",
              }}
            >
              <p className="font-display text-[40px] leading-tight font-semibold tracking-[-0.025em]">
                Where is Prof. Kulkarni right now?
              </p>
            </div>
            <p className="t-mono text-faint mt-3 ml-3 text-[20px]">
              A BCA-B student · 10:52
            </p>
          </div>
        </div>

        {/* What we are searching */}
        <div className="absolute left-0" style={{ top: 168 }}>
          <p className="fh-label-known t-h3 invisible absolute top-0 left-0 whitespace-nowrap">
            If you know her courses{" "}
            <span className="text-muted font-normal">— read each one</span>
          </p>
          <p className="fh-label-all t-h3 invisible absolute top-0 left-0 whitespace-nowrap">
            If you don&apos;t{" "}
            <span className="text-muted font-normal">
              — read every course today
            </span>
          </p>
        </div>

        {/* Every other course, waiting in the wall */}
        {WALL_SLOTS.map((slot, s) => {
          if (slot.mine !== null) return null;
          const p = wallPos(s);
          return (
            <div
              key={s}
              className="fh-other fh-dim invisible absolute"
              style={{ left: p.x, top: p.y }}
            >
              <div
                style={{
                  width: GRID.width * WALL.scale,
                  height: GRID_H * WALL.scale,
                }}
              >
                <div
                  className="origin-top-left"
                  style={{ transform: `scale(${WALL.scale})` }}
                >
                  <CourseGrid course={slot.course} seed={s + 11} />
                </div>
              </div>
            </div>
          );
        })}

        {/* Her courses */}
        {HER_COURSES.map((course, g) => {
          const p = knownPos(g);
          const isFound = g === FOUND.grid;
          return (
            <div
              key={course}
              className="absolute"
              style={{ left: p.x, top: p.y }}
            >
              <div
                className={`fh-known invisible origin-top-left ${isFound ? "" : "fh-dim"}`}
              >
                <CourseGrid course={course} seed={g + 3} />
                {isFound && (
                  <>
                    <div className="fh-her-known invisible absolute inset-0">
                      <CourseGrid
                        course={course}
                        seed={g + 3}
                        found={FOUND_INDEX}
                      />
                    </div>
                    <div className="fh-her-wall invisible absolute inset-0">
                      <CourseGrid
                        course={course}
                        seed={g + 3}
                        found={FOUND_INDEX}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* The reader's eye */}
        <div
          className="fh-box pointer-events-none invisible absolute top-0 left-0 rounded-[10px]"
          style={{
            border: "3px solid var(--students)",
            background: "rgba(255,93,115,0.16)",
            boxShadow: "0 0 0 6px rgba(255,93,115,0.18)",
          }}
        />

        {/* Found, in build 1 */}
        <div
          className="fh-found invisible absolute left-0 flex items-center gap-4"
          style={{ top: GRID.top + GRID_H + 32 }}
        >
          <Icon name="checkCircle" size={34} stroke={2.2} color="var(--good)" />
          <span className="text-[30px] font-semibold tracking-[-0.01em]">
            Prof. Kulkarni{" "}
            <span className="text-muted font-normal">
              · Data Mining · BCA-B ·
            </span>{" "}
            <span className="t-mono">11:00 · Lab 2</span>
          </span>
        </div>

        {/* The counter, and what it costs */}
        <div className="fh-counter invisible absolute bottom-0 left-0 flex flex-col gap-4">
          <span className="t-eyebrow text-muted">cells read</span>
          <span className="grid">
            <span className="fh-count-known t-mono col-start-1 row-start-1 text-[84px] leading-none font-semibold tracking-[-0.04em] tabular-nums">
              1
            </span>
            <span className="fh-count-all t-mono invisible col-start-1 row-start-1 text-[84px] leading-none font-semibold tracking-[-0.04em] tabular-nums">
              <Ph note="Cells read to find one teacher across every course that day">
                <span className="fh-count-all-n">1</span>
              </Ph>
            </span>
          </span>
        </div>
        <div className="fh-cost invisible absolute right-0 bottom-0 text-right">
          <p className="t-h2 leading-none">
            ≈ <Ph>6 min</Ph>
          </p>
          <p className="t-body text-muted mt-2">to find one person</p>
        </div>
      </div>
    </div>
  );
}
