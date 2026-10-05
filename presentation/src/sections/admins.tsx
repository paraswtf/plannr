import {
  rankProblems,
  type Feature,
  type Persona,
  type Problem,
  type Research,
} from "~/content/types";
import type { SectionDef } from "~/deck/types";
import { FeatureShowcase } from "~/templates/FeatureShowcase";
import { FlowDiagram } from "~/templates/FlowDiagram";
import { InterviewSummary } from "~/templates/InterviewSummary";
import { ProblemBoard } from "~/templates/ProblemBoard";
import { ProblemRanking } from "~/templates/ProblemRanking";
import { SectionOpener } from "~/templates/SectionOpener";
import { SolutionMap } from "~/templates/SolutionMap";
import { Ph } from "~/ui/placeholder";
import { AdminDashboard } from "~/visuals/admins/AdminDashboard";
import { BulkImport } from "~/visuals/admins/BulkImport";
import { SpeedRace } from "~/visuals/admins/SpeedRace";

/*
 * Section 05 — SYSTEM ADMINS AND MANAGEMENT, presented by Paras.
 *
 * Shorter than the others: no day timeline, straight from what the job is
 * today to what hurts and what fixes it.
 */

const RESEARCH: Research = {
  stats: [
    { value: <Ph>2</Ph>, label: "system admins" },
    { value: <Ph>2</Ph>, label: "people from management" },
    { value: "7", label: "days with them" },
  ],
  methods: [
    "Watching a start-of-term data update",
    "Interviews with IT and management",
    "Timing the pages they use most",
  ],
  quotes: [
    {
      text: "They booked a room with no projector and then asked to move.",
      who: <Ph>Administration</Ph>,
    },
    {
      text: <Ph>A new term is a week of typing the same spreadsheet in.</Ph>,
      who: <Ph>System admin</Ph>,
    },
    {
      text: (
        <Ph>{"I can't tell you how full our rooms are without asking IT."}</Ph>
      ),
      who: <Ph>Management</Ph>,
    },
  ],
};

const PERSONAS: Persona[] = [
  {
    id: "it",
    name: "System admin",
    tagline: "Keeps the data, and the system, right.",
    icon: "database",
    traits: [
      "Updates rooms, courses and people",
      "Fixes data one row at a time",
      "Hears about it when pages are slow",
    ],
  },
  {
    id: "mgmt",
    name: "Management",
    tagline: "Needs to see how the timetable is really working.",
    icon: "chart",
    traits: [
      "How full the rooms are",
      "Who changed what, and when",
      "Reports, without asking IT",
    ],
  },
];

const PROBLEMS: Problem[] = [
  {
    id: "manual",
    text: "Data updated by hand, row by row",
    personas: ["it"],
    severity: 5,
  },
  {
    id: "bulk",
    text: "No bulk update: a term is hundreds of edits",
    personas: ["it"],
    severity: 5,
  },
  {
    id: "dashboard",
    text: "No dashboard: no view of what's happening",
    personas: ["it", "mgmt"],
    severity: 4,
  },
  {
    id: "slow",
    text: "Slow pages, for everyone",
    personas: ["it", "mgmt"],
    severity: 3,
  },
  {
    id: "audit",
    text: "No record of who changed what",
    personas: ["it", "mgmt"],
    severity: 3,
  },
  {
    id: "reports",
    text: "A report means asking IT for a spreadsheet",
    personas: ["mgmt"],
    severity: 3,
  },
];

const FEATURES: Feature[] = [
  {
    id: "dashboard",
    name: "Everything, at a glance",
    tagline:
      "One console for the whole timetable: what's on, what changed, what needs fixing.",
    points: [
      "Live numbers for students, faculty, rooms and classes",
      "Every change, approval and import, as it happens",
      "Warnings about bad data, before anybody trips on it",
    ],
    solves: ["dashboard", "audit", "reports"],
    icon: "chart",
  },
  {
    id: "import",
    name: "A term's changes in one import",
    tagline:
      "Drop in a spreadsheet; check exactly what will change; apply it once.",
    points: [
      "Upload the college's own spreadsheet as it is",
      "Preview every addition, change and removal",
      "Apply it in one click, undo it in one",
    ],
    solves: ["manual", "bulk"],
    icon: "upload",
  },
  {
    id: "speed",
    name: "Fast, on every screen",
    tagline:
      "Built to load your day, not the whole college, on a phone on mobile data.",
    points: [
      "Loads your day, not the whole college",
      "Done before the old site draws its header",
      "Installable, and still there offline",
    ],
    solves: ["slow"],
    icon: "zap",
  },
];

const RANKED = rankProblems(PROBLEMS);
const TOP = RANKED.slice(0, 5);
const solvesOf = (f: Feature) =>
  PROBLEMS.filter((p) => f.solves.includes(p.id));

