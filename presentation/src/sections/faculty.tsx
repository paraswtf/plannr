import { Of, Projected } from "~/content/research";
import { OUT_OF_SCOPE } from "~/content/team";
import {
  byReach,
  type DayLane,
  type Persona,
  type Problem,
  type Research,
} from "~/content/types";
import type { SectionDef } from "~/deck/types";
import { BarChart, type BarDatum } from "~/templates/BarChart";
import { DayTimeline } from "~/templates/DayTimeline";
import { FlowDiagram } from "~/templates/FlowDiagram";
import { InterviewSummary } from "~/templates/InterviewSummary";
import { PersonaCards } from "~/templates/PersonaCards";
import { ProblemBoard } from "~/templates/ProblemBoard";
import { ProblemRanking } from "~/templates/ProblemRanking";
import { SectionOpener } from "~/templates/SectionOpener";
import { StakeholderMap } from "~/templates/StakeholderMap";
import { AttendanceRegister } from "~/visuals/faculty/AttendanceRegister";
import { AvailabilityOnce } from "~/visuals/faculty/AvailabilityOnce";
import { MarksBook } from "~/visuals/faculty/MarksBook";
import { RequestLecture } from "~/visuals/faculty/RequestLecture";
import { TeachingWeek } from "~/visuals/faculty/TeachingWeek";

import { chapterSlides, type Chapter } from "./_chapters";

/*
 * Section 03: FACULTY, presented by Ravya.
 *
 * The first round: 10 faculty, 5 at SICSR (F1 F3 F5 F7 F9) and 5 at SIG
 * (F2 F4 F6 F8 F10), 6 in person and 4 by phone, 12 to 23 September 2026.
 * One of them (F5) is visiting faculty. Every tally below is as collected,
 * and the slides and the speaker notes give the same numbers.
 *
 * Severity is the faculty's own rating (high 5, medium 3, low 1): for each
 * person the highest among the items merged into a problem, then the mean of
 * the people who raised it, rounded.
 */

/** The people we interviewed. */
const SAMPLE = 10;
const of = (count: number) => ({ count, of: SAMPLE });

const RESEARCH: Research = {
  stats: [
    { value: <Projected n={SAMPLE} />, label: "faculty interviewed" },
    { value: "2", label: "institutes, SICSR and SIG" },
    { value: "12", label: "days, 12 to 23 September" },
  ],
  methods: [
    "In person and by phone",
    "Their day, then what would help",
    "A handwritten timetable on most desks",
  ],
  quotes: [
    {
      text: "The lecture ends before I finish all the admin.",
      who: "Faculty, SIG",
    },
    {
      text: "For every small decision I have to go to the coordinator.",
      who: "Faculty, SIG",
    },
    {
      text: "By now I just remember my schedule.",
      who: "Faculty, SIG",
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
      "Opens the timetable, Moodle, the portal and mail",
      "Sets up and takes attendance after every lecture",
      "Merges marks from Forms and Moodle in Excel",
    ],
    share: (
      <>
        <Of t={of(9)} /> we interviewed
      </>
    ),
  },
  {
    id: "visiting",
    name: "Visiting faculty",
    tagline: "Teaches here and at other institutes.",
    icon: "briefcase",
    traits: [
      "Phones in their availability, then waits for timings",
      "Every change goes back through the coordinator",
      "Keeps one calendar across institutes",
    ],
    share: (
      <>
        <Of t={of(1)} /> we interviewed
      </>
    ),
  },
];

/**
 * Composites of the interviews: illustrative days, not one person's. What
 * their teaching day holds, hour by hour, and how they keep track of it.
 */
