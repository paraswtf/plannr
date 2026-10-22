"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Grad, SlideFrame, useSteps } from "./_kit";

const CW = 280;
const CH = 150;
const GX = (1664 - 5 * CW) / 4;
const GY = 74;
const colX = (c: number) => c * (CW + GX);
const rowY = (r: number) => r * (CH + GY);

interface Ent {
  id: string;
  col: number;
  row: number;
  grp: 0 | 1 | 2;
  fields: [string, string?][];
}

const ENTS: Ent[] = [
  {
    id: "Role",
    col: 0,
    row: 0,
    grp: 0,
    fields: [["id", "PK"], ["orgId", "FK"], ["name"]],
  },
  {
    id: "UserRole",
    col: 1,
    row: 0,
    grp: 0,
    fields: [
      ["userId", "PK FK"],
      ["roleId", "PK FK"],
    ],
  },
  {
    id: "User",
    col: 2,
    row: 0,
    grp: 0,
    fields: [["id", "PK"], ["orgId", "FK"], ["email"]],
  },
  {
    id: "Organization",
    col: 3,
    row: 0,
    grp: 0,
    fields: [["id", "PK"], ["name"], ["slug"]],
  },
  {
    id: "Programme",
    col: 4,
    row: 0,
    grp: 1,
    fields: [["id", "PK"], ["orgId", "FK"], ["code"]],
  },
  {
    id: "PushSubscription",
    col: 0,
    row: 1,
    grp: 2,
    fields: [["id", "PK"], ["userId", "FK"], ["endpoint"]],
  },
  {
    id: "CalendarConnection",
    col: 1,
    row: 1,
    grp: 2,
    fields: [["id", "PK"], ["userId", "FK"], ["googleEmail"]],
  },
  {
    id: "StudentProfile",
    col: 2,
    row: 1,
    grp: 1,
    fields: [["id", "PK"], ["userId", "FK"], ["prn"]],
  },
  {
    id: "FacultyProfile",
    col: 3,
    row: 1,
    grp: 1,
    fields: [["id", "PK"], ["userId", "FK"], ["shortName"]],
  },
  {
    id: "Group",
    col: 4,
    row: 1,
    grp: 1,
    fields: [["id", "PK"], ["programmeId", "FK"], ["name"]],
  },
  {
    id: "Building",
    col: 0,
    row: 2,
    grp: 1,
    fields: [["id", "PK"], ["orgId", "FK"], ["name"]],
  },
  {
    id: "Room",
    col: 1,
    row: 2,
    grp: 1,
    fields: [["id", "PK"], ["buildingId", "FK"], ["code"]],
  },
  {
    id: "EventOccurrence",
    col: 2,
    row: 2,
    grp: 1,
    fields: [
      ["id", "PK"],
      ["eventId", "FK"],
      ["roomId", "FK"],
    ],
  },
  {
    id: "Event",
    col: 3,
    row: 2,
    grp: 1,
    fields: [["id", "PK"], ["roomId", "FK"], ["startTime"]],
  },
  {
    id: "EventException",
    col: 4,
    row: 2,
    grp: 1,
    fields: [["id", "PK"], ["eventId", "FK"], ["originalStart"]],
  },
];

const byId = (id: string) => ENTS.find((e) => e.id === id)!;
const L = (id: string) => colX(byId(id).col);
const R = (id: string) => colX(byId(id).col) + CW;
const T = (id: string) => rowY(byId(id).row);
const B = (id: string) => rowY(byId(id).row) + CH;
const CXc = (id: string) => colX(byId(id).col) + CW / 2;
const MY = (id: string) => rowY(byId(id).row) + CH / 2;

const INK = "var(--fg)";
type End = "one" | "many" | "opt";

/** A crow's foot end at (x, y); `d` is the unit direction pointing away from the entity. */
function endMark(x: number, y: number, dx: number, dy: number, kind: End) {
  const px = -dy;
  const py = dx;
  const at = (a: number, b: number) =>
    `${x + dx * a + px * b} ${y + dy * a + py * b}`;
  const parts: string[] = [];
  if (kind === "many") {
    parts.push(
      `M${at(18, 0)} L${at(0, -11)}`,
      `M${at(18, 0)} L${at(0, 11)}`,
      `M${at(18, 0)} L${at(0, 0)}`,
    );
    parts.push(`M${at(22, -11)} L${at(22, 11)}`.replace(/22/g, "22"));
  } else if (kind === "one") {
    parts.push(`M${at(14, -11)} L${at(14, 11)}`);
  } else {
    parts.push(`M${at(14, -11)} L${at(14, 11)}`);
  }
  return parts.join(" ");
}

