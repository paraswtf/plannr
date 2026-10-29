import { Pct } from "~/content/research";
import {
  byReach,
  type Problem,
  type Research,
  type Tally,
} from "~/content/types";
import type { SectionDef } from "~/deck/types";
import { BarChart, type BarDatum } from "~/templates/BarChart";
import { FlowDiagram } from "~/templates/FlowDiagram";
import { InterviewSummary } from "~/templates/InterviewSummary";
import { ProblemBoard } from "~/templates/ProblemBoard";
import { ProblemRanking } from "~/templates/ProblemRanking";
import { SectionOpener } from "~/templates/SectionOpener";
import { Ph } from "~/ui/placeholder";
import { AdminDashboard } from "~/visuals/admins/AdminDashboard";
import { BulkImport } from "~/visuals/admins/BulkImport";
import { PlannerGenerate } from "~/visuals/admins/PlannerGenerate";

import { chapterSlides, type Chapter } from "./_chapters";

/*
 * Section 05: SYSTEM ADMINS AND MANAGEMENT, presented by Paras.
 *
 * Shorter than the others, and the one with no research behind it yet: the
 * admin interviews are the next round. Every tally here is a placeholder of
 * four (two system admins, two from management), shown as it is and marked,
 * never projected. When the interviews are in, put the real counts in `ph`
 * below (and drop `placeholder`): the chart, the ranking and the chapters
 * follow.
 */

/** A placeholder tally: `count` of the four admins we mean to interview. */
const ph = (count: number): Tally => ({ count, of: 4, placeholder: true });

const RESEARCH: Research = {
  stats: [
    { value: <Ph>2</Ph>, label: "system admins" },
    { value: <Ph>2</Ph>, label: "people from management" },
    { value: <Ph>7</Ph>, label: "days with them" },
  ],
  methods: [
    "Watching a start-of-term data update",
    "Interviews with IT and management",
    "Timing the pages they use most",
  ],
  quotes: [
    {
      text: (
        <Ph>
          Every term I build the timetable by hand, one lecture at a time.
        </Ph>
      ),
      who: <Ph>System admin</Ph>,
    },
    {
      text: <Ph>A new term is a week of typing the same spreadsheet in.</Ph>,
      who: <Ph>System admin</Ph>,
    },
    {
      text: (
        <Ph>{"I only hear that a class didn't run when someone complains."}</Ph>
      ),
      who: <Ph>Management</Ph>,
    },
  ],
};

/**
 * In the order we expect to hear them. Reach is a placeholder of four;
 * severity is our estimate (5 a missed class or deadline, 4 lost time,
 * 3 friction every time, 2 an annoyance).
 */
const PROBLEMS: Problem[] = [
  {
    id: "manual",
    text: "Data updated by hand, row by row",
    reach: ph(3),
    severity: 5,
    scope: "core",
  },
  {
    id: "bulk",
    text: "No bulk update: a term is hundreds of edits",
    reach: ph(3),
    severity: 4,
    scope: "core",
  },
  {
    id: "dashboard",
    text: "No view of which classes ran today",
    reach: ph(3),
    severity: 4,
    scope: "core",
  },
  {
    id: "audit",
    text: "No record of who changed what",
    reach: ph(2),
    severity: 3,
    scope: "future",
  },
  {
    id: "reports",
    text: "A report means asking IT for a spreadsheet",
    reach: ph(2),
    severity: 3,
    scope: "core",
  },
  {
    id: "term",
    text: "Every term's timetable is built by hand",
    reach: ph(4),
    severity: 5,
    scope: "core",
  },
];

/** Who raised what: one bar per problem, its label the problem's own box. */
const RAISED: BarDatum[] = PROBLEMS.map((p) => ({
  id: p.id,
  label: p.text,
  tally: p.reach,
  flipId: `admins-problem-${p.id}`,
}));

