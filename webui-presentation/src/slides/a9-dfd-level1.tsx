"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Card, Grad, Icon, SlideFrame, useSteps, type IconName } from "./_kit";

const W = 1664;
const CWD = 186;
const GX = (W - 6 * CWD) / 5;
const CH = 84;
const P = 128;
const VG = P - CH;
const H = P * 5;

type Kind = "e" | "p" | "d";
interface Node {
  c: number;
  r: number;
  kind: Kind;
  tag?: string;
  name: string;
  icon?: IconName;
  grp: 0 | 1 | 2;
}

const NODES: Node[] = [
  { c: 0, r: 0, kind: "e", name: "Google sign-in", icon: "globe", grp: 0 },
  { c: 1, r: 0, kind: "p", tag: "1.0", name: "Authenticate", grp: 0 },
  { c: 2, r: 0, kind: "d", tag: "D1", name: "Users, roles", grp: 0 },
  { c: 3, r: 0, kind: "p", tag: "9.0", name: "Send notices", grp: 2 },
  { c: 4, r: 0, kind: "d", tag: "D8", name: "Devices, notices", grp: 2 },
  { c: 1, r: 1, kind: "e", name: "Students", icon: "cap", grp: 0 },
  { c: 2, r: 1, kind: "p", tag: "2.0", name: "View schedule", grp: 0 },
  { c: 3, r: 1, kind: "d", tag: "D2", name: "Events", grp: 0 },
  { c: 4, r: 1, kind: "p", tag: "7.0", name: "Sync calendars", grp: 2 },
  { c: 5, r: 1, kind: "e", name: "Google Calendar", icon: "globe", grp: 2 },
  { c: 0, r: 2, kind: "e", name: "Faculty", icon: "briefcase", grp: 1 },
  { c: 1, r: 2, kind: "p", tag: "3.0", name: "Manage classes", grp: 1 },
  { c: 2, r: 2, kind: "d", tag: "D4", name: "Change requests", grp: 1 },
  { c: 3, r: 2, kind: "p", tag: "4.0", name: "Approve", grp: 1 },
  { c: 4, r: 2, kind: "d", tag: "D7", name: "Sync tasks", grp: 2 },
  { c: 1, r: 3, kind: "p", tag: "5.0", name: "Attendance", grp: 1 },
  { c: 2, r: 3, kind: "d", tag: "D5", name: "Attendance", grp: 1 },
  { c: 3, r: 3, kind: "e", name: "Coordinators", icon: "users", grp: 1 },
  { c: 4, r: 3, kind: "d", tag: "D3", name: "Rooms, groups", grp: 2 },
  { c: 0, r: 4, kind: "e", name: "System admins", icon: "settings", grp: 1 },
  { c: 1, r: 4, kind: "p", tag: "6.0", name: "Plan a term", grp: 1 },
  { c: 2, r: 4, kind: "d", tag: "D6", name: "Plans", grp: 1 },
  { c: 4, r: 4, kind: "p", tag: "8.0", name: "Import data", grp: 2 },
  { c: 5, r: 4, kind: "e", name: "College MRBS", icon: "database", grp: 2 },
];

const X = (c: number) => c * (CWD + GX);
const Y = (r: number) => r * P;
const CX = (c: number) => X(c) + CWD / 2;
const CY = (r: number) => Y(r) + CH / 2;
type Pt = [number, number];

interface Flow {
  pts: Pt[];
  both?: boolean;
  grp: 0 | 1 | 2;
  label: string;
  lx: number;
  ly: number;
  mode: "above" | "right" | "mid";
}

/** Horizontal arrow across the gap right of column c, in row r. */
function h(
  c: number,
  r: number,
  dir: 1 | -1,
  label: string,
  grp: 0 | 1 | 2,
  both = false,
): Flow {
  const x1 = X(c) + CWD;
  const x2 = x1 + GX;
  const y = CY(r);
  return {
    pts:
      dir === 1
        ? [
            [x1, y],
            [x2, y],
          ]
        : [
            [x2, y],
            [x1, y],
          ],
    both,
    grp,
    label,
    lx: x1 + GX / 2,
    ly: y,
    mode: "above",
  };
}

