import { Fragment } from "react";
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
  /** Icon-chip tint. The steps walk the brand gradient, left to right. */
  tint: string;
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
      tint: "var(--violet)",
    },
    {
      label: "Batch",
      value: COUNT.format(batches),
      caption: "One intake a year, e.g. 23-27 BCA",
      href: "/groups",
      icon: "users",
      tint: "#c9306c",
    },
    {
      label: "Semester",
      value: semesterName,
      caption: "One calendar the whole college keeps",
      href: "/timetable",
      icon: "calendar",
      tint: "var(--slate)",
      pivot: true,
    },
    {
      label: "Group",
      value: COUNT.format(totals.groups),
      caption: "Part of a batch, taught together",
      href: "/groups",
      icon: "layers",
      tint: "var(--magenta)",
    },
    {
      label: "Course",
      value: COUNT.format(totals.courses),
      caption: "A subject taught this semester",
      href: "/courses",
      icon: "book",
      tint: "#f2743c",
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
      tint: "var(--orange)",
    },
  ];

  return (
    <section aria-label="How the institution is arranged">
      {/* A node will not go narrower than its chip plus its label — about 150px
          — so six of them plus the arrows need a little over 1000px, which the
          fixed 244px sidebar leaves nothing like until 2xl. Below that the chain
          runs down the page and the arrows turn with it, rather than pushing the
          whole document sideways. */}
      <ol className="flex flex-col 2xl:flex-row 2xl:items-stretch">
        {steps.map((step, i) => (
          <Fragment key={step.label}>
            {i > 0 && <Arrow />}
            <li className="min-w-0 2xl:flex-1">
              <StepCard step={step} />
            </li>
          </Fragment>
        ))}
      </ol>

      <p className="text-muted mt-4 text-[12.5px] 2xl:text-center">
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
 * One node. The grid is what lets the same markup read two ways: stacked, the
 * number sits out to the right of the label; in a row it drops beneath it.
 */
function StepCard({ step }: { step: Step }) {
  const pivot = step.pivot ?? false;
  // Anything that is not a tally — the semester's name — cannot carry the
  // headline size without wrapping in a 140px column.
  const numeric = /^[\d,]+$/.test(step.value);

  return (
    <Link
      href={step.href}
      className={`plr-clip plr-hoverlift grid h-full grid-cols-[auto_1fr_auto] content-start items-center gap-x-2.5 gap-y-1.5 rounded-[var(--radius-card)] p-3.5 2xl:grid-cols-[auto_1fr] ${
        pivot ? "text-white" : "bg-surface"
      }`}
      style={
        pivot
          ? { background: "var(--slate)", boxShadow: "var(--shadow-md)" }
          : { boxShadow: "var(--ring), var(--shadow-card)" }
      }
    >
      <span
        className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px]"
        style={{
          // Mixed against the surface token rather than a literal white, so the
          // chip stays a tint of the card it sits on.
          background: pivot
            ? "rgba(255,255,255,0.18)"
            : `color-mix(in srgb, ${step.tint} 15%, var(--surface))`,
        }}
      >
        <Icon
          name={step.icon}
          size={16}
          stroke={1.9}
          color={pivot ? "#fff" : step.tint}
        />
      </span>

      <span
        className={`text-[11.5px] font-semibold tracking-[0.06em] uppercase ${
          pivot ? "text-white/75" : "text-muted"
        }`}
      >
        {step.label}
      </span>

      <span
        className={`font-display justify-self-end leading-none font-bold tracking-[-0.02em] 2xl:col-span-2 2xl:justify-self-start ${
          numeric ? "text-[26px]" : "text-[17px]"
        } ${pivot ? "text-white" : "text-title"}`}
      >
        {step.value}
      </span>

      <span
        className={`col-span-3 text-[11.5px] 2xl:col-span-2 ${
          pivot ? "text-white/70" : "text-faint"
        }`}
      >
        {step.caption}
      </span>

      {step.note && (
        <span
          className={`col-span-3 font-mono text-[11px] 2xl:col-span-2 ${
            pivot ? "text-white/70" : "text-faint"
          }`}
        >
          {step.note}
        </span>
      )}
    </Link>
  );
}

/** Decoration: the order is already in the list, so this is hidden from readers. */
function Arrow() {
  return (
    <li
      aria-hidden="true"
      className="flex justify-center py-1.5 2xl:items-center 2xl:px-1.5 2xl:py-0"
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
        className="rotate-90 2xl:rotate-0"
      >
        <path d="M2.5 10h13" />
        <path d="M11 5.5 15.5 10 11 14.5" />
      </svg>
    </li>
  );
}
