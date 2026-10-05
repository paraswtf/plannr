import {
  rankProblems,
  type DayLane,
  type Feature,
  type Persona,
  type Problem,
  type Research,
} from "~/content/types";
import type { SectionDef } from "~/deck/types";
import { DayTimeline } from "~/templates/DayTimeline";
import { FeatureShowcase } from "~/templates/FeatureShowcase";
import { FlowDiagram } from "~/templates/FlowDiagram";
import { InterviewSummary } from "~/templates/InterviewSummary";
import { PersonaCards } from "~/templates/PersonaCards";
import { ProblemBoard } from "~/templates/ProblemBoard";
import { ProblemRanking } from "~/templates/ProblemRanking";
import { SectionOpener } from "~/templates/SectionOpener";
import { SolutionMap } from "~/templates/SolutionMap";
import { StakeholderMap } from "~/templates/StakeholderMap";
import { Ph } from "~/ui/placeholder";
import { LectureLog } from "~/visuals/faculty/LectureLog";
import { RequestLecture } from "~/visuals/faculty/RequestLecture";
import { TeachingWeek } from "~/visuals/faculty/TeachingWeek";

/*
 * Section 03 — FACULTY, presented by Ravya.
 *
 * Ravya: same shape as the students section. Two kinds of faculty — internal
 * (full-time) and external (guest lecturers, or faculty from another college,
 * paid per lecture). Replace every <Ph> with what you found, and the ranking
 * re-sorts itself from `personas` and `severity`.
 */

const RESEARCH: Research = {
  stats: [
    { value: <Ph>6</Ph>, label: "internal faculty" },
    { value: <Ph>3</Ph>, label: "external faculty" },
    { value: "7", label: "days with them" },
  ],
  methods: [
    "Interviews about their teaching week",
    "Sitting in on a scheduling request",
    "Following one lecture from request to room",
  ],
  quotes: [
    {
      text: "I teach several groups, not just one division.",
      who: <Ph>Internal faculty, BCA</Ph>,
    },
    {
      text: "The room had no projector.",
      who: <Ph>Internal faculty, BBA (IT)</Ph>,
    },
    {
      text: <Ph>I find out my lecture moved when I get here.</Ph>,
      who: <Ph>Visiting faculty</Ph>,
    },
  ],
};

const PERSONAS: Persona[] = [
  {
    id: "internal",
    name: "Internal faculty",
    tagline: "Full-time, on campus every day, teaching several groups.",
    icon: "building",
    traits: [
      "Teaches whole divisions and mixed elective groups",
      "Plans the day from the main page and the inbox",
      "Mails the class when a lecture is cancelled",
    ],
    share: <Ph>6 we interviewed</Ph>,
  },
  {
    id: "external",
    name: "External faculty",
    tagline: "A guest lecturer or visiting faculty, paid per lecture.",
    icon: "briefcase",
    traits: [
      "On campus only on their lecture days",
      "Gets told their slots; has little say in them",
      "Keeps their own count of lectures, for payment",
    ],
    share: <Ph>3 we interviewed</Ph>,
  },
];

const DAYS: DayLane[] = [
  {
    personaId: "internal",
    label: "Internal faculty",
    sublabel: "Full-time",
    events: [
      {
        at: "08:30",
        label: "Notes the day from the main page and mail",
        icon: "mail",
      },
      {
        at: "09:00",
        label: "Lecture, BCA-A",
        icon: "checkCircle",
        tone: "good",
      },
      {
        at: "11:00",
        label: "Room has no projector",
        icon: "monitor",
        tone: "bad",
      },
      {
        at: "13:00",
        label: "Mails a cancellation to 60 students",
        icon: "mail",
        tone: "warn",
      },
      {
        at: "15:00",
        label: "Asks for an extra slot",
        icon: "message",
        tone: "warn",
      },
    ],
  },
  {
    personaId: "external",
    label: "External faculty",
    sublabel: "Paid per lecture",
    events: [
      { at: "07:00", label: "Day job", icon: "briefcase" },
      { at: "16:30", label: "Travels to campus", icon: "mapPin" },
      {
        at: "17:30",
        label: "Room changed, nobody said",
        icon: "door",
        tone: "bad",
      },
      {
        at: "19:00",
        label: "Notes the lecture down, for payment",
        icon: "edit",
        tone: "warn",
      },
    ],
  },
];

const PROBLEMS: Problem[] = [
  {
    id: "slot",
    text: "Can't schedule a lecture without the coordinator",
    personas: ["internal", "external"],
    severity: 4,
  },
  {
    id: "room-kit",
    text: "Rooms lack what the session needs",
    personas: ["internal", "external"],
    severity: 3,
  },
  {
    id: "mail-cancel",
    text: "Cancelling means mailing every student",
    personas: ["internal", "external"],
    severity: 3,
  },
  {
    id: "many-groups",
    text: "Many groups, no single view of them",
    personas: ["internal"],
    severity: 3,
  },
  {
    id: "not-told",
    text: "Not told when their own class moves",
    personas: ["internal", "external"],
    severity: 5,
  },
  {
    id: "payment",
    text: "Lectures counted by hand, for payment",
    personas: ["external"],
    severity: 4,
  },
  {
    id: "free-room",
    text: "No way to find a free room",
    personas: ["internal"],
    severity: 2,
  },
];