export const admins: SectionDef = {
  id: "admins",
  title: "System admins",
  speaker: "paras",
  slides: [
    {
      id: "admins",
      title: "System admins",
      notes:
        "Thanks, Tanisha. My week was with the people nobody thinks about until something breaks: the system admins, and the management behind them.",
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
        "I spoke to [two] system admins and [two] people from management, watched a start-of-term data update from start to finish, and timed the pages they use most.",
        "[Read one quote.] Every one of these is a manual job that the system could be doing.",
      ],
      render: ({ step, active }) => (
        <InterviewSummary
          active={active}
          stakeholder="admins"
          title="A week with the people behind it."
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
        "Here's how the data gets updated today. It starts with a spreadsheet — rooms, courses, students — arriving by mail.",
        "Then every row is typed in by hand.",
        "After every save, a slow page reload. [Measure it — we're guessing around eight seconds.]",
        "And mistakes get found later, by someone else — usually a student standing outside the wrong room.",
        "Hundreds of edits a term, and no dashboard to even see the result.",
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
              wait: "hours",
              tone: "warn",
            },
            {
              id: "wait",
              actor: "Admin",
              action: "A slow reload after every save",
              icon: "hourglass",
              wait: "~8 s each",
              tone: "warn",
            },
            {
              id: "oops",
              actor: "Someone else",
              action: "Finds the mistake later",
              icon: "alert",
              wait: "days later",
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
      title: "Everything they told us",
      notes:
        "What they told us: data updated by hand, row by row. No way to update in bulk. No dashboard. Slow pages. No record of who changed what. And for management, every report starts with an email to IT.",
      render: ({ step }) => (
        <ProblemBoard
          stakeholder="admins"
          title="Everything they told us."
          problems={PROBLEMS}
          step={step}
        />
      ),
    },
    {
      id: "admins-ranking",
      title: "What hurts most",
      steps: 4,
      notes: [
        "Same ranking.",
        "Reach: the admins, management, or both.",
        "Severity: what it costs.",
        "No dashboard comes out on top, because it hurts both groups. But look at the manual work further down: it only hits the admins, so it ranks lower — and yet it's the most severe thing on the list. [Placeholder ranking — swap in real tallies.]",
      ],
      render: ({ step }) => (
        <ProblemRanking
          stakeholder="admins"
          title="What hurts most."
          problems={PROBLEMS}
          personas={PERSONAS}
          top={5}
          step={step}
        />
      ),
    },
    {
      id: "admins-solutions",
      title: "What fixes each problem",
      steps: 2,
      notes: ["The top five.", "Three features. Let me show you."],
      render: ({ step }) => (
        <SolutionMap
          stakeholder="admins"
          title="One answer for each."
          problems={TOP}
          features={FEATURES}
          step={step}
        />
      ),
    },
    {
      id: "admins-feature-dashboard",
      title: "Everything, at a glance",
      steps: 3,
      notes: [
        "First: everything at a glance. One console with live numbers — students, faculty, rooms, classes this week.",
        "Every change, approval and import shows up as it happens, with who did it.",
        "And bad data gets flagged before anybody trips over it.",
      ],
      render: ({ step, active }) => {
        const f = FEATURES[0]!;
        return (
          <FeatureShowcase
            stakeholder="admins"
            feature={f}
            number={1}
            solves={solvesOf(f)}
            visual={
              <AdminDashboard
                step={step}
                active={active}
                flipId="admins-device"
              />
            }
            step={step}
          />
        );
      },
    },
    {
      id: "admins-feature-import",
      title: "A term's changes in one import",
      steps: 3,
      notes: [
        "Second: a whole term's changes in one import. Drop in the college's own spreadsheet, exactly as it is.",
        "Before anything changes, you see every addition, change and removal.",
        "Apply it in one click — and undo it in one, if something's wrong.",
      ],
      render: ({ step, active }) => {
        const f = FEATURES[1]!;
        return (
          <FeatureShowcase
            stakeholder="admins"
            feature={f}
            number={2}
            solves={solvesOf(f)}
            visual={
              <BulkImport step={step} active={active} flipId="admins-device" />
            }
            step={step}
          />
        );
      },
    },
    {
      id: "admins-feature-speed",
      title: "Fast, on every screen",
      steps: 3,
      notes: [
        "And third: fast, on every screen. Same phone, same mobile network — today's site against Plannr. Plannr only loads your day, not the whole college.",
        "So it's done before the old site has even drawn its header — [twenty times] faster on mobile data. [Replace with measured timings.]",
        "And it's installable, and it keeps your day offline — so it still works down in the lab.",
      ],
      render: ({ step, active }) => {
        const f = FEATURES[2]!;
        return (
          <FeatureShowcase
            stakeholder="admins"
            feature={f}
            number={3}
            solves={solvesOf(f)}
            visual={<SpeedRace step={step} active={active} />}
            step={step}
          />
        );
      },
    },
  ],
};
