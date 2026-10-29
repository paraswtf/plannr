import { pct, Projected } from "~/content/research";
import { OUT_OF_SCOPE } from "~/content/team";
import type {
  DayLane,
  Persona,
  Problem,
  Research,
  Tally,
} from "~/content/types";
import type { SectionDef } from "~/deck/types";
import { BarChart, type BarDatum } from "~/templates/BarChart";
import { DayTimeline } from "~/templates/DayTimeline";
import { HeroStat } from "~/templates/HeroStat";
import { InterviewSummary } from "~/templates/InterviewSummary";
import { PersonaCards } from "~/templates/PersonaCards";
import { ProblemBoard } from "~/templates/ProblemBoard";
import { ProblemRanking } from "~/templates/ProblemRanking";
import { SectionOpener } from "~/templates/SectionOpener";
import { StakeholderMap } from "~/templates/StakeholderMap";
import { VisualSlide } from "~/templates/VisualSlide";
import { Grad } from "~/ui/layout";
import { SpeedRace } from "~/visuals/admins/SpeedRace";
import { OldPhoneFlow } from "~/visuals/students/OldPhoneFlow";
import { PhoneChangeAlert } from "~/visuals/students/PhoneChangeAlert";
import { PhoneCoursework } from "~/visuals/students/PhoneCoursework";
import { PhoneMyDay } from "~/visuals/students/PhoneMyDay";
import { WeekPattern } from "~/visuals/students/WeekPattern";

import { chapterSlides, type Chapter } from "./_chapters";

/*
 * STUDENTS, presented by Sonal.
 *
 * Sonal: the research lives in the constants below; the slides further down
 * only arrange it. Every tally is what we collected in the first round (15
 * students who answered four open questions, 11 who took the survey), and
 * the slides and the speaker notes give the same numbers: when a tally
 * changes, change its note too. The ranking and the chapters after it work
 * their order out from `reach`, `severity` and `scope`, so fixing the data
 * fixes the animation.
 */

/** The open questions: how they follow their day (15 answered). */
const ASKED = 15;
/** The survey: habits and problems (11 took it). */
const SURVEYED = 11;

const asked = (count: number): Tally => ({ count, of: ASKED });
const surveyed = (count: number): Tally => ({ count, of: SURVEYED });

const RESEARCH: Research = {
  stats: [
    { value: <Projected n={ASKED} />, label: "answered open questions" },
    { value: <Projected n={SURVEYED} />, label: "took the survey" },
    { value: "2", label: "years: third and fourth" },
  ],
  methods: [
    "Four open questions about their day",
    "A survey on habits and problems",
    "Some answered in pairs",
  ],
  quotes: [
    {
      text: "Many times classes change with no email about it or cancel at the wrong moment",
      who: "Student, SICSR",
    },
    {
      text: "Save it in my calendar so don't need to check but not able to update it if any changes",
      who: "Student, SICSR",
    },
    {
      text: "No problem faced with the current method as of\u00a0now.",
      who: "Student, SICSR",
    },
  ],
};

/** How they keep up with the day (the open questions). */
const CHANNELS: BarDatum[] = [
  {
    id: "site",
    label: "Still check the timetable site",
    tally: asked(13),
  },
  {
    id: "whatsapp",
    label: "WhatsApp for changes",
    tally: asked(13),
    highlight: true,
  },
  {
    id: "people",
    label: "Ask friends, the CR or the group",
    tally: asked(12),
    highlight: true,
  },
  { id: "mail", label: "College email for changes", tally: asked(9) },
  { id: "memory", label: "Know the week by heart", tally: asked(6) },
  {
    id: "own",
    label: "Their own calendar, alarms or notes",
    tally: asked(3),
  },
];