const DAYS: DayLane[] = [
  {
    personaId: "internal",
    label: "Internal faculty",
    sublabel: "Full-time",
    events: [
      { at: "08:00", label: "Checks the day's timetable", icon: "calendar" },
      { at: "09:00", label: "Lecture", icon: "book" },
      {
        at: "10:00",
        label: "Takes attendance on the portal",
        icon: "clipboard",
      },
      { at: "11:30", label: "Lecture, another group", icon: "book" },
      { at: "13:30", label: "Collects marks in Excel", icon: "sheet" },
      { at: "16:00", label: "Mails the students", icon: "mail" },
    ],
  },
  {
    personaId: "visiting",
    label: "Visiting faculty",
    sublabel: "Several institutes",
    events: [
      { at: "08:00", label: "Teaching at another institute", icon: "building" },
      { at: "12:00", label: "Phones in their availability", icon: "phone" },
      {
        at: "14:00",
        label: "Gets timings from the coordinator",
        icon: "message",
      },
      { at: "17:30", label: "Evening lecture", icon: "book" },
      { at: "19:00", label: "Puts it all in one calendar", icon: "calendar" },
    ],
  },
];

/** In the order they told us. */
const PROBLEMS: Problem[] = [
  {
    id: "switching",
    text: "Hopping between slow sites all day",
    personas: ["internal"],
    reach: of(3), // F1 F6 F7
    ratings: { high: 2, medium: 1, low: 0 },
    severity: 4,
    scope: "core",
  },
  {
    id: "attendance",
    text: "Attendance set up and taken by hand, every lecture",
    personas: ["internal"],
    reach: of(2), // F2 F8
    ratings: { high: 2, medium: 0, low: 0 },
    severity: 5,
    scope: "core",
  },
  {
    id: "deadlines",
    text: "Assignment deadlines scattered across platforms",
    personas: ["internal"],
    reach: of(2), // F3 F7
    ratings: { high: 1, medium: 0, low: 1 },
    severity: 3,
    scope: "core",
  },
  {
    id: "one-place",
    text: "No single place where changes reach them",
    personas: ["internal"],
    reach: of(2), // F7 F10
    ratings: { high: 0, medium: 2, low: 0 },
    severity: 3,
    scope: "core",
  },
  {
    id: "marks",
    text: "Marks gathered from many places, checked twice",
    personas: ["internal"],
    reach: of(2), // F4 F9
    ratings: { high: 2, medium: 0, low: 0 },
    severity: 5,
    scope: "core",
  },
  {
    id: "logins",
    text: "A different login for every system",
    personas: ["internal"],
    reach: of(2), // F1 F7
    ratings: { high: 2, medium: 0, low: 0 },
    severity: 5,
    scope: "future",
  },
  {
    id: "coordinator",
    text: "Every change goes through the coordinator",
    personas: ["internal", "visiting"],
    reach: of(2), // F5 F10
    ratings: { high: 2, medium: 0, low: 0 },
    severity: 5,
    scope: "core",
  },
  {
    id: "availability",
    text: "Visiting faculty repeat their availability",
    personas: ["visiting"],
    reach: of(1), // F5
    ratings: { high: 1, medium: 0, low: 0 },
    severity: 5,
    scope: "core",
  },
];

/** The tools they named for their day, one count per person. */
const APPS: BarDatum[] = [
  { id: "moodle", label: "Moodle", tally: of(7) },
  { id: "gmail", label: "Gmail", tally: of(5) },
  {
    id: "timetable",
    label: "The timetable site",
    tally: of(4),
    highlight: true,
  },
  {
    id: "attendance",
    label: "The attendance portal",
    tally: of(4),
    highlight: true,
  },
  { id: "forms", label: "Google Forms", tally: of(4) },
  { id: "whatsapp", label: "WhatsApp", tally: of(4) },
  { id: "excel", label: "Excel", tally: of(2), highlight: true },
  { id: "calls", label: "Phone calls", tally: of(1), highlight: true },
];

/** Each problem as a bar, split by how the people who raised it rated it. */
const RAISED: BarDatum[] = PROBLEMS.map((p) => ({
  id: p.id,
  label: p.text,
  tally: p.reach,
  ratings: p.ratings,
  flipId: `faculty-problem-${p.id}`,
}));

const INTERVIEWS = (
  <>
    Interviews with <Projected n={SAMPLE} /> faculty
  </>
);

