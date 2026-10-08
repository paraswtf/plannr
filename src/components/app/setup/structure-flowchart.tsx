import { Fragment, type CSSProperties } from "react";
import Link from "next/link";

import { Icon, type IconName } from "~/components/ui/icon";
import type { RouterOutputs } from "~/trpc/react";

/**
 * The chain the rest of the app is built on, drawn once so nobody has to be
 * told it: a programme admits a batch, the batch sits at a semester number in
 * the semester everyone shares, the batch splits into groups, a group takes
 * courses, and a course meets as lectures.
 *
 * Every node carries this institution's own count, because the shape only means
 * something with real numbers on it, and every node is a link to the screen
 * that manages that thing — the diagram doubles as the way in.
 */

export type Structure = NonNullable<RouterOutputs["courses"]["structure"]>;

const COUNT = new Intl.NumberFormat("en-GB");

interface Step {
  label: string;
  value: string;
  caption: string;
  /** A second count the node has earned, when one number cannot tell the story. */
  note?: string;
  href: string;
  icon: IconName;
  /** Filled rather than outlined: everything else is dated against it. */
  pivot?: boolean;
}

export function StructureFlowchart({
  semesterName,
  programmes,
  totals,
}: {
  semesterName: string;
  programmes: Structure["programmes"];
  totals: Structure["totals"];
}) {
  const batches = programmes.reduce((n, p) => n + p.batches.length, 0);

  const steps: Step[] = [
    {
      label: "Programme",
      value: COUNT.format(programmes.length),
      caption: "The degrees the college runs",
      href: "/groups",
      icon: "building",
    },
    {
      label: "Batch",
      value: COUNT.format(batches),
      caption: "One intake a year, e.g. 23-27 BCA",
      href: "/groups",
      icon: "users",
    },
    {
      label: "Semester",
      value: semesterName,
      caption: "One calendar the whole college keeps",
      href: "/timetable",
      icon: "calendar",
      pivot: true,
    },
    {
      label: "Group",
      value: COUNT.format(totals.groups),
      caption: "Part of a batch, taught together",
      href: "/groups",
      icon: "layers",
    },
    {
      label: "Course",
      value: COUNT.format(totals.courses),
      caption: "A subject taught this semester",
      href: "/courses",
      icon: "book",
    },
    {
      // A lecture is the series, not the hour: one weekly slot expands into a
      // sitting a week, which is why the register count runs far ahead of it.
      label: "Lecture",
      value: COUNT.format(totals.lectures),
      caption: "A group, a course, a teacher, a room",
      note: `${COUNT.format(totals.registers)} registers taken, one per sitting`,
      href: "/timetable",
      icon: "grid",
    },
  ];

  return (
    <section aria-label="How the institution is arranged">
      {/* A node will not go narrower than its chip plus its label — about 150px
          — so six of them plus the arrows need a little over 1000px, which the
          fixed 244px sidebar leaves nothing like until 2xl. One line there, and
          folded into three-a-line from md, where three nodes and two arrows want
          about 500px of the 700 there is. Only on a phone does the chain run
          straight down: six full-width nodes is a lot of scrolling for a diagram
          whose whole point is a shape, but it is that or a document that scrolls
          sideways. */}
      <ol
        className="flex flex-col md:grid md:items-stretch 2xl:flex 2xl:flex-row"
        // Inert while this is a flex container, which is what it is on a phone
        // and again at 2xl; only the grid in between reads it.
        style={{
          gridTemplateColumns: `repeat(${PER_ROW - 1}, minmax(0,1fr) auto) minmax(0,1fr)`,
        }}
      >
        {steps.map((step, i) => (
          <Fragment key={step.label}>
            {i > 0 && <Arrow {...arrowCell(i - 1)} />}
            <li className="min-w-0 2xl:flex-1" style={nodeCell(i)}>
              <StepCard step={step} />
            </li>
          </Fragment>
        ))}
      </ol>

      <p className="text-muted mt-4 text-sm 2xl:text-center">
        There is no separate enrolment: a student&rsquo;s courses are the
        courses of the groups they are in, so putting a name from{" "}
        <Link
          href="/people"
          className="text-slate font-semibold underline-offset-2 hover:underline"
        >
          People
        </Link>{" "}
        into a group is what signs them up.
      </p>
    </section>
  );
}

/**
 * One node. The grid is what lets the same markup read two ways: full width on
 * a phone, the number sits out to the right of the label; in a column of a
 * folded or single line — around 210px either way — it drops beneath it, which
 * is the only way the label and the number both fit.
 */