function Ring({
  x,
  y,
  dx,
  dy,
}: {
  x: number;
  y: number;
  dx: number;
  dy: number;
}) {
  return (
    <circle
      cx={x + dx * 28}
      cy={y + dy * 28}
      r={7}
      fill="var(--bg)"
      stroke={INK}
      strokeWidth={2.5}
    />
  );
}

interface Rel {
  d: string;
  a?: {
    x: number;
    y: number;
    dx: number;
    dy: number;
    kind: End;
    ring?: boolean;
  };
  b?: {
    x: number;
    y: number;
    dx: number;
    dy: number;
    kind: End;
    ring?: boolean;
  };
  grp: 0 | 1 | 2;
  label?: { x: number; y: number; text: string };
}

const busY = rowY(0) + CH + GY / 2;
const userC = CXc("User");
const pushC = CXc("PushSubscription");
const calC = CXc("CalendarConnection");
const facC = CXc("FacultyProfile");

const RELS: Rel[] = [
  // identity row
  {
    d: `M${R("Role")} ${MY("Role")} H${L("UserRole")}`,
    a: { x: R("Role"), y: MY("Role"), dx: 1, dy: 0, kind: "one" },
    b: { x: L("UserRole"), y: MY("Role"), dx: -1, dy: 0, kind: "many" },
    grp: 0,
  },
  {
    d: `M${R("UserRole")} ${MY("User")} H${L("User")}`,
    a: { x: R("UserRole"), y: MY("User"), dx: 1, dy: 0, kind: "many" },
    b: { x: L("User"), y: MY("User"), dx: -1, dy: 0, kind: "one" },
    grp: 0,
  },
  {
    d: `M${R("User")} ${MY("User")} H${L("Organization")}`,
    a: { x: R("User"), y: MY("User"), dx: 1, dy: 0, kind: "many" },
    b: { x: L("Organization"), y: MY("User"), dx: -1, dy: 0, kind: "one" },
    grp: 0,
  },
  {
    d: `M${R("Organization")} ${MY("Organization")} H${L("Programme")}`,
    a: {
      x: R("Organization"),
      y: MY("Organization"),
      dx: 1,
      dy: 0,
      kind: "one",
    },
    b: {
      x: L("Programme"),
      y: MY("Organization"),
      dx: -1,
      dy: 0,
      kind: "many",
    },
    grp: 1,
  },
  // user to its profiles and devices (bus)
  {
    d: `M${userC} ${B("User")} V${busY} H${facC} M${userC} ${busY} V${T("StudentProfile")} M${facC} ${busY} V${T("FacultyProfile")}`,
    a: { x: userC, y: B("User"), dx: 0, dy: 1, kind: "one" },
    grp: 1,
  },
  {
    d: `M${pushC} ${busY} H${userC} M${pushC} ${busY} V${T("PushSubscription")} M${calC} ${busY} V${T("CalendarConnection")}`,
    grp: 2,
  },
  {
    d: "",
    b: { x: pushC, y: T("PushSubscription"), dx: 0, dy: -1, kind: "many" },
    grp: 2,
  },
  {
    d: "",
    b: {
      x: calC,
      y: T("CalendarConnection"),
      dx: 0,
      dy: -1,
      kind: "one",
      ring: true,
    },
    grp: 2,
  },
  {
    d: "",
    b: {
      x: userC,
      y: T("StudentProfile"),
      dx: 0,
      dy: -1,
      kind: "one",
      ring: true,
    },
    grp: 1,
  },
  {
    d: "",
    b: {
      x: facC,
      y: T("FacultyProfile"),
      dx: 0,
      dy: -1,
      kind: "one",
      ring: true,
    },
    grp: 1,
  },
  // programme to group
  {
    d: `M${CXc("Programme")} ${B("Programme")} V${T("Group")}`,
    a: { x: CXc("Programme"), y: B("Programme"), dx: 0, dy: 1, kind: "one" },
    b: { x: CXc("Programme"), y: T("Group"), dx: 0, dy: -1, kind: "many" },
    grp: 1,
  },
  // building, room, occurrence, event, exception
  {
    d: `M${R("Building")} ${MY("Building")} H${L("Room")}`,
    a: { x: R("Building"), y: MY("Building"), dx: 1, dy: 0, kind: "one" },
    b: { x: L("Room"), y: MY("Building"), dx: -1, dy: 0, kind: "many" },
    grp: 1,
  },
  {
    d: `M${R("Room")} ${MY("Room")} H${L("EventOccurrence")}`,
    a: { x: R("Room"), y: MY("Room"), dx: 1, dy: 0, kind: "one" },
    b: { x: L("EventOccurrence"), y: MY("Room"), dx: -1, dy: 0, kind: "many" },
    grp: 1,
  },
  {
    d: `M${R("EventOccurrence")} ${MY("Event")} H${L("Event")}`,
    a: { x: R("EventOccurrence"), y: MY("Event"), dx: 1, dy: 0, kind: "many" },
    b: { x: L("Event"), y: MY("Event"), dx: -1, dy: 0, kind: "one" },
    grp: 1,
  },
  {
    d: `M${R("Event")} ${MY("Event")} H${L("EventException")}`,
    a: { x: R("Event"), y: MY("Event"), dx: 1, dy: 0, kind: "one" },
    b: { x: L("EventException"), y: MY("Event"), dx: -1, dy: 0, kind: "many" },
    grp: 1,
  },
  // faculty to event, group to event
  {
    d: `M${facC - 40} ${B("FacultyProfile")} V${T("Event")}`,
    a: {
      x: facC - 40,
      y: B("FacultyProfile"),
      dx: 0,
      dy: 1,
      kind: "one",
      ring: true,
    },
    b: { x: facC - 40, y: T("Event"), dx: 0, dy: -1, kind: "many" },
    grp: 1,
  },
  {
    d: `M${CXc("Group")} ${B("Group")} V${B("Group") + GY / 2} H${facC + 40} V${T("Event")}`,
    a: {
      x: CXc("Group"),
      y: B("Group"),
      dx: 0,
      dy: 1,
      kind: "one",
      ring: true,
    },
    b: { x: facC + 40, y: T("Event"), dx: 0, dy: -1, kind: "many" },
    grp: 1,
  },
];