/** What the survey asked them to tick, for the timetable site and Moodle. */
const SITE_ASKED: BarDatum[] = [
  {
    id: "site-steps",
    label: "Too many steps to find my classes",
    tally: surveyed(9),
    highlight: true,
  },
  {
    id: "site-clutter",
    label: "Confusing or cluttered",
    tally: surveyed(9),
    highlight: true,
  },
  {
    id: "site-week",
    label: "Hard to see my whole week",
    tally: surveyed(9),
    highlight: true,
  },
  {
    id: "site-changes",
    label: "Doesn't tell me about changes",
    tally: surveyed(8),
    highlight: true,
  },
  {
    id: "site-combine",
    label: "Doesn't combine classes and assignments",
    tally: surveyed(7),
  },
  { id: "site-slow", label: "Slow, buggy or crashes", tally: surveyed(7) },
  {
    id: "site-calendar",
    label: "Doesn't sync with my calendar",
    tally: surveyed(4),
  },
  { id: "site-internet", label: "Needs internet to work", tally: surveyed(4) },
  { id: "site-personal", label: "Isn't personalised", tally: surveyed(4) },
];

const MOODLE_ASKED: BarDatum[] = [
  {
    id: "moodle-marks",
    label: "Marks and feedback hard to find",
    tally: surveyed(8),
  },
  { id: "moodle-deadlines", label: "Deadlines scattered", tally: surveyed(7) },
  {
    id: "moodle-notify",
    label: "No proper notifications",
    tally: surveyed(7),
  },
  { id: "moodle-phone", label: "Poor on a phone", tally: surveyed(7) },
  { id: "moodle-logins", label: "Too many logins", tally: surveyed(7) },
  {
    id: "moodle-assignments",
    label: "Hard to find assignments",
    tally: surveyed(6),
  },
  {
    id: "moodle-material",
    label: "Material in inconsistent places",
    tally: surveyed(6),
  },
  {
    id: "moodle-calendar",
    label: "No Google Calendar sync",
    tally: surveyed(5),
  },
];

const share = (n: number) => (
  <>
    <Projected n={n} /> of <Projected n={ASKED} /> we asked
  </>
);

const PERSONAS: Persona[] = [
  {
    id: "memoriser",
    name: "The Memoriser",
    tagline: "Knows the week by heart; watches for changes.",
    icon: "lightbulb",
    traits: [
      "Has the week memorised",
      "Watches WhatsApp and mail",
      "Opens the site when a room moves",
    ],
    share: share(6),
  },
  {
    id: "checker",
    name: "The Daily checker",
    tagline: "Opens the site to find today's room.",
    icon: "search",
    traits: [
      "Checks the site before class",
      "Picks a semester and major, every visit",
      "Asks the group if the mail differs",
    ],
    share: share(8),
  },
  {
    id: "organiser",
    name: "The Self-organiser",
    tagline: "Copies the week into their own tools.",
    icon: "calendarCheck",
    traits: [
      "Keeps it in a calendar or alarms",
      "Rarely opens the site",
      "The copy goes stale on a change",
    ],
    share: share(3),
  },
];

/**
 * Composites of what they told us: illustrative days, not one person's. The
 * same timetable runs through all three, on the college's own periods
 * (lectures from nine, and again from half past one); what differs is how
 * each of them keeps track of it.
 */
const DAYS: DayLane[] = [
  {
    personaId: "memoriser",
    label: "The Memoriser",
    events: [
      { at: "08:30", label: "Walks to the usual room", icon: "door" },
      { at: "09:00", label: "Lectures", icon: "book" },
      { at: "12:30", label: "Reads the class group at lunch", icon: "message" },
      { at: "13:30", label: "Lectures", icon: "book" },
      { at: "16:30", label: "Checks college mail", icon: "mail" },
    ],
  },
  {
    personaId: "checker",
    label: "The Daily checker",
    events: [
      { at: "08:15", label: "Opens the site for today's rooms", icon: "globe" },
      { at: "09:00", label: "Lectures", icon: "book" },
      {
        at: "12:45",
        label: "Checks the site for the afternoon",
        icon: "globe",
      },
      { at: "13:30", label: "Lectures", icon: "book" },
    ],
  },
  {
    personaId: "organiser",
    label: "The Self-organiser",
    events: [
      { at: "07:30", label: "A reminder for the 9:00", icon: "alarm" },
      { at: "09:00", label: "Lectures", icon: "book" },
      { at: "12:30", label: "Checks their calendar", icon: "calendarCheck" },
      { at: "13:30", label: "Lectures", icon: "book" },
      { at: "16:30", label: "Sets alarms for tomorrow", icon: "alarm" },
    ],
  },
];