const FEATURES: Feature[] = [
  {
    id: "week",
    name: "Your teaching, in one week",
    tagline:
      "Every division and elective you teach, on one screen that changes when they do.",
    points: [
      "Every division and elective you teach, in one week",
      "A combined lecture shows once, with every group in it",
      "Cancel once. Your students are told for you.",
    ],
    solves: ["many-groups", "not-told", "mail-cancel"],
    icon: "calendar",
  },
  {
    id: "request",
    name: "Schedule it yourself",
    tagline:
      "Pick a slot and a room that work. No calls, no waiting on a reply.",
    points: [
      "Only clash-free slots, in rooms with what you need",
      "Booked in two taps, or sent for approval",
      "Every student in the group hears about it",
    ],
    solves: ["slot", "room-kit", "free-room"],
    icon: "plus",
  },
  {
    id: "log",
    name: "Every lecture, counted",
    tagline: "For external faculty: the lectures you take, tallied for you.",
    points: [
      "Logged the moment attendance is taken",
      "Cancelled lectures drop out on their own",
      "A monthly statement, ready for accounts",
    ],
    solves: ["payment"],
    icon: "receipt",
  },
];

const RANKED = rankProblems(PROBLEMS);
const TOP = RANKED.slice(0, 5);
const solvesOf = (f: Feature) =>
  PROBLEMS.filter((p) => f.solves.includes(p.id));