function Marks({ r }: { r: Rel }) {
  return (
    <>
      {[r.a, r.b].map((m, i) =>
        m ? (
          <g key={i}>
            <path d={endMark(m.x, m.y, m.dx, m.dy, m.kind)} />
            {m.ring && <Ring x={m.x} y={m.y} dx={m.dx} dy={m.dy} />}
          </g>
        ) : null,
      )}
    </>
  );
}

function Card2({ e }: { e: Ent }) {
  const hot = e.id === "PushSubscription" || e.id === "CalendarConnection";
  return (
    <div
      className={`g${e.grp} absolute overflow-hidden rounded-[14px] ${hot ? "bg-accent-soft" : "bg-raised"}`}
      style={{
        left: colX(e.col),
        top: rowY(e.row),
        width: CW,
        height: CH,
        boxShadow: hot
          ? "inset 0 0 0 1.5px var(--accent-line), var(--shadow-1)"
          : "inset 0 0 0 1px var(--line-strong), var(--shadow-1)",
      }}
    >
      <p
        className={`font-display px-4 pt-2 pb-2 text-[24px] leading-[1.1] font-semibold ${hot ? "text-accent" : "text-fg"}`}
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        {e.id}
      </p>
      <ul className="px-4 pt-1.5">
        {e.fields.map(([n, k]) => (
          <li
            key={n}
            className="flex items-baseline justify-between text-[22px] leading-[1.45]"
          >
            <span className="t-mono text-body">{n}</span>
            {k && <span className="t-mono text-muted text-[18px]">{k}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Er({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".g1", { opacity: 1 });
    gsap.set(".g2", { opacity: 0 });
    tl.to(".g2", { opacity: 1, duration: 0.7, ease: "deck.enter" }, ">");
    mark();
  });

  const H = rowY(2) + CH;
  return (
    <SlideFrame
      title={
        <>
          Every class, room and person <Grad>linked once</Grad>
        </>
      }
    >
      <div ref={visual} className="absolute inset-x-0 top-6 bottom-0">
        <svg
          className="absolute top-0 left-0"
          width={1664}
          height={H}
          viewBox={`0 0 1664 ${H}`}
          fill="none"
          stroke={INK}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {RELS.map((r, i) => (
            <g key={i} className={`g${r.grp}`}>
              {r.d && <path d={r.d} />}
              <Marks r={r} />
            </g>
          ))}
        </svg>
        {ENTS.map((e) => (
          <Card2 key={e.id} e={e} />
        ))}
        <p
          className="text-muted absolute left-0 text-[24px]"
          style={{ top: H + 22 }}
        >
          15 of 43 models shown. Every table carries orgId. Bar means one, fork
          means many, ring means optional.
        </p>
      </div>
    </SlideFrame>
  );
}

export const slide: SlideDef = {
  id: "er-diagram",
  title: "Data design: ER diagram",
  steps: 2,
  notes: [
    "A simplified entity relationship diagram: 15 of the 43 models. An organization owns users. A user holds roles through UserRole, and may have a student or faculty profile. Programmes hold groups, and buildings hold rooms. An event belongs to a room, and optionally a group and a faculty member. The calendar is materialised into EventOccurrence rows, one per sitting, and an EventException records a single changed or cancelled date.",
    "The two newest models: a user can have many PushSubscriptions, one per device, and one CalendarConnection for Google Calendar sync.",
  ],
  render: ({ step }) => <Er step={step} />,
};
