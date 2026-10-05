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
import { InterviewSummary } from "~/templates/InterviewSummary";
import { PersonaCards } from "~/templates/PersonaCards";
import { ProblemBoard } from "~/templates/ProblemBoard";
import { ProblemRanking } from "~/templates/ProblemRanking";
import { SectionOpener } from "~/templates/SectionOpener";
import { SolutionMap } from "~/templates/SolutionMap";
import { StakeholderMap } from "~/templates/StakeholderMap";
import { VisualSlide } from "~/templates/VisualSlide";
import { Grad } from "~/ui/layout";
import { Ph } from "~/ui/placeholder";
import { OldPhoneFlow } from "~/visuals/students/OldPhoneFlow";
import { PhoneChangeAlert } from "~/visuals/students/PhoneChangeAlert";
import { PhoneFindFaculty } from "~/visuals/students/PhoneFindFaculty";
import { PhoneMyDay } from "~/visuals/students/PhoneMyDay";
import { WeekPattern } from "~/visuals/students/WeekPattern";

/*
 * Section 02 — STUDENTS, presented by Sonal.
 *
 * Sonal: the research lives in the constants below; the slides further down
 * only arrange it. Anything wrapped in <Ph> is a placeholder (dashed amber
 * underline in the deck) — replace it with what you found, then drop the <Ph>.
 * The ranking slide computes its order from `personas` and `severity`, so
 * fixing the data fixes the animation.
 */

const RESEARCH: Research = {
  stats: [
    { value: <Ph>14</Ph>, label: "students interviewed" },
    { value: <Ph>4</Ph>, label: "programmes and years" },
    { value: "7", label: "days with them" },
  ],
  methods: [
    "Interviews about their day",
    "Watching them check the timetable on their phones",
    "A short survey in our year",
    "A mixed focus group",
  ],
  quotes: [
    {
      text: "I checked the timetable, but the cancellation was in a mail I opened later.",
      who: <Ph>BCA, third year</Ph>,
    },
    {
      text: <Ph>I just ask the group. Someone always knows.</Ph>,
      who: <Ph>BBA (IT), second year</Ph>,
    },
    {
      text: <Ph>By the time I saw the mail, the extra class was over.</Ph>,
      who: <Ph>Working student, final year</Ph>,
    },
  ],
};

const PERSONAS: Persona[] = [
  {
    id: "planner",
    name: "The Planner",
    tagline: "Up at six, inbox read, day planned before college.",
    icon: "sun",
    traits: [
      "Reads college mail before getting ready",
      "Writes the day's classes into notes",
      "Rarely misses a change — at 20 minutes a day",
    ],
    share: <Ph>4 of 14 we met</Ph>,
  },
  {
    id: "jit",
    name: "The Just-in-time",
    tagline: "Wakes for the first class; checks the timetable on the way.",
    icon: "alarm",
    traits: [
      "Opens the timetable at 8:50 for a 9:00",
      "Never checks mail in the morning",
      "Finds out about changes at the classroom door",
    ],
    share: <Ph>5 of 14 we met</Ph>,
  },
  {
    id: "follower",
    name: "The Follower",
    tagline: "Doesn't check anything — asks the group.",
    icon: "message",
    traits: [
      "Relies on friends and the class WhatsApp group",
      "Goes wherever the group goes",
      "Only as informed as whoever answers",
    ],
    share: <Ph>3 of 14 we met</Ph>,
  },
  {
    id: "working",
    name: "The Working student",
    tagline: "Has a job; college has to fit around it.",
    icon: "briefcase",
    traits: [
      "Works part- or full-time",
      "Checks only when someone pings them",
      "Misses extra classes most often",
    ],
    share: <Ph>2 of 14 we met</Ph>,
  },
];