export const faculty: SectionDef = {
  id: "faculty",
  title: "Faculty",
  speaker: "ravya",
  slides: [
    {
      id: "faculty",
      title: "Faculty",
      notes:
        "Thanks, Sonal. I spent my week with faculty — and the first thing I learned is that 'faculty' is really two very different jobs.",
      render: ({ step }) => (
        <SectionOpener
          stakeholder="faculty"
          photo={{
            src: "/images/stakeholders/faculty.jpg",
            alt: "A lecturer teaching a class",
            credit: "Photo: Vitaly Gariev / Unsplash",
            position: "50% 30%",
          }}
          number="02"
          lede="The people the timetable is built around, who have the least say in it."
          step={step}
        />
      ),
    },
    {
      id: "faculty-interviews",
      title: "Who we talked to",
      steps: 2,
      notes: [
        "I interviewed [six] internal faculty and [three] external faculty, sat in while one of them asked for an extra lecture, and followed that lecture from the request all the way to the room.",
        "[Read one quote.] Two of these are lines from the empathy maps in our report — they came up again and again.",
      ],
      render: ({ step, active }) => (
        <InterviewSummary
          active={active}
          stakeholder="faculty"
          title="A week with the faculty."
          research={RESEARCH}
          step={step}
        />
      ),
    },
    {
      id: "faculty-types",
      title: "Internal and external",
      notes:
        "Internal faculty are full-time. They're here every day, and they teach several groups at once — whole divisions, and electives that mix students from different divisions. External faculty are guest lecturers, or faculty who come in from another college, and they're paid per lecture. They're only on campus on their lecture days, and they have almost no say in their slots.",
      render: ({ step, active }) => (
        <PersonaCards
          active={active}
          stakeholder="faculty"
          title="Two kinds of faculty. Two different jobs."
          personas={PERSONAS}
          step={step}
        />
      ),
    },
    {
      id: "faculty-days",
      title: "A day in their life",
      steps: 2,
      notes: [
        "An internal faculty member starts the day by writing down their classes from the main page and the inbox. By eleven they're in a room without a projector. At one they're mailing sixty students about a cancellation. At three they're asking the coordinator for a slot.",
        "An external faculty member has a whole other job first. They travel in for the evening lecture — and find the room has changed, and nobody told them. Afterwards, they write the lecture down themselves, because that's how they get paid.",
      ],
      render: ({ step, active }) => (
        <DayTimeline
          active={active}
          stakeholder="faculty"
          title="Same college, very different days."
          lanes={DAYS}
          from={7}
          to={21}
          step={step}
        />
      ),
    },
    {
      id: "faculty-today",
      title: "Scheduling one lecture today",
      steps: 5,
      notes: [
        "Here's what scheduling one extra lecture looks like today. First, the teacher reads the timetable to guess at a free slot.",
        "Then they call or message the coordinator — and wait.",
        "The coordinator checks clashes and rooms by hand and edits the timetable.",
        "And then the teacher mails the students themselves, just to be safe.",
        "Two people, two mails, one lecture — and the room still might not have a projector.",
      ],
      render: ({ step }) => (
        <FlowDiagram
          title="One extra lecture, two people, two mails."
          accent="var(--faculty)"
          nodes={[
            {
              id: "guess",
              actor: "Faculty",
              action: "Reads the timetable to guess a free slot",
              icon: "search",
            },
            {
              id: "ask",
              actor: "Faculty",
              action: "Calls or messages the coordinator",
              icon: "message",
              wait: "waits for a reply",
              tone: "warn",
            },
            {
              id: "edit",
              actor: "Coordinator",
              action: "Checks clashes and rooms by hand, edits it",
              icon: "clipboard",
              wait: "hours to a day",
            },
            {
              id: "mail",
              actor: "Faculty",
              action: "Mails the students too, to be safe",
              icon: "mail",
              wait: "the same news, twice",
              tone: "bad",
            },
          ]}
          outcome="And the room still might not have a projector."
          step={step}
        />
      ),
    },
    {
      id: "faculty-problems",
      title: "Everything they told us",
      notes:
        "These are all the problems faculty told us about. Not being able to schedule anything without the coordinator. Rooms without what the session needs. Mailing every student to cancel. And for external faculty — counting their own lectures, by hand, to get paid.",
      render: ({ step }) => (
        <ProblemBoard
          stakeholder="faculty"
          title="Everything they told us."
          problems={PROBLEMS}
          step={step}
        />
      ),
    },
    {
      id: "faculty-ranking",
      title: "What hurts most",
      steps: 4,
      notes: [
        "Same method as Sonal: reach and severity.",
        "Reach here is simple — does it hit internal faculty, external faculty, or both.",
        "Severity: what it costs them when it happens.",
        "And the top of the list: not being told when their own class moves, not being able to schedule a lecture themselves, rooms without what the session needs, mailing every student to cancel — and, for external faculty, counting lectures by hand to get paid. [Placeholder ranking — swap in the interview tallies.]",
      ],
      render: ({ step }) => (
        <ProblemRanking
          stakeholder="faculty"
          title="What hurts most."
          problems={PROBLEMS}
          personas={PERSONAS}
          top={5}
          step={step}
        />
      ),
    },
    {
      id: "faculty-solutions",
      title: "What fixes each problem",
      steps: 2,
      notes: [
        "The top five.",
        "And three features that answer them. Let me show you each.",
      ],
      render: ({ step }) => (
        <SolutionMap
          stakeholder="faculty"
          title="One answer for each."
          problems={TOP}
          features={FEATURES}
          step={step}
        />
      ),
    },
    {
      id: "faculty-feature-week",
      title: "Your teaching, in one week",
      steps: 3,
      notes: [
        "First: your teaching, in one week. Every division and every elective you teach, colour-coded, on one screen — and when one of your classes changes, it changes here first.",
        "A combined lecture — students from two divisions in one room — shows up once, with both groups on it. No more matching two timetables by hand.",
        "And when you need to cancel, you cancel once. Your students are told for you.",
      ],
      render: ({ step, active }) => {
        const f = FEATURES[0]!;
        return (
          <FeatureShowcase
            stakeholder="faculty"
            feature={f}
            number={1}
            solves={solvesOf(f)}
            visual={
              <TeachingWeek
                step={step}
                active={active}
                flipId="faculty-device"
              />
            }
            step={step}
          />
        );
      },
    },
    {
      id: "faculty-feature-request",
      title: "Schedule it yourself",
      steps: 3,
      notes: [
        "Second: schedule it yourself. Pick the group and the week, and Plannr shows you only the slots that work — no clash, and a room with the projector you need.",
        "Tap one, and it's booked. Or, if the college wants a coordinator to sign off, it's sent for approval in the same tap.",
        "Every student in the group hears about it. Nobody writes a mail.",
      ],
      render: ({ step, active }) => {
        const f = FEATURES[1]!;
        return (
          <FeatureShowcase
            stakeholder="faculty"
            feature={f}
            number={2}
            solves={solvesOf(f)}
            visual={
              <RequestLecture
                step={step}
                active={active}
                flipId="faculty-device"
              />
            }
            step={step}
          />
        );
      },
    },
    {
      id: "faculty-feature-log",
      title: "Every lecture, counted",
      steps: 3,
      notes: [
        "And third, for external faculty: every lecture, counted. When attendance is taken, the lecture is logged.",
        "If a lecture is cancelled, it drops out of the count on its own.",
        "And at the end of the month there's a statement, ready for accounts. No notebook, no arguments.",
      ],
      render: ({ step, active }) => {
        const f = FEATURES[2]!;
        return (
          <FeatureShowcase
            stakeholder="faculty"
            feature={f}
            number={3}
            solves={solvesOf(f)}
            visual={
              <LectureLog step={step} active={active} flipId="faculty-device" />
            }
            step={step}
          />
        );
      },
    },
    {
      id: "faculty-handoff",
      title: "Over to Tanisha",
      notes:
        "That's faculty. Now over to Tanisha — for the people who actually run the timetable.",
      render: ({ step }) => (
        <StakeholderMap
          title="That's faculty."
          highlight="coordinators"
          caption="Over to Tanisha, for coordinators."
          step={step}
        />
      ),
    },
  ],
};