/** Vertical arrow across the gap below row r, in column c. */
function v(
  c: number,
  r: number,
  dir: 1 | -1,
  label: string,
  grp: 0 | 1 | 2,
  dx = 0,
  both = false,
): Flow {
  const y1 = Y(r) + CH;
  const y2 = y1 + VG;
  const x = CX(c) + dx;
  return {
    pts:
      dir === 1
        ? [
            [x, y1],
            [x, y2],
          ]
        : [
            [x, y2],
            [x, y1],
          ],
    both,
    grp,
    label,
    lx: x + 14,
    ly: y1 + VG / 2,
    mode: "right",
  };
}

const FLOWS: Flow[] = [
  // group 0
  h(0, 0, 1, "identity", 0),
  h(1, 0, 1, "roles", 0, true),
  v(1, 0, -1, "sign in", 0, -40),
  h(1, 1, 1, "schedule", 0, true),
  h(2, 1, -1, "read", 0),
  // group 1
  h(0, 2, 1, "request, clashes", 1, true),
  h(1, 2, 1, "save", 1),
  h(2, 2, 1, "pending", 1),
  v(3, 2, -1, "approve", 1, -40),
  v(3, 1, -1, "update", 1, 40),
  {
    pts: [
      [CX(0), Y(2) + CH],
      [CX(0), CY(3)],
      [X(1), CY(3)],
    ],
    grp: 1,
    label: "marks",
    lx: X(0) + CWD + GX / 2,
    ly: CY(3),
    mode: "above",
  },
  h(1, 3, 1, "log", 1),
  h(0, 4, 1, "term", 1),
  h(1, 4, 1, "save", 1),
  // group 2
  h(3, 1, 1, "events", 2),
  v(4, 1, 1, "tasks", 2),
  h(4, 1, 1, "sync", 2),
  v(3, 0, -1, "changes", 2, 0),
  h(3, 0, 1, "devices", 2, true),
  {
    pts: [
      [CX(3) - 50, Y(0) + CH],
      [CX(3) - 50, Y(0) + CH + VG / 2],
      [CX(1) + 70, Y(0) + CH + VG / 2],
      [CX(1) + 70, Y(1)],
    ],
    grp: 2,
    label: "notices",
    lx: (CX(1) + CX(3)) / 2 + 40,
    ly: Y(0) + CH + VG / 2,
    mode: "mid",
  },
  h(4, 4, -1, "export", 2),
  v(4, 3, -1, "rooms", 2, 0),
  {
    pts: [
      [CX(0) + 40, Y(4)],
      [CX(0) + 40, Y(3) + CH + VG / 2],
      [X(3) - GX / 2, Y(3) + CH + VG / 2],
      [X(3) - GX / 2, CY(4)],
      [X(4), CY(4)],
    ],
    grp: 2,
    label: "CSV",
    lx: X(1) + CWD + GX / 2,
    ly: Y(3) + CH + VG / 2,
    mode: "mid",
  },
];

function head(a: Pt, b: Pt) {
  const dx = Math.sign(b[0] - a[0]);
  const dy = Math.sign(b[1] - a[1]);
  const [x, y] = b;
  return dx !== 0
    ? `M${x - 11 * dx} ${y - 8} L${x} ${y} L${x - 11 * dx} ${y + 8}`
    : `M${x - 8} ${y - 11 * dy} L${x} ${y} L${x + 8} ${y - 11 * dy}`;
}