const DAYS: DayLane[] = [
  {
    personaId: "planner",
    label: "The Planner",
    events: [
      { at: "06:00", label: "Reads college mail", icon: "mail" },
      {
        at: "06:30",
        label: "Notes the day's classes",
        icon: "edit",
        tone: "good",
      },
      {
        at: "09:00",
        label: "First class, on time",
        icon: "checkCircle",
        tone: "good",
      },
      { at: "16:00", label: "Checks mail again", icon: "mail" },
    ],
  },
  {
    personaId: "jit",
    label: "The Just-in-time",
    events: [
      { at: "08:40", label: "Wakes up", icon: "alarm" },
      {
        at: "08:50",
        label: "Checks timetable, on the way",
        icon: "phone",
        tone: "warn",
      },
      {
        at: "09:00",
        label: "Class moved — finds out at the door",
        icon: "x",
        tone: "bad",
      },
      {
        at: "13:00",
        label: "Hears of the 2 pm change from a friend",
        icon: "message",
        tone: "warn",
      },
    ],
  },
  {
    personaId: "follower",
    label: "The Follower",
    events: [
      { at: "08:00", label: "“Is there class today?”", icon: "message" },
      {
        at: "08:20",
        label: "Waits for a reply",
        icon: "hourglass",
        tone: "warn",
      },
      { at: "09:00", label: "Goes where the group goes", icon: "users" },
    ],
  },
  {
    personaId: "working",
    label: "The Working student",
    events: [
      { at: "07:00", label: "Leaves for work", icon: "briefcase" },
      { at: "13:00", label: "Checks the group at lunch", icon: "message" },
      {
        at: "16:00",
        label: "Extra class held — missed",
        icon: "calendarX",
        tone: "bad",
      },
      { at: "21:00", label: "Catches up at night", icon: "moon" },
    ],
  },
];

// `personas` is reach: which of the four kinds of student run into it.
// `severity` is how much it costs them, 1–5. Both are placeholders until the
// interview tallies are in.
const PROBLEMS: Problem[] = [
  {
    id: "mail-only",
    text: "Changes only arrive by email",
    personas: ["jit", "follower", "working"],
    severity: 5,
  },
  {
    id: "find-mine",
    text: "My classes are buried in the whole college's",
    personas: ["planner", "jit", "follower", "working"],
    severity: 3,
  },
  {
    id: "extra-missed",
    text: "Extra classes get missed",
    personas: ["jit", "follower", "working"],
    severity: 5,
  },
  {
    id: "phone",
    text: "Painful to read on a phone",
    personas: ["planner", "jit", "follower", "working"],
    severity: 3,
  },
  {
    id: "slow",
    text: "Slow on mobile data",
    personas: ["planner", "jit", "follower", "working"],
    severity: 2,
  },
  {
    id: "find-teacher",
    text: "No way to find a teacher",
    personas: ["planner", "jit", "working"],
    severity: 4,
  },
  {
    id: "three-apps",
    text: "Timetable, Moodle and mail disagree",
    personas: ["planner", "jit", "follower", "working"],
    severity: 4,
  },
  {
    id: "ask-friends",
    text: "Depending on friends to know what's on",
    personas: ["follower", "working"],
    severity: 3,
  },
];

const FEATURES: Feature[] = [
  {
    id: "my-day",
    name: "Your day, on one screen",
    tagline:
      "Only your classes — your division, your electives — the moment you open it.",
    points: [
      "Opens on your next class, not on the whole college",
      "Swipe between days — even offline, in the lab",
      "Room, teacher and time to get there, on every class",
    ],
    solves: ["find-mine", "phone", "slow", "three-apps"],
    icon: "calendar",
  },
  {
    id: "alerts",
    name: "Changes come to you",
    tagline:
      "When a class moves, is cancelled or added, your phone knows before you do.",
    points: [
      "A notification the moment a coordinator saves",
      "Your schedule moves the class — no mail to read",
      "Extra classes land in your Google Calendar too",
    ],
    solves: ["mail-only", "extra-missed", "ask-friends"],
    icon: "bell",
  },
  {
    id: "find",
    name: "Find anyone, now",
    tagline:
      "Search a teacher by name: where they are, and when they're next free.",
    points: [
      "Every teacher's day, one search away",
      "“Now in 301, until 12:30”",
      "When they're free — for that quick question",
    ],
    solves: ["find-teacher"],
    icon: "search",
  },
];

const RANKED = rankProblems(PROBLEMS);
const TOP = RANKED.slice(0, 4);
const solvesOf = (f: Feature) =>
  PROBLEMS.filter((p) => f.solves.includes(p.id));