const CHAPTERS: Chapter[] = [
  {
    id: "hopping",
    problems: ["switching"],
    title: "Hopping between slow sites.",
    label: "Hopping between sites",
    evidence: [
      {
        problem: "switching",
        value: <Of t={of(3)} />,
        label: "hop between sites all day, one of them painfully slow",
        source: INTERVIEWS,
      },
    ],
    quote: { text: "By now I just remember my schedule.", who: "Faculty, SIG" },
    feature: {
      id: "one-place",
      name: "Your teaching, in one place",
      tagline: "Every division and elective you teach, on one fast screen.",
      points: [
        "Every class you teach, in one week",
        "When a lecture moves, it moves in your week too",
        "Cancel once, and every student's timetable updates",
      ],
      solves: ["switching"],
      icon: "calendar",
    },
    visual: ({ step, active, flipId }) => (
      <TeachingWeek step={step} active={active} flipId={flipId} />
    ),
    notes: {
      track: [
        "So, the ranking, one problem at a time. At the top: hopping between slow sites all day.",
        "3 of 10 told us about it. One teacher opens the timetable link, then logs into Moodle, the attendance portal and mail, each on its own, and moves between them all day. Another just gave up: the link takes so long to open that she pasted a handwritten timetable on her desk. 'By now I just remember my schedule.'",
      ],
      feature: [
        "Your teaching, in one place: every class you teach, every division and elective, in one week, behind the one college Google sign-in. A combined lecture, students from two divisions in one room, shows once, with every group on it. It loads only your teaching, so it opens fast.",
        "When the coordinator moves a lecture, it moves in your week too: the new day, the new hour, the new room, with a notice across the top that says what changed.",
        "And when you cancel, you cancel once: every student's timetable updates, and synced Google Calendars follow. No slow link, and no handwritten copy on the desk.",
      ],
    },
  },
  {
    id: "attendance",
    problems: ["attendance"],
    title: "Five minutes lost every lecture.",
    label: "Attendance by hand",
    evidence: [
      {
        problem: "attendance",
        value: <Of t={of(2)} />,
        label: "set up and take attendance by hand after every lecture",
        source: INTERVIEWS,
      },
    ],
    quote: {
      text: "Every lecture I lose five minutes just setting up attendance.",
      who: "Faculty, SIG",
    },
    feature: {
      id: "register",
      name: "Attendance, already set up",
      tagline:
        "The timetable already knows every lecture, so every register is waiting.",
      points: [
        "Every lecture arrives with its register",
        "Mark it in a few taps; students see it at once",
        "Students check in with a code",
      ],
      solves: ["attendance"],
      icon: "checkCircle",
    },
    visual: ({ step, active, flipId }) => (
      <AttendanceRegister step={step} active={active} flipId={flipId} />
    ),
    notes: {
      track: [
        "Next: attendance. 2 of 10 set it up and take it by hand, after every single lecture, and both rated it high.",
        "The timetable and the attendance portal don't talk to each other, so after each lecture they create the session again, then mark it. 'Every lecture I lose five minutes just setting up attendance.' Another teacher takes it in the last few minutes of class, so the lecture itself gets shorter.",
      ],
      feature: [
        "Attendance, already set up. The timetable already knows every lecture, so every lecture arrives with its register. There is no session to create.",
        "The teacher marks present, absent, late or excused in a few taps, and students see their attended, held and remaining lectures per course straight away.",
        "Or the teacher marks nobody at all: they put a code up in class, students check themselves in from their phones, and the register fills itself. The lecture keeps its last five minutes.",
      ],
    },
  },
  {
    id: "coursework",
    problems: ["marks", "deadlines"],
    title: "Marks merged, deadlines scattered.",
    label: "Marks and deadlines",
    evidence: [
      {
        problem: "marks",
        value: <Of t={of(2)} />,
        label: "gather marks from many places and check them twice",
        source: INTERVIEWS,
      },
      {
        problem: "deadlines",
        value: <Of t={of(2)} />,
        label: "say assignment deadlines are scattered across platforms",
        source: INTERVIEWS,
      },
    ],
    feature: {
      id: "marks-book",
      name: "Marks and deadlines, in one place",
      tagline:
        "The assessment plan, every assignment and every mark, together.",
      points: [
        "The college's assessment plan, already filled in",
        "Set an assignment once; every group sees its deadline",
        "Marks typed once, totals and export done",
      ],
      solves: ["marks", "deadlines"],
      icon: "sheet",
    },
    visual: ({ step, active, flipId }) => (
      <MarksBook step={step} active={active} flipId={flipId} />
    ),
    notes: {
      track: [
        "Two together now, both coursework: marks merged by hand, and assignment deadlines scattered across platforms. Tests and assignments are in our scope, so both stay near the top.",
        "2 of 10 collect marks from Google Forms, assignments and Moodle, combine them in Excel, and check everything two or three times. Both rated it high. 'Half my time goes into combining marks, not teaching.' Another 2 of 10 check Moodle, mail and Forms just to find out which assignment is due when, and keep track on sticky notes and phone reminders.",
      ],
      feature: [
        "Marks and deadlines, in one place. What they asked for was a template, and that's what they get: the college's assessment plan, already filled in. Every unit test, the assignment and the end term are laid out with their marks, so they only fill in the scores.",
        "Set an assignment once, and every group you teach sees its deadline, on their own day, beside their classes. No checking three sites to see what's due, and no sticky notes.",
        "Marks are typed once and the totals work themselves out, so there's nothing to check twice. And the export is done for you: one file, no Excel merge.",
      ],
    },
  },
  {
    id: "request",
    problems: ["coordinator", "one-place"],
    title: "Every decision goes through someone.",
    label: "Every change via the coordinator",
    evidence: [
      {
        problem: "coordinator",
        value: <Of t={of(2)} />,
        label: "go through the coordinator for every change",
        source: INTERVIEWS,
      },
      {
        problem: "one-place",
        value: <Of t={of(2)} />,
        label: "say there's no one place where a change reaches them",
        source: INTERVIEWS,
      },
    ],
    feature: {
      id: "self-schedule",
      name: "Schedule it yourself",
      tagline:
        "Pick a slot and a room that work. No calls, no waiting on a reply.",
      points: [
        "Only slots with no clash, in a room that fits",
        "Booked in a tap, no call to anyone",
        "The whole group is told for you",
      ],
      solves: ["coordinator", "one-place"],
      icon: "plus",
    },
    visual: ({ step, active, flipId }) => (
      <RequestLecture step={step} active={active} flipId={flipId} />
    ),
    notes: {
      track: [
        "Two problems together now: every change going through the coordinator, and no single place where changes reach faculty.",
        "2 of 10 go to the coordinator for every timing, cancellation and room, then email the students themselves, and both rated it high. 'For every small decision I have to go to the coordinator.' Another 2 of 10 said there's no one place where a change reaches them, so they find out late.",
      ],
      feature: [
        "Schedule it yourself. Pick the group and the week, and Plannr shows only the slots with no clash for the room, the teacher or the group, in a room big enough and with what the session needs.",
        "Tap one and it's booked, no call to anyone. Where the college wants a sign-off, the same tap sends it to the coordinator's queue instead, clash information and all.",
        "And the whole group is told for you: a notice goes to every student it affects, and the lecture lands in their timetables and synced calendars. No mail to write, and every change reaches faculty in the same place: their own week.",
      ],
    },
  },
  {
    id: "availability",
    problems: ["availability"],
    title: "Their whole schedule, again.",
    label: "Availability, again and again",
    evidence: [
      {
        problem: "availability",
        value: <Of t={of(1)} />,
        label: "visiting faculty phone in their availability for every change",
        source: INTERVIEWS,
      },
    ],
    quote: {
      text: "Every time I have to explain my whole schedule to the coordinator again.",
      who: "Visiting faculty, SICSR",
    },
    feature: {
      id: "availability",
      name: "Availability, entered once",
      tagline: "Say when you can teach, once; the planner works around it.",
      points: [
        "Mark the hours you can teach, once a term",
        "The planner schedules your lectures into them",
        "Changes go to a queue, not to your phone",
      ],
      solves: ["availability"],
      icon: "clock",
    },
    visual: ({ step, active, flipId }) => (
      <AvailabilityOnce step={step} active={active} flipId={flipId} />
    ),
    notes: {
      track: [
        "And the visiting faculty. Only 1 of 10 here, because we met one visiting teacher, but she rated it high and it's the heart of what we automate.",
        "She teaches at other institutes too, phones the coordinator with her availability, and waits for timings. Every change starts that again. 'Every time I have to explain my whole schedule to the coordinator again.'",
      ],
      feature: [
        "Availability, entered once. A visiting teacher marks the hours they can teach, once a term, on a week grid.",
        "The planner schedules their lectures into those hours, and never outside them, so the timings arrive without a single call.",
        "And when something changes, it becomes a card in the coordinator's queue, not another phone call. Nobody explains their whole schedule again.",
      ],
    },
  },
];