/*
 * In the order we heard them. Reach is the survey (11 students). Severity is
 * our estimate, by one rule: 5 a missed class or deadline, 4 lost time or a
 * late arrival, 3 friction every time, 2 an annoyance, 1 cosmetic. Scope is
 * how central it is to what we set out to automate.
 *
 * "Isn't personalised" (4 of 11) is merged into `find`. `slow` is the survey's
 * "slow, buggy or crashes" (7 of 11). "Needs internet" (4 of 11) stays in the
 * notes, not the problem: we can't tell how far the two boxes overlap. The
 * offline point on the speed feature answers it.
 */
const PROBLEMS: Problem[] = [
  {
    id: "changes",
    text: "The timetable doesn't tell us when a class changes",
    reach: surveyed(8),
    severity: 5,
    scope: "core",
  },
  {
    id: "clutter",
    text: "A cluttered, confusing page",
    reach: surveyed(9),
    severity: 3,
    scope: "core",
  },
  {
    id: "slow",
    text: "Slow, buggy or crashes",
    reach: surveyed(7),
    severity: 4,
    scope: "core",
  },
  {
    id: "find",
    text: "Too many steps to find my own classes",
    reach: surveyed(9),
    severity: 3,
    scope: "core",
  },
  {
    id: "week",
    text: "Can't see my whole week at a glance",
    reach: surveyed(9),
    severity: 3,
    scope: "core",
  },
  {
    id: "grades",
    text: "Marks and feedback are hard to find",
    reach: surveyed(8),
    severity: 3,
    scope: "core",
  },
  {
    id: "calendar",
    text: "Doesn't sync with my calendar",
    reach: surveyed(4),
    severity: 2,
    scope: "core",
  },
  {
    id: "deadlines",
    text: "Classes and deadlines live in different apps",
    reach: surveyed(7),
    severity: 5,
    scope: "core",
  },
];

const reachOf = (id: string) => {
  const p = PROBLEMS.find((q) => q.id === id);
  if (!p) throw new Error(`students: no problem "${id}"`);
  return p.reach;
};

const surveySource = (
  <>
    Survey of <Projected n={SURVEYED} /> students
  </>
);