function StepCard({ step }: { step: Step }) {
  const pivot = step.pivot ?? false;
  // Anything that is not a tally — the semester's name — cannot carry the
  // headline size without wrapping in a 140px column.
  const numeric = /^[\d,]+$/.test(step.value);

  return (
    <Link
      href={step.href}
      // The ring and shadow are classes rather than an inline style so the
      // pointer can deepen the shadow as the node lifts; an inline boxShadow
      // would outrank any hover state.
      className={`plr-clip plr-hoverlift grid h-full grid-cols-[auto_1fr_auto] content-start items-center gap-x-2.5 gap-y-1.5 rounded-[var(--radius-card)] p-3.5 md:grid-cols-[auto_1fr] ${
        pivot
          ? "bg-slate text-white shadow-[var(--shadow-md)]"
          : "bg-surface shadow-[var(--ring),var(--shadow-card)] hover:shadow-[var(--ring),var(--shadow-md)]"
      }`}
    >
      {/* One slate chip for every step. The chips used to walk the brand
          gradient from violet to orange, five colours that meant nothing but
          position; the gradient is the logo's now, and the order is already
          the list's. The pivot keeps its white-on-slate chip, since it is the
          one node that is filled. */}
      <span
        className={`flex h-[30px] w-[30px] items-center justify-center rounded-[9px] ${
          pivot ? "bg-white/18 text-white" : "bg-tint text-slate"
        }`}
      >
        <Icon name={step.icon} size={16} stroke={1.9} />
      </span>

      {/* Sentence case, at the size it always was: the width this label and
          the chip need together is what the node's 150px floor is built on,
          and dropping the spaced capitals only ever makes it narrower. */}
      <span
        className={`text-[11.5px] font-semibold ${
          pivot ? "text-white/75" : "text-muted"
        }`}
      >
        {step.label}
      </span>

      <span
        className={`font-display justify-self-end leading-none font-semibold tracking-[-0.02em] md:col-span-2 md:justify-self-start ${
          numeric ? "text-[26px]" : "text-[17px]"
        } ${pivot ? "text-white" : "text-title"}`}
      >
        {step.value}
      </span>

      <span
        className={`col-span-3 text-[11.5px] md:col-span-2 ${
          pivot ? "text-white/70" : "text-faint"
        }`}
      >
        {step.caption}
      </span>

      {step.note && (
        <span
          className={`col-span-3 font-mono text-[11px] md:col-span-2 ${
            pivot ? "text-white/70" : "text-faint"
          }`}
        >
          {step.note}
        </span>
      )}
    </Link>
  );
}

/**
 * How many nodes go on a line once the chain is folded, and where each of the
 * eleven items — six nodes and the five arrows between them — then sits.
 *
 * Node columns alternate with narrow arrow columns, and every other line runs
 * backwards, so the chain folds like a snake. That is the whole reason for
 * placing the items by hand rather than letting them flow: the step that ends
 * one line is then directly above the step that starts the next, and the arrow
 * joining them is a hop straight down instead of a jump back across the width
 * of the diagram, which is the thing that stops a wrapped chain reading as one.
 *
 * Both helpers hand back a style rather than a class because `grid-row` and
 * `grid-column` mean nothing to a flex container, which is what the list is on
 * a phone and again at 2xl — so the same inline styles simply stop applying at
 * both ends without a breakpoint being mentioned.
 */
const PER_ROW = 3;

/** Which line the i-th step is on, and how far along it — right to left on the
 * odd lines, which is what makes the fold a snake rather than a carriage return. */
function place(i: number) {
  const row = Math.floor(i / PER_ROW);
  const along = i % PER_ROW;
  return { row, col: row % 2 === 0 ? along : PER_ROW - 1 - along };
}

/** Node column n takes grid column 2n+1; line r takes grid row 2r+1. */
function nodeCell(i: number): CSSProperties {
  const { row, col } = place(i);
  return { gridColumn: col * 2 + 1, gridRow: row * 2 + 1 };
}

/** The arrow leaving step i, and the way it has to point to reach step i+1. */
function arrowCell(i: number): { style: CSSProperties; turn: Turn } {
  const from = place(i);
  const to = place(i + 1);

  if (from.row === to.row) {
    return {
      // Between two node columns, so on the even column that divides them.
      style: { gridColumn: from.col + to.col + 1, gridRow: from.row * 2 + 1 },
      turn: from.row % 2 === 0 ? "right" : "left",
    };
  }
  // The fold: both steps are in this column, and the arrow drops between them.
  return {
    style: { gridColumn: from.col * 2 + 1, gridRow: from.row * 2 + 2 },
    turn: "down",
  };
}

type Turn = "right" | "left" | "down";

/**
 * Stacked, every arrow points down the page; folded, it points the way its line
 * runs and turns down at the fold; in one line at 2xl they all point right.
 */
const TURNS: Record<Turn, string> = {
  right: "rotate-90 md:rotate-0",
  left: "rotate-90 md:rotate-180 2xl:rotate-0",
  down: "rotate-90 2xl:rotate-0",
};

/** Decoration: the order is already in the list, so this is hidden from readers. */
function Arrow({ style, turn }: { style: CSSProperties; turn: Turn }) {
  return (
    <li
      aria-hidden="true"
      // The padding is also the gutter: these cells are what holds the nodes
      // apart in both directions once the chain is a grid.
      className="flex justify-center py-1.5 md:items-center md:px-1.5 2xl:py-0"
      style={style}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="var(--slate-muted)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={TURNS[turn]}
      >
        <path d="M2.5 10h13" />
        <path d="M11 5.5 15.5 10 11 14.5" />
      </svg>
    </li>
  );
}