const CHAPTERS: Chapter[] = [
  {
    id: "planner",
    problems: ["term"],
    title: "A whole term, typed in by hand.",
    label: "Every term by hand",
    evidence: [
      {
        problem: "term",
        value: <Pct t={ph(4)} />,
        label: "build each term's timetable by hand",
        source: "Placeholder until we interview admins",
      },
    ],
    quote: {
      text: (
        <Ph>
          A new term means placing every lecture by hand, then checking for
          clashes.
        </Ph>
      ),
      who: <Ph>System admin</Ph>,
    },
    feature: {
      id: "generate",
      name: "A term's timetable, generated",
      tagline:
        "Say what each group needs; Plannr builds a week with no clashes.",
      points: [
        "Say what each group needs each week",
        "Plannr builds a clash-free week, and says what it couldn't place",
        "Review, approve, and it's the timetable",
      ],
      solves: ["term"],
      icon: "sparkles",
    },
    visual: ({ step, active, flipId }) => (
      <PlannerGenerate step={step} active={active} flipId={flipId} />
    ),
    notes: {
      track: [
        "So, one problem at a time, starting from the top. And it's the one we're surest of, even without interviews: every term's timetable is built by hand.",
        "On the slide that's [4 of 4], [100%]: a placeholder, until we sit with them. But we've watched the result for three years: someone places every lecture of every group, one at a time, and then checks it for clashes by eye.",
      ],
      feature: [
        "This one is built: the timetable planner. You say what each group needs in a week: how many lectures of each course, which teacher, what kind of room.",
        "Plannr builds a week with no clashes: no room, teacher or group double-booked, and every room big enough with what the lecture needs. Whatever it can't place, it lists, with the reason, so nothing goes missing quietly.",
        "You review it, approve it, and it's the timetable. Every student's and teacher's view follows from there.",
      ],
    },
  },
  {
    id: "bulk",
    problems: ["manual", "bulk"],
    title: "Hundreds of edits a term.",
    label: "Hundreds of edits",
    evidence: [
      {
        problem: "manual",
        value: <Pct t={ph(3)} />,
        label: "update data by hand, row by row",
        source: "Placeholder until we interview admins",
      },
    ],
    quote: {
      text: (
        <Ph>Every student who changes group is one more form to fill in.</Ph>
      ),
      who: <Ph>System admin</Ph>,
    },
    feature: {
      id: "import",
      name: "People and rooms, in bulk",
      tagline:
        "A spreadsheet of students, staff or rooms, checked before it lands.",
      points: [
        "Upload a CSV of students, staff or rooms",
        "Preview every addition, change and removal",
        "Apply it in one go",
      ],
      solves: ["manual", "bulk"],
      icon: "upload",
    },
    visual: ({ step, active, flipId }) => (
      <BulkImport step={step} active={active} flipId={flipId} />
    ),
    notes: {
      track: [
        "Next, two problems that are really one: data updated by hand, row by row, and no way to do it in bulk. A new term is hundreds of edits.",
        "[3 of 4], [75%], is a placeholder again. What we do know: every term, students change groups, new students join, rooms change, and today each of those is its own form.",
      ],
      feature: [
        "Built: people and rooms in bulk. Upload a CSV of students, of staff, or of rooms, the spreadsheet the college already keeps.",
        "Before anything changes, you see every addition, every change, like a student moving groups, and every removal.",
        "And you apply it in one go. Hundreds of edits become one upload and one check.",
      ],
    },
  },
  {
    id: "glance",
    problems: ["dashboard", "reports"],
    title: "No view of the day.",
    label: "No view of the day",
    evidence: [
      {
        problem: "dashboard",
        value: <Pct t={ph(3)} />,
        label: "can't see which classes ran today",
        source: "Placeholder until we interview admins",
      },
    ],
    quote: {
      text: <Ph>To see which classes ran, I ask IT for a spreadsheet.</Ph>,
      who: <Ph>Management</Ph>,
    },
    feature: {
      id: "dashboard",
      name: "Everything, at a glance",
      tagline:
        "One console for the whole timetable: what's on, what changed, what needs fixing.",
      points: [
        "Live numbers for students, faculty, rooms and classes",
        "Every change, approval and import, as it happens",
        "Warnings about bad data, before anybody trips on it",
      ],
      solves: ["dashboard", "reports"],
      icon: "chart",
    },
    visual: ({ step, active, flipId }) => (
      <AdminDashboard step={step} active={active} flipId={flipId} />
    ),
    notes: {
      track: [
        "And the last two: no view of which classes actually ran today, and a report that means asking IT for a spreadsheet.",
        "[3 of 4], [75%]: placeholder. This is the one Tanisha's coordinators asked for in their own words, a report of the day, so we expect admins to want the same thing, for the whole college.",
      ],
      feature: [
        "Everything, at a glance. One console for the whole timetable, with live numbers: students, faculty, rooms, and the classes running this week.",
        "Every change, approval and import shows up as it happens: a cancelled class, an approved swap, a bulk import. So the view of the day is right there, and a report no longer starts with an email to IT.",
        "And bad data gets flagged before anybody trips over it: here, three rooms with no capacity set, one click from the fix, instead of a student finding it outside the wrong room.",
      ],
    },
  },
];