const CHAPTERS: Chapter[] = [
  {
    id: "changes",
    problems: ["changes", "calendar"],
    title: "Changes reach them last.",
    label: "Changes reach them last",
    evidence: [
      {
        problem: "changes",
        value: pct(reachOf("changes")),
        label: "say the timetable doesn't tell them when a class changes",
        source: surveySource,
      },
    ],
    quote: {
      text: "Once, the class mentioned in the mail was different from the one in the timetable, and I only got to know about it later with my friend.",
      who: "Student, SICSR",
    },
    feature: {
      id: "changes-land",
      name: "Changes land in your day",
      tagline:
        "Move a class once, and every timetable it touches moves with it.",
      points: [
        "A notice to only the students it affects",
        "The class has already moved in your day",
        "Synced Google Calendars follow, if you turn it on",
      ],
      solves: ["changes", "calendar"],
      icon: "bell",
    },
    visual: ({ step, active, flipId }) => (
      <PhoneChangeAlert step={step} active={active} flipId={flipId} />
    ),
    notes: {
      track: [
        "So let's take them one at a time. At the top: the timetable doesn't tell them when a class changes. And further down, the same complaint from the other side: it doesn't sync with their calendar.",
        "73% of the survey ticked it, and in the open questions, 8 of 15 brought it up before we'd asked about it at all. 36% want the timetable in their own calendar. Smriti put it best: [read the quote].",
      ],
      feature: [
        "Here's what we built for it: changes land in your day. First, a notice that goes to only the students a change affects: your division, your elective, nobody else. No more hearing it from the group at the door.",
        "And when a coordinator moves a class, it has already moved in your day by the time you open Plannr. No mail to cross-check against the timetable.",
        "And if you turn on Google Calendar sync, your calendar follows too: a moved class moves, a cancelled one is retitled. That's Roshan's stale calendar copy fixed, and the calendar problem answered, today.",
      ],
    },
  },
  {
    id: "coursework",
    problems: ["deadlines", "grades"],
    title: "Deadlines and marks, elsewhere.",
    label: "Deadlines and marks, elsewhere",
    evidence: [
      {
        problem: "deadlines",
        value: pct(reachOf("deadlines")),
        label: "say their classes and deadlines live in different apps",
        source: surveySource,
      },
      {
        problem: "grades",
        value: pct(reachOf("grades")),
        label: "say marks and feedback are hard to find on Moodle",
        source: surveySource,
      },
    ],
    feature: {
      id: "coursework-day",
      name: "Deadlines and marks, on\u00a0your day",
      tagline:
        "Tests, deadlines and marks from every course, beside your classes.",
      points: [
        "Every deadline on your day, from every course",
        "Test dates ahead, marks the day they're entered",
        "Attendance, marks and work due, per course",
      ],
      solves: ["deadlines", "grades"],
      icon: "clipboard",
    },
    visual: ({ step, active, flipId }) => (
      <PhoneCoursework step={step} active={active} flipId={flipId} />
    ),
    notes: {
      track: [
        "Both of those are answered now. Second on the list: classes and deadlines live in different apps. And further down, from the same place, Moodle: marks and feedback are hard to find.",
        "64% say their classes and their deadlines live in different apps, 7 of 11. And 73%, 8 of 11, say marks and feedback are hard to find: the most of anything on Moodle.",
      ],
      feature: [
        "So we put deadlines and marks on your day. Every assignment a teacher sets lands on the day it's due, beside your classes, from every course you take. No second app to check.",
        "Test dates show up ahead of time, on the day they fall. To be honest, nobody asked for that one: it's our idea, because the timetable already knows the rooms and the slots. And your marks appear the day the teacher enters them.",
        "And each course on one screen: your attendance, your marks and the work still due. Everything they told us about Moodle, next to the timetable.",
      ],
    },
  },
  {
    id: "speed",
    problems: ["slow", "clutter"],
    title: "Slow, and hard to read.",
    label: "Slow, and hard to read",
    evidence: [
      {
        problem: "slow",
        value: pct(reachOf("slow")),
        label: "say it's slow, buggy or crashes",
        source: surveySource,
      },
    ],
    quote: {
      text: "Takes too much time, patience and requires an internet connection to access the link",
      who: "Student, SICSR",
    },
    feature: {
      id: "fast",
      name: "Fast and clear, on a phone",
      tagline: "Built to load your day, not the whole college.",
      points: [
        "Loads only your day, not the whole college",
        "Faster on the same phone and network",
        "Still there offline, in the lab",
      ],
      solves: ["slow", "clutter"],
      icon: "zap",
    },
    visual: ({ step, active }) => <SpeedRace step={step} active={active} />,
    notes: {
      track: [
        "Deadlines and marks, answered. Next on the list, two about the site itself: it's slow, buggy or crashes; and the page is cluttered and confusing.",
        "64% say it's slow, buggy or crashes. Needing internet was a separate box, ticked by 4 of 11, and we'll answer that one too in a minute. Rishi said the college wifi makes it worse. Asmit: [read the quote].",
      ],
      feature: [
        "So Plannr is built to be fast and clear on a phone. It loads only your day, not the whole college's week, so there's far less to fetch and far less on the screen.",
        "Same phone, same network, side by side. [The times in this race are placeholders: we'll measure both on campus before we present.]",
        "And it's still there offline, down in the lab. Plannr keeps your week on your phone, so losing the wifi doesn't cost you your room. That's the 4 of 11 who said it needs internet, answered.",
      ],
    },
  },
  {
    id: "my-day",
    problems: ["find", "week"],
    title: "Their own classes, buried.",
    label: "Their own classes, buried",
    evidence: [
      {
        problem: "find",
        value: pct(reachOf("find")),
        label: "say it takes too many steps to find their own classes",
        source: surveySource,
      },
    ],
    quote: {
      text: "I usually check the time table for the classroom after I reach college.",
      who: "Student, SICSR",
    },
    feature: {
      id: "my-day",
      name: "Your day, on\u00a0one screen",
      tagline: "Just your division and your electives, the moment you open it.",
      points: [
        "Opens on your next class, and nothing else",
        "Swipe to tomorrow, or see the whole week",
        "Room, teacher and minutes to go, on every class",
      ],
      solves: ["find", "week"],
      icon: "calendar",
    },
    visual: ({ step, active, flipId }) => (
      <PhoneMyDay step={step} active={active} flipId={flipId} />
    ),
    notes: {
      track: [
        "Both answered. Then two that tie with the page: too many steps to find your own classes, and no way to see your whole week at a glance.",
        "82% of the survey said finding their own classes takes too many steps: pick the semester, pick the major, every single visit. So some don't bother until they're already at college. Esha: [read the quote].",
      ],
      feature: [
        "Your day, on one screen. Sign in with your college account and Plannr opens on your next class: your division, your electives, nothing else. No semester to pick.",
        "Swipe, and tomorrow slides in, with its test and the project due at half past three right on it, even offline. Or switch to the week, or the month, for the whole picture at a glance.",
        "And every class tells you the room, the teacher and how many minutes you have to get there. All of this is built and running.",
      ],
    },
  },
];

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
          lede="The people who open the timetable more than anyone, usually on a phone, usually in a hurry."
          step={step}
        />
      ),
    },
    {
      id: "students-interviews",
      title: "Who we heard from",
      steps: 2,
      notes: [
        "We heard from students twice. First, 15 answered four open questions about their day: how they follow it, what goes wrong, what they do about it, and which apps they use. Some answered in pairs. Then 11 in third and fourth year took a short survey on their habits and their problems. Two of the people who answered are on our team, Tanisha and me: we answered as students, and we're telling you so.",
        "A few things they said, in their own words. Myshaa: [read the first quote]. Roshan keeps it in a calendar, but: [read the second]. And, to be fair, Dhruv has no problem at all. Notice that most of them aren't describing the timetable itself. They're describing the work they do around it.",
      ],
      render: ({ step, active }) => (
        <InterviewSummary
          active={active}
          stakeholder="students"
          title="Students, in their own words."
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
        "The first thing we noticed: classes are mostly regular. Week after week, the same subjects, the same slots, the same rooms. 40% of them, 6 of 15, know the week by heart and barely open the timetable.",
        "The trouble is the week that's different. A class moves, an extra one gets added, and the news arrives in a mail, or on WhatsApp, or not at all.",
        "53%, 8 of the 15 who answered the open questions, told us changes don't reach them in time. That's a smaller share than the 73% you'll see from the survey later, because these were open answers: nobody was handed a box to tick. The regular week isn't the problem. The exception is.",
      ],
      render: ({ step, active }) => (
        <VisualSlide
          title={
            <>
              Most weeks look the same. <Grad>The one that doesn&apos;t</Grad>{" "}
              is the problem.
            </>
          }
          visual={
            <WeekPattern
              step={step}
              active={active}
              stat={{
                value: pct(asked(8)),
                label: (
                  <>
                    of the <Projected n={ASKED} /> who answered the open
                    questions say changes come late
                  </>
                ),
              }}
            />
          }
          step={step}
        />
      ),
    },
    {
      id: "students-channels",
      title: "How they keep up",
      steps: 2,
      notes: [
        "So how do they keep up? Nearly all of them, 13 of 15, still check the timetable site, at least now and then. College email carries changes for 9, and 6 just know the week by heart. Only 3 keep it in their own calendar, alarms or notes.",
        "But look at where the news actually travels: 13 of 15 use WhatsApp for changes, and 12 ask a friend, the CR or the class group to confirm. That's true of every kind of student we'll meet in a minute.",
      ],
      render: ({ step, active }) => (
        <BarChart
          title="How they keep up."
          lede="The site is still open, but the news travels on WhatsApp and by word of mouth."
          panels={[{ data: CHANNELS }]}
          source={
            <>
              Answers from <Projected n={ASKED} /> students to four open
              questions
            </>
          }
          step={step}
          active={active}
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
        "And most people give up somewhere in there and just ask the class WhatsApp group. Three apps and four steps, for one question: where do I need to be?",
      ],
      render: ({ step, active }) => (
        <VisualSlide
          title="Where do I need to be?"
          lede="Three apps and four steps, for one question."
          visual={<OldPhoneFlow step={step} active={active} />}
          step={step}
        />
      ),
    },
    {
      id: "students-days",
      title: "Three days",
      steps: 3,
      notes: [
        "Every student follows the same timetable, but not in the same way. Some know the week by heart. They walk to the usual room for nine, then lectures, and read the class group at lunch. More lectures at half past one, and at half past four they check college mail.",
        "Some check the site every morning. At quarter past eight they open it and find today's rooms, then lectures at nine. At lunch they check it for the afternoon, and more lectures at half past one.",
        "And some copy the week into their own tools: a calendar, alarms, notes. A reminder goes off at half past seven for the nine o'clock lectures, they check their calendar at lunch, more lectures at half past one, and at half past four they set tomorrow's alarms. These days are composites of what we heard, not one person's.",
      ],
      render: ({ step, active }) => (
        <DayTimeline
          active={active}
          stakeholder="students"
          title="Three ways through the same day."
          lanes={DAYS}
          from={7}
          to={17}
          step={step}
        />
      ),
    },
    {
      id: "students-groups",
      title: "Three kinds of student",
      notes:
        "So we grouped students into three kinds: the Memoriser, 6 of 15; the Daily checker, 8; and the Self-organiser, 3. And across all three, 12 of 15 still confirm with a friend, the CR or the group. Every problem we heard, we checked against all three, because a fix that only helps the organised ones helps the people who need it least.",
      render: ({ step, active }) => (
        <PersonaCards
          active={active}
          stakeholder="students"
          title="Three kinds of student."
          personas={PERSONAS}
          step={step}
        />
      ),
    },
    {
      id: "students-asked",
      title: "What the survey found",
      steps: 2,
      notes: [
        "Then the survey: 11 students in third and fourth year, ticking everything that applies, for the timetable site and for Moodle. On the site, four problems nearly everyone has: too many steps to find their classes, a confusing page, no view of the whole week, 9 of 11 each, and no word when something changes, 8.",
        "On Moodle, marks and feedback are the hardest thing to find, 8 of 11. Deadlines come right after, 7: classes in one app, assignments in another. Keep an eye on that one when we score.",
      ],
      render: ({ step, active }) => (
        <BarChart
          title="Four problems nearly everyone has."
          lede="On Moodle, marks are hardest to find, and deadlines are scattered."
          panels={[
            { title: "The timetable site", data: SITE_ASKED },
            { title: "Moodle", data: MOODLE_ASKED },
          ]}
          source={
            <>
              Survey of <Projected n={SURVEYED} /> students in their third and
              fourth year · tick all that apply
            </>
          }
          step={step}
          active={active}
        />
      ),
    },
    {
      id: "students-problems",
      title: "Everything they told us",
      notes:
        "Put the open answers and the survey together, merge the ones that are really the same, and we get eight problems, in the order we heard them. Nobody tells you when a class changes. A cluttered page. Slow, buggy or crashing. Too many steps to find your classes. No view of the week. Marks hard to find. No calendar sync. And classes and deadlines in different apps.",
      render: ({ step }) => (
        <ProblemBoard
          stakeholder="students"
          title="Everything they told us."
          problems={PROBLEMS}
          step={step}
        />
      ),
    },
    {
      id: "students-ranking",
      title: "What hurts most",
      steps: 6,
      notes: [
        "But they're not equal. So we scored each one on three things, out of 100.",
        "First, reach: the share of the 11 in the survey who ticked it. The confusing page, the steps to find your classes and the week: 82% each. No word on changes: 73%.",
        "Second, severity. The survey didn't ask how much it hurts, so this is our estimate, by one rule: five if it costs you a missed class or deadline, four lost time or a late arrival, three friction every time, two an annoyance. Changes and deadlines are fives; a slow site is a four.",
        "Multiply reach by severity and sort, and this is the order. Changes first, and deadlines, classes and assignments in different apps, second.",
        "But we didn't set out to automate everything. The third thing is scope. The timetable, attendance, scheduling and tracking classes, tests and assignments are the core of what Plannr does: full weight, five. File uploads and course material are the future: one, a fifth.",
        "Multiply by scope, and for students nothing moves: everything they raised is in scope. The top three: changes, 73; deadlines, 64; and slow, buggy or crashes, 51. That's the order we designed in.",
      ],
      render: ({ step }) => (
        <ProblemRanking
          stakeholder="students"
          title="What hurts most."
          problems={PROBLEMS}
          top={3}
          reachSub="of the students surveyed"
          footnote="Reach: the survey. Severity: our estimate (5 a missed class or deadline, 4 lost time, 3 friction, 2 an annoyance)."
          step={step}
        />
      ),
    },
    ...chapterSlides({
      stakeholder: "students",
      problems: PROBLEMS,
      chapters: CHAPTERS,
      recap: {
        title: "Where that leaves students.",
        notes:
          "So, where that leaves students. All eight are answered by Plannr today: the notice when a class changes and the calendar sync; deadlines and marks; the speed and the page; finding your classes and seeing your week. Nothing left for later.",
      },
    }),
    {
      id: "students-daily",
      title: "Would they use it?",
      steps: 2,
      notes: [
        "And the last question on the survey: how likely would you be to use an app like this every day? 91% said a four or a five out of five.",
        "Here's how the 11 answers fell: 7 gave it a five, 3 a four, 1 a three, and nobody went lower.",
      ],
      render: ({ step, active }) => (
        <HeroStat
          title="Would they use it?"
          value={pct(surveyed(10))}
          sentence="of the students we surveyed say they'd likely use an app like this every day."
          scale={[
            { label: "1", count: 0 },
            { label: "2", count: 0 },
            { label: "3", count: 1 },
            { label: "4", count: 3 },
            { label: "5", count: 7 },
          ]}
          highlight={["4", "5"]}
          source={
            <>
              Survey of <Projected n={SURVEYED} /> students: how likely, from 1
              to 5
            </>
          }
          step={step}
          active={active}
        />
      ),
    },
    {
      id: "students-handoff",
      title: "Over to Ravya",
      notes:
        "That's everything for students. Over to Ravya, to tell you what's improved for faculty.",
      render: ({ step }) => (
        <StakeholderMap
          title="That's students."
          highlight="faculty"
          struck={OUT_OF_SCOPE}
          caption="Over to Ravya, for faculty."
          step={step}
        />
      ),
    },
  ],
};