function FlowView({ f }: { f: Flow }) {
  const p = f.pts;
  const d = p.map((q, i) => `${i ? "L" : "M"}${q[0]} ${q[1]}`).join(" ");
  const n = p.length;
  const label: React.CSSProperties =
    f.mode === "above"
      ? {
          left: f.lx - GX / 2,
          width: GX,
          top: f.ly - 8,
          transform: "translateY(-100%)",
          textAlign: "center",
        }
      : f.mode === "right"
        ? {
            left: f.lx,
            top: f.ly,
            transform: "translateY(-50%)",
            whiteSpace: "nowrap",
          }
        : {
            left: f.lx,
            top: f.ly,
            transform: "translate(-50%,-50%)",
            whiteSpace: "nowrap",
            background: "var(--bg)",
            padding: "0 8px",
          };
  return (
    <div className={`g${f.grp} absolute inset-0`}>
      <svg
        className="absolute inset-0"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={d} />
        <path d={head(p[n - 2]!, p[n - 1]!)} />
        {f.both && <path d={head(p[1]!, p[0]!)} />}
      </svg>
      <p className="text-fg absolute text-[22px] leading-[1.15]" style={label}>
        {f.label}
      </p>
    </div>
  );
}

function NodeView({ n }: { n: Node }) {
  const style = { left: X(n.c), top: Y(n.r), width: CWD, height: CH };
  if (n.kind === "p") {
    return (
      <div className={`g${n.grp} absolute`} style={style}>
        <Card
          accent
          className="flex h-full flex-col items-start justify-center px-4"
        >
          <span className="font-display text-accent tabular text-[22px] leading-none font-semibold">
            {n.tag}
          </span>
          <p className="font-display text-fg mt-1 text-[22px] leading-[1.05] font-semibold">
            {n.name}
          </p>
        </Card>
      </div>
    );
  }
  if (n.kind === "d") {
    return (
      <div
        className={`g${n.grp} absolute flex items-center gap-2 px-3`}
        style={{
          ...style,
          background: "var(--bg-raised)",
          borderTop: "3px solid var(--accent)",
          borderBottom: "3px solid var(--accent)",
        }}
      >
        <span className="font-display text-accent tabular shrink-0 text-[22px] font-semibold">
          {n.tag}
        </span>
        <p className="text-fg text-[22px] leading-[1.1]">{n.name}</p>
      </div>
    );
  }
  return (
    <div className={`g${n.grp} absolute`} style={style}>
      <Card className="flex h-full items-center gap-2 px-2.5">
        <Icon name={n.icon!} size={24} className="text-accent shrink-0" />
        <p className="font-display text-fg text-[22px] leading-[1.1] font-semibold">
          {n.name}
        </p>
      </Card>
    </div>
  );
}

function Dfd({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".g1, .g2", { opacity: 0 });
    tl.to(".g1", { opacity: 1, duration: 0.7, ease: "deck.enter" }, ">");
    mark();
    tl.to(".g2", { opacity: 1, duration: 0.7, ease: "deck.enter" }, ">");
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          Nine processes, <Grad>eight stores</Grad>
        </>
      }
    >
      <div ref={visual} className="absolute inset-x-0 top-2 bottom-0">
        <div className="absolute top-0 left-0" style={{ width: W, height: H }}>
          {FLOWS.map((f, i) => (
            <FlowView key={i} f={f} />
          ))}
          {NODES.map((n) => (
            <NodeView key={n.tag ?? n.name} n={n} />
          ))}
        </div>
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "dfd-level-1",
  title: "Data flow diagram, level 1",
  steps: 3,
  notes: [
    "Level 1 opens Plannr up into nine processes. Google confirms identity to Authenticate, which keeps users and roles in D1. Students sign in and view their schedule through View schedule, which reads the events store, D2.",
    "Changes and attendance. Faculty send a request to Manage classes, which checks for clashes and answers straight away, then saves it in D4. Approve reads the pending requests for coordinators and updates D2. Faculty marks go through Attendance into D5, and admins plan a term through Plan a term into D6.",
    "Three more processes. Sync calendars reads D2, queues tasks in D7 and pushes events to Google Calendar. Import data takes the MRBS export and admin CSV files into events, rooms and groups. Send notices reads changes from D2, uses the devices and notices store D8, and notifies students and faculty.",
  ],
  render: ({ step }) => <Dfd step={step} />,
};