export const students: SectionDef = {
  id: "students",
  title: "Students",
  speaker: "sonal",
  slides: [
    {
      id: "students",
      title: "Students",
      notes:
        "Thanks, Paras. I spent my week with students — the people who read the timetable more than anyone else.",
      render: ({ step }) => (
        <SectionOpener
          stakeholder="students"
          photo={{
            src: "/images/stakeholders/students.jpg",
            alt: "Students checking their phones in a lecture hall",
            credit: "Photo: Vitaly Gariev / Unsplash",
            position: "50% 40%",
          }}
          number="01"
          lede="The people who open the timetable more than anyone — usually on a phone, usually in a hurry."
          step={step}
        />
      ),
    },
    {
      id: "students-interviews",
      title: "Who we talked to",
      steps: 2,
      notes: [
        "I spoke to [fourteen] students across [four] programmes and years. I interviewed them about their day, watched how they actually check the timetable on their phones, ran a short survey in our year, and put a mixed group in one room to hear each other.",
        "A few things they said stuck with me. [Read one quote.] Notice that nobody is complaining about the timetable itself — they're describing the work they do around it.",
      ],
      render: ({ step, active }) => (
        <InterviewSummary
          active={active}
          stakeholder="students"
          eyebrow="Students · Research"
          title="A week with the students."
          research={RESEARCH}
          step={step}
        />
      ),
    },
    {
      id: "students-week",
      title: "Most weeks look the same",
      steps: 3,
      notes: [
        "The first thing we noticed: classes are mostly regular. Week after week, the same subjects, the same slots, the same rooms. So most of the time, students don't need the timetable at all.",
        "The trouble is the week that's different. An extra class gets added — and the only place it's announced is a mail.",
        "And that's the class that gets missed. [Nine of fourteen] students told us they had missed an extra class this term. The regular week isn't the problem. The exception is.",
      ],
      render: ({ step, active }) => (
        <VisualSlide
          eyebrow="Students · Their weeks"
          title={
            <>
              Most weeks look the same. <Grad>The one that doesn&apos;t</Grad>{" "}
              is the problem.
            </>
          }
          visual={<WeekPattern step={step} active={active} />}
          step={step}
        />
      ),
    },
    {
      id: "students-today",
      title: "Checking your classes today",
      steps: 4,
      notes: [
        "So what does checking your classes look like today? You open the timetable site — on mobile data — and wait.",
        "Then you pinch, zoom and scroll sideways through the whole college to find your own division.",
        "Then, because the timetable might be out of date, you switch to Gmail and search for changes.",
        "And most people give up somewhere in there and just ask the class WhatsApp group. Four apps, for one question: where do I need to be?",
      ],
      render: ({ step, active }) => (
        <VisualSlide
          eyebrow="Students · Today"
          title="Where do I need to be?"
          lede="Four apps, for one question."
          visual={<OldPhoneFlow step={step} active={active} />}
          step={step}
        />
      ),
    },
    {
      id: "students-days",
      title: "Four mornings",
      steps: 4,
      notes: [
        "Not every student does this the same way, and that turned out to matter. Some wake up early — at six they've already read their mail and made notes for the day. They rarely miss anything, but it costs them time every morning.",
        "Some wake up for their first class. At nine they check the timetable to confirm there's a lecture — no email, nothing else. If something moved, they find out at the door.",
        "Some don't check anything at all. They rely on their friends — 'is there class today?' in the group — and go where the group goes.",
        "And some are working. They have a job, and very little time to focus on college. They check when someone pings them, and they're the ones who miss extra classes most.",
      ],
      render: ({ step, active }) => (
        <DayTimeline
          active={active}
          stakeholder="students"
          eyebrow="Students · Their days"
          title="Four ways to start the same day."
          lanes={DAYS}
          step={step}
        />
      ),
    },
    {
      id: "students-groups",
      title: "Four kinds of student",
      notes:
        "So we grouped students into four kinds: the Planner, the Just-in-time, the Follower, and the Working student. Every problem we heard, we checked against all four — because a fix that only helps the Planner helps the people who need it least.",
      render: ({ step, active }) => (
        <PersonaCards
          active={active}
          stakeholder="students"
          eyebrow="Students · Who they are"
          title="Four kinds of student."
          personas={PERSONAS}
          step={step}
        />
      ),
    },
    {
      id: "students-problems",
      title: "Everything they told us",
      notes:
        "Then we wrote down every problem anyone mentioned — all of them, in the order we heard them. Changes only by mail. Their own classes buried in everybody else's. Extra classes missed. No way to find a teacher. Three apps that disagree.",
      render: ({ step }) => (
        <ProblemBoard
          stakeholder="students"
          eyebrow="Students · What we heard"
          title="Everything they told us."
          problems={PROBLEMS}
          step={step}
        />
      ),
    },
    {
      id: "students-ranking",
      title: "What hurts most",
      steps: 4,
      notes: [
        "But not all problems are equal. So we ranked them on two things.",
        "First, reach: how many of the four kinds of student run into it. A problem only the Planner has is a smaller problem than one everybody has.",
        "Second, severity: what it costs when it happens. Waiting for a slow page is annoying. Missing a class is a different thing entirely.",
        "Multiply the two, and this is the order. At the top: three apps that disagree, changes that only come by mail, extra classes getting missed, and no way to find a teacher. That's what we designed for first. [Placeholder ranking — swap in the interview tallies.]",
      ],
      render: ({ step }) => (
        <ProblemRanking
          stakeholder="students"
          eyebrow="Students · Ranking"
          title="What hurts most."
          problems={PROBLEMS}
          personas={PERSONAS}
          top={4}
          step={step}
        />
      ),
    },
    {
      id: "students-solutions",
      title: "What fixes each problem",
      steps: 2,
      notes: [
        "Here are the top problems again.",
        "And here's what answers each one. Three features — and every one of them is about the same idea: the timetable should know who you are, and tell you when something changes.",
      ],
      render: ({ step }) => (
        <SolutionMap
          stakeholder="students"
          eyebrow="Students · Solutions"
          title="One answer for each."
          problems={TOP}
          features={FEATURES}
          step={step}
        />
      ),
    },
    {
      id: "students-feature-day",
      title: "Your day, on one screen",
      steps: 3,
      notes: [
        "First: your day, on one screen. Open Plannr and you see your classes — your division, your electives — and nothing else. It opens on your next class.",
        "Swipe to tomorrow, and the day slides across. It works offline too — even down in the lab.",
        "And every class tells you the room, the teacher, and how long you've got to get there.",
      ],
      render: ({ step, active }) => {
        const f = FEATURES[0]!;
        return (
          <FeatureShowcase
            stakeholder="students"
            feature={f}
            number={1}
            solves={solvesOf(f)}
            visual={
              <PhoneMyDay
                step={step}
                active={active}
                flipId="students-device"
              />
            }
            step={step}
          />
        );
      },
    },
    {
      id: "students-feature-alerts",
      title: "Changes come to you",
      steps: 3,
      notes: [
        "Second: changes come to you. The moment a coordinator moves a class, your phone tells you — you don't go looking. And you only hear about the changes that affect you.",
        "Open it, and your schedule has already moved the class. No mail to read, nothing to reconcile.",
        "And when an extra class is added, it lands in your own Google Calendar too — so even students who never open Plannr have it.",
      ],
      render: ({ step, active }) => {
        const f = FEATURES[1]!;
        return (
          <FeatureShowcase
            stakeholder="students"
            feature={f}
            number={2}
            solves={solvesOf(f)}
            visual={
              <PhoneChangeAlert
                step={step}
                active={active}
                flipId="students-device"
              />
            }
            step={step}
          />
        );
      },
    },
    {
      id: "students-feature-find",
      title: "Find anyone, now",
      steps: 3,
      notes: [
        "Third: find anyone. Type a teacher's name, and there they are.",
        "Tap one, and you get their day — where they are right now, and until when. Not a course timetable you have to decode.",
        "And when they're next free, for that quick question. What took a hundred cells takes one search.",
      ],
      render: ({ step, active }) => {
        const f = FEATURES[2]!;
        return (
          <FeatureShowcase
            stakeholder="students"
            feature={f}
            number={3}
            solves={solvesOf(f)}
            visual={
              <PhoneFindFaculty
                step={step}
                active={active}
                flipId="students-device"
              />
            }
            step={step}
          />
        );
      },
    },
    {
      id: "students-handoff",
      title: "Over to Ravya",
      notes:
        "That's everything for students. Over to Ravya, to tell you what's improved for faculty.",
      render: ({ step }) => (
        <StakeholderMap
          eyebrow="Next"
          title="That's students."
          highlight="faculty"
          caption="Over to Ravya — faculty."
          step={step}
        />
      ),
    },
  ],
};
