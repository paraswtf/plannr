"use client";

import { useRef } from "react";

import { gsap } from "~/deck/gsap";
import type { SlideDef } from "~/deck/types";

import { Grad, Icon, SlideFrame, useSteps } from "./_kit";

const ROWS = [
  {
    name: "pg_advisory_xact_lock",
    note: "Transaction scoped, released at COMMIT. MySQL GET_LOCK is session scoped and manual.",
  },
  {
    name: "ENUM types",
    note: "CREATE TYPE … AS ENUM: EventKind, RoomFeature, named and reusable.",
  },
  {
    name: "Array columns",
    note: "Room.features RoomFeature[], Org.workingDays Int[].",
  },
  {
    name: "ON CONFLICT DO NOTHING",
    note: "createMany with skipDuplicates: safe to repeat.",
  },
  {
    name: "UPDATE … CASE … NOW()",
    note: "One atomic statement is the API rate limiter.",
  },
  {
    name: "UNIQUE constraints",
    note: "CalendarSyncTask (connectionId, eventId), EventException (eventId, originalStart).",
  },
  {
    name: "FOR UPDATE SKIP LOCKED",
    note: "Each notification goes to one dispatcher.",
  },
];

type Cell = { t: string; mono?: boolean; hot?: boolean } | null;
type Row = [Cell, Cell];

const NO_LOCK: Row[] = [
  [
    { t: "BEGIN", mono: true },
    { t: "BEGIN", mono: true },
  ],
  [
    { t: "Is room 403 free at 10:00? Yes" },
    { t: "Is room 403 free at 10:00? Yes" },
  ],
  [{ t: "INSERT booking, room 403" }, { t: "INSERT booking, room 403" }],
  [
    { t: "COMMIT", mono: true },
    { t: "COMMIT", mono: true },
  ],
];

const WITH_LOCK: Row[] = [
  [
    { t: "BEGIN", mono: true },
    { t: "BEGIN", mono: true },
  ],
  [
    { t: 'pg_advisory_xact_lock(hash("room:403"))', mono: true },
    { t: "same lock call: waiting", hot: true },
  ],
  [{ t: "Is room 403 free? Yes" }, null],
  [{ t: "INSERT booking, room 403" }, null],
  [
    { t: "COMMIT: lock released", mono: true },
    { t: "Lock acquired", hot: true },
  ],
  [null, { t: "Is room 403 free? No: A has it. Refused", hot: true }],
];

export const slide: SlideDef = {
  id: "postgres",
  title: "PostgreSQL",
  steps: 3,
  notes: [
    "Here is the problem. Two coordinators approve two requests for room 403 at ten o'clock, at the same instant. Each one checks the room, sees it free, and books it. Without a lock, both pass the check, and the room is double booked.",
    "Postgres fixes this with an advisory lock, pg_advisory_xact_lock, keyed by a hash of room colon 403. Coordinator A takes it. B waits. A books and commits, the lock is released automatically, and only then does B run its clash check. B now sees A's booking and is refused. When a decision needs several locks, the keys are sorted first, so two approvals in opposite order cannot deadlock.",
    "These are the Postgres features Plannr actually uses. The advisory lock is transaction scoped and released by itself. MySQL's GET_LOCK is session scoped and has to be released by hand, which is risky behind a connection pool. Native enums, array columns, ON CONFLICT DO NOTHING, an atomic rate limiter, and unique constraints that settle races. One honest note: MySQL 8 also has SKIP LOCKED, so we do not claim that one as exclusive to Postgres.",
  ],
  render: ({ step }) => <Postgres step={step} />,
};

function Grid({ rows, cls }: { rows: Row[]; cls: string }) {
  return (
    <div className={`${cls} absolute inset-x-0 top-5 bottom-0`}>
      <div className="grid grid-cols-2 gap-x-10">
        <p className="font-display text-fg pb-2 text-[30px] font-semibold">
          Coordinator A approves
        </p>
        <p className="font-display text-fg pb-2 text-[30px] font-semibold">
          Coordinator B approves
        </p>
        {rows.flat().map((c, i) => (
          <div
            key={i}
            className="flex min-h-[54px] items-center border-t"
            style={{ borderColor: "var(--line)" }}
          >
            {c && (
              <span
                className={`${c.mono ? "t-mono text-fg" : "text-body"} ${c.hot ? "font-medium" : ""} leading-tight`}
                style={{
                  fontSize: c.mono && c.t.length > 24 ? 22 : 24,
                  color: c.hot ? "var(--accent)" : undefined,
                }}
              >
                {c.t}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Postgres({ step }: { step: number }) {
  const visual = useRef<HTMLDivElement>(null);

  useSteps(visual, step, (tl, mark) => {
    gsap.set(".pg-s2", { opacity: 0 });
    gsap.set(".pg-ok", { opacity: 0 });
    gsap.set(".pg-table", { opacity: 0, x: 60 });

    tl.to(
      ".pg-s1, .pg-bad",
      { opacity: 0, duration: 0.4, ease: "deck.enter" },
      ">",
    );
    tl.to(".pg-s2", { opacity: 1, duration: 0.6, ease: "deck.enter" }, "<0.2");
    tl.to(".pg-ok", { opacity: 1, duration: 0.5, ease: "deck.enter" }, ">");
    mark();
    tl.to(
      ".pg-race",
      { opacity: 0, x: -60, duration: 0.6, ease: "deck.enter" },
      ">",
    );
    tl.to(
      ".pg-table",
      { opacity: 1, x: 0, duration: 0.7, ease: "deck.enter" },
      "<0.2",
    );
    mark();
  });

  return (
    <SlideFrame
      title={
        <>
          Two coordinators can <Grad>never double-book a room</Grad>
        </>
      }
      subhead="A Postgres lock puts the two approvals in a line."
      tech={[
        { name: "pg_advisory_xact_lock" },
        { name: "AS ENUM" },
        { name: "ON CONFLICT DO NOTHING" },
        { name: "FOR UPDATE SKIP LOCKED" },
        { name: "UNIQUE constraints" },
      ]}
    >
      <div ref={visual} className="absolute inset-0">
        <div className="pg-race absolute inset-0">
          <Grid rows={NO_LOCK} cls="pg-s1" />
          <Grid rows={WITH_LOCK} cls="pg-s2" />
          <div className="pg-bad absolute right-0 bottom-0 left-0 flex items-center gap-4">
            <Icon name="alert" size={44} className="text-accent shrink-0" />
            <p className="font-display text-fg text-[32px] font-semibold">
              Both passed the check at once: room 403 is booked twice.
            </p>
          </div>
          <div className="pg-ok absolute right-0 bottom-0 left-0 flex items-center gap-4">
            <Icon name="shield" size={44} className="text-accent shrink-0" />
            <p className="font-display text-fg text-[32px] font-semibold">
              Keys are locked in sorted order, so opposite approvals cannot
              deadlock.
            </p>
          </div>
        </div>
        <div className="pg-table absolute inset-x-0 top-5 bottom-0">
          <ul>
            {ROWS.map((r) => (
              <li
                key={r.name}
                className="flex items-baseline gap-8 border-t py-[15px]"
                style={{ borderColor: "var(--line)" }}
              >
                <span className="t-mono text-fg w-[500px] shrink-0 text-[26px] font-medium">
                  {r.name}
                </span>
                <span className="text-body text-[24px] leading-snug">
                  {r.note}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SlideFrame>
  );
}