export const faculty: SectionDef = {
  id: "faculty",
  title: "Faculty",
  speaker: "ravya",
  slides: [
    {
      id: "faculty",
      title: "Faculty",
      notes:
        "Thanks, Sonal. I spoke with faculty at two institutes, and the first thing I learned is how much of a teacher's day isn't teaching.",
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
        "I interviewed 10 faculty, at SICSR and at SIG, over twelve days, 12 to 23 September: some in person, some by phone. I asked about their day first, and only then what would help. And on most desks there was a handwritten timetable.",
        "Three things they said. 'The lecture ends before I finish all the admin.' 'For every small decision I have to go to the coordinator.' And: 'By now I just remember my schedule.'",
      ],
      render: ({ step, active }) => (
        <InterviewSummary
          active={active}
          stakeholder="faculty"
          title="Faculty at two institutes."
          research={RESEARCH}
          step={step}
        />
      ),
    },
    {
      id: "faculty-types",
      title: "Internal and visiting",
      notes:
        "Two kinds of faculty. Internal faculty, 9 of 10, are full-time: on campus every day, teaching several groups, opening the timetable, Moodle, the attendance portal and mail one by one. Visiting faculty, 1 of 10, teach here and at other institutes. They phone in their availability, and every change goes back through the coordinator.",
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
        "An internal teacher's day. At eight, a look at the day's timetable. A lecture at nine, then attendance on the portal at ten. Another group at half past eleven. At half past one, marks from Google Forms and Moodle, collected in Excel. And at four, a mail to the students.",
        "A visiting teacher's day starts at another institute. At noon they phone in their availability, and at two they get their timings from the coordinator. Their lecture here is at half past five, and at seven it all goes into the one calendar they keep across institutes.",
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
        "Here's what one extra lecture looks like today. First, the teacher checks the timetable link for a free slot.",
        "Then they call or message the coordinator, and wait for a reply.",
        "The coordinator checks the rooms and edits the timetable. That can take hours, or a day.",
        "And then the teacher mails the students about it: the same news, twice.",
        "Every step goes through someone else.",
      ],
      render: ({ step }) => (
        <FlowDiagram
          title="One extra lecture, through two people."
          accent="var(--faculty)"
          nodes={[
            {
              id: "guess",
              actor: "Faculty",
              action: "Checks the timetable link for a free slot",
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
              action: "Checks rooms and edits the timetable",
              icon: "clipboard",
              wait: "hours to a day",
            },
            {
              id: "mail",
              actor: "Faculty",
              action: "Mails the students about it",
              icon: "mail",
              wait: "the same news, twice",
              tone: "bad",
            },
          ]}
          outcome="Every step goes through someone else."
          step={step}
        />
      ),
    },
    {
      id: "faculty-apps",
      title: "The tools they use",
      steps: 2,
      notes: [
        "We asked each of them which tools their day runs on. Eight came up, about three per person: Moodle for 7 of 10, Gmail for 5, and the timetable site, the attendance portal, Google Forms and WhatsApp for 4 each.",
        "Plannr takes over four of them: the timetable site, the attendance portal, the Excel sheets where marks get merged, and the phone calls to the coordinator. Moodle keeps the course material.",
      ],
      render: ({ step, active }) => (
        <BarChart
          title="Eight tools, about three each."
          lede="Plannr takes over four of them: the timetable, attendance, Excel and the calls."
          panels={[{ data: APPS }]}
          primary="count"
          source={
            <>
              Interviews with <Projected n={SAMPLE} /> faculty at SICSR and SIG,
              12 to 23 September 2026
            </>
          }
          step={step}
          active={active}
        />
      ),
    },
    {
      id: "faculty-problems",
      title: "Everything they told us",
      notes:
        "These are the eight problems faculty told us about, in the order we heard them. Hopping between slow sites. Attendance set up by hand, every lecture. Deadlines scattered. No one place where changes reach them. Marks merged by hand. A login for every system. Every change through the coordinator. And visiting faculty explaining their availability, again.",
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
      id: "faculty-chart",
      title: "Who raised what",
      notes:
        "Here's how many raised each one, and how they rated it themselves: high, medium or low. Hopping between sites is the widest, 3 of 10. Most of the others are 2 of 10, and most of those rated it high. No single place for changes is the exception: they all rated it medium.",
      render: ({ step, active }) => (
        <BarChart
          title="Who raised what, and how much it hurts."
          panels={[{ data: RAISED }]}
          stacked
          primary="count"
          max={0.5}
          source={<>{INTERVIEWS} · split by their own rating</>}
          step={step}
          active={active}
        />
      ),
    },
    {
      id: "faculty-ranking",
      title: "What hurts most",
      steps: 6,
      notes: [
        "Now we rank them. They start in the chart's order, by how many raised them.",
        "Reach: the share of the faculty we interviewed who raised it. Hopping between sites leads, 3 of 10; most others are 2 of 10.",
        "Severity, from their own ratings: high is five, medium three, low one. The highest rating per person, averaged.",
        "Reach times severity gives a first score, and the rows sort by it. Notice logins, fourth here: a login for every system hurts, a lot.",
        "But we're not building everything. Scope: the timetable, attendance, scheduling and tracking classes, tests and assignments are core, five. Everything else is future, one, and one login for every college system is in that.",
        "Times scope, out of a hundred, and they sort again. Logins drop from fourth to last, eighth, because they're outside what we automate; everything else moves up one. At the top: hopping between sites, attendance by hand, and marks merged by hand.",
      ],
      render: ({ step }) => (
        <ProblemRanking
          stakeholder="faculty"
          title="What hurts most."
          problems={byReach(PROBLEMS)}
          top={3}
          footnote="Severity: their own ratings (high 5, medium 3, low 1), highest per person, averaged."
          step={step}
        />
      ),
    },
    ...chapterSlides({
      stakeholder: "faculty",
      problems: PROBLEMS,
      chapters: CHAPTERS,
      later: ["logins"],
      recap: {
        title: "Where that leaves faculty.",
        label: "Where that leaves faculty",
        notes:
          "So, where that leaves faculty. Seven of the eight, answered: one fast place for their teaching, attendance that's already set up, marks and deadlines in one place, scheduling a lecture themselves with the group told for them, and availability entered once. Later, outside what we automate: one login for every college system.",
      },
    }),
    {
      id: "faculty-handoff",
      title: "Over to Tanisha",
      notes:
        "That's faculty. Now over to Tanisha, for the people who actually run the timetable.",
      render: ({ step }) => (
        <StakeholderMap
          title="That's faculty."
          highlight="coordinators"
          struck={OUT_OF_SCOPE}
          caption="Over to Tanisha, for coordinators."
          step={step}
        />
      ),
    },
  ],
};