export const admins: SectionDef = {
  id: "admins",
  title: "System admins",
  speaker: "paras",
  slides: [
    {
      id: "admins",
      title: "System admins",
      notes:
        "Thanks, Tanisha. The last group is the people behind the data: the system admins, and the management above them. To be upfront: we haven't interviewed them yet. They're our next round, so every number in this section is a placeholder, marked as one, until we do.",
      render: ({ step }) => (
        <SectionOpener
          stakeholder="admins"
          photo={{
            src: "/images/stakeholders/admins.jpg",
            alt: "Server racks",
            credit: "Photo: Kevin Ache / Unsplash",
            position: "40% 50%",
          }}
          number="04"
          lede="The people who keep the data right, and the people who need to see what it says."
          step={step}
        />
      ),
    },
    {
      id: "admins-interviews",
      title: "Who we talked to",
      steps: 2,
      notes: [
        "This is the plan for that round, not what we've done: [two] system admins and [two] people from management, over about [a week]. We'll watch a start-of-term data update from start to finish, and time the pages they use most.",
        "And the quotes are stand-ins for what we expect to hear, marked as placeholders. [Swap in real quotes after the interviews.] What they point at is the same: a lot of manual work the system could be doing.",
      ],
      render: ({ step, active }) => (
        <InterviewSummary
          active={active}
          stakeholder="admins"
          title="The week we'll spend with them."
          research={RESEARCH}
          step={step}
        />
      ),
    },
    {
      id: "admins-today",
      title: "Updating the data today",
      steps: 5,
      notes: [
        "Here's how we believe the data gets updated today; we'll check it in the interviews. It starts with a spreadsheet of rooms, courses or students, arriving by mail.",
        "Then every row is typed in by hand.",
        "After every save, a slow page reload. [We're guessing around eight seconds; we'll time it.]",
        "And a mistake gets found later, by someone else: usually a student standing outside the wrong room.",
        "Hundreds of edits a term, and no way to even see the result.",
      ],
      render: ({ step }) => (
        <FlowDiagram
          title="Updating the data, one row at a time."
          accent="var(--admins)"
          nodes={[
            {
              id: "sheet",
              actor: "Spreadsheet",
              action: "Rooms, courses and students arrive by mail",
              icon: "sheet",
            },
            {
              id: "type",
              actor: "Admin",
              action: "Every row typed in by hand",
              icon: "edit",
              wait: <Ph>hours</Ph>,
              tone: "warn",
            },
            {
              id: "wait",
              actor: "Admin",
              action: "A slow reload after every save",
              icon: "hourglass",
              wait: <Ph>~8 s each</Ph>,
              tone: "warn",
            },
            {
              id: "oops",
              actor: "Someone else",
              action: "Finds the mistake later",
              icon: "alert",
              wait: <Ph>days later</Ph>,
              tone: "bad",
            },
          ]}
          outcomeIcon="chart"
          outcome="Hundreds of edits a term, and no dashboard to see the result."
          step={step}
        />
      ),
    },
    {
      id: "admins-problems",
      title: "What we expect to hear",
      notes:
        "These are the problems we expect to hear, from what we've seen ourselves; the interviews will confirm or replace them. Data updated by hand, row by row. No bulk update. No view of which classes ran today. No record of who changed what. A report means asking IT. And every term's timetable built by hand.",
      render: ({ step }) => (
        <ProblemBoard
          stakeholder="admins"
          title="What we expect to hear."
          problems={PROBLEMS}
          step={step}
        />
      ),
    },
    {
      id: "admins-chart",
      title: "Who raised what",
      notes:
        "This is the chart we'll fill in. For now the numbers are illustrative, out of the [four] we plan to interview: building the term by hand for all [4], the manual edits, bulk and the missing view of the day for [3], audit and reports for [2]. Placeholders, all of them, until the interviews.",
      render: ({ step, active }) => (
        <BarChart
          title="What we expect them to tell us."
          panels={[{ data: RAISED }]}
          primary="count"
          source="Illustrative: we have not interviewed admins yet"
          step={step}
          active={active}
        />
      ),
    },
    {
      id: "admins-ranking",
      title: "What hurts most",
      steps: 6,
      notes: [
        "Same ranking as the others, so it's ready when the real numbers come in. They start in the chart's order.",
        "Reach: the share of the [four] who'd raise it. Placeholder numbers.",
        "Severity: our estimate. Five if it costs a class or a deadline, four if it costs time, three if it's friction every time.",
        "Reach times severity: building the term by hand comes out on top, then the manual edits.",
        "Scope: everything here is core, the timetable, attendance and tracking classes, except the audit trail, which is future, a far stretch for now.",
        "Times scope, and they sort again. The audit trail drops to the bottom. At the top: the term built by hand, data edited row by row, and no bulk update. Placeholder ranking, but the shape is what we expect.",
      ],
      render: ({ step }) => (
        <ProblemRanking
          stakeholder="admins"
          title="What hurts most."
          problems={byReach(PROBLEMS)}
          top={3}
          reachSub="of the four we'll ask"
          footnote="Placeholder numbers until we interview admins. Severity: our estimate."
          step={step}
        />
      ),
    },
    ...chapterSlides({
      stakeholder: "admins",
      problems: PROBLEMS,
      chapters: CHAPTERS,
      later: ["audit"],
      recap: {
        title: "Where that leaves admins.",
        label: "Where that leaves admins",
        notes:
          "So, where that leaves admins, on our placeholder numbers. The term's timetable, generated; people and rooms in bulk; and everything at a glance, with the day's numbers and reports on one console. Later, outside what we automate: a full record of who changed what. The admin interviews are next, and they'll tell us if we've got this right.",
      },
    }),
  ],
};
