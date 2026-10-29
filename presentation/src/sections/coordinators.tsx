import { Of, Projected } from "~/content/research";
import { OUT_OF_SCOPE } from "~/content/team";
import {
  byReach,
  type DayLane,
  type Problem,
  type Research,
} from "~/content/types";
import type { SectionDef } from "~/deck/types";
import { BarChart, type BarDatum } from "~/templates/BarChart";
import { DayTimeline } from "~/templates/DayTimeline";
import { FlowDiagram } from "~/templates/FlowDiagram";
import { InterviewSummary } from "~/templates/InterviewSummary";
import { ProblemBoard } from "~/templates/ProblemBoard";
import { ProblemRanking } from "~/templates/ProblemRanking";
import { SectionOpener } from "~/templates/SectionOpener";
import { StakeholderMap } from "~/templates/StakeholderMap";
import { Statement } from "~/templates/Statement";
import { VisualSlide } from "~/templates/VisualSlide";
import { Bezel } from "~/ui/frames";
import { Grad } from "~/ui/layout";
import { ImageSlot, Ph } from "~/ui/placeholder";
import { Chip } from "~/ui/surfaces";
import { ApprovalsInbox } from "~/visuals/coordinators/ApprovalsInbox";
import { EditOnceNotify } from "~/visuals/coordinators/EditOnceNotify";
import { DayReport } from "~/visuals/coordinators/DayReport";
import { PhoneMyDay } from "~/visuals/students/PhoneMyDay";

import { chapterSlides, type Chapter } from "./_chapters";

/*
 * Section 04: COORDINATORS, presented by Tanisha.
 *
 * The first round: 4 coordinators at SICSR (Persons A to D), interviewed in
 * person at their desks. Every tally below is as collected, and the slides
 * and the speaker notes give the same numbers.
 *
 * Severity is their own rating (high 5, medium 3, low 1): for each person the
 * highest among the items merged into a problem, then the mean of the people
 * who raised it, rounded. Every coordinator problem is core (the timetable,
 * and keeping track of classes), so scope changes nothing in their ranking.
 *
 * Tanisha: we have no verbatim coordinator quotes yet. Everything in <Ph> is
 * a paraphrase of the notes; swap in what they actually said.
 */

/** The coordinators we interviewed. */
const SAMPLE = 4;
const of = (count: number) => ({ count, of: SAMPLE });

const INTERVIEWS = (
  <>
    Interviews with <Projected n={SAMPLE} /> coordinators at SICSR
  </>
);

const RESEARCH: Research = {
  stats: [
    {
      value: <Projected n={SAMPLE} />,
      label: "coordinators, at their desks",
    },
    { value: "4", label: "tools in their day" },
    { value: "3", label: "places each change is written" },
  ],
  methods: [
    "Interviews at their desks",
    "Photos of the screens they use",
    "Their day, start to finish",
  ],
  quotes: [
    {
      text: <Ph>The same change goes out by mail, then again on WhatsApp.</Ph>,
      who: <Ph>Coordinator, SICSR</Ph>,
    },
    {
      text: <Ph>I check Moodle for how many lectures are left.</Ph>,
      who: <Ph>Coordinator, SICSR</Ph>,
    },
    {
      text: <Ph>An automatic mail to all the students would help.</Ph>,
      who: <Ph>Coordinator, SICSR</Ph>,
    },
  ],
};

/*
 * Two kinds of day, composites of the four: the relayer passes changes on
 * (Persons A and C), the record keeper also keeps the day's record (B and D).
 */
const DAYS: DayLane[] = [
  {
    personaId: "relayer",
    label: "The relayer",
    sublabel: "Passes changes on",
    events: [
      { at: "08:30", label: "Opens the day's timetable", icon: "monitor" },
      { at: "10:00", label: "A teacher calls with a change", icon: "phone" },
      {
        at: "11:00",
        label: "Edits the timetable, mails the batch",
        icon: "edit",
      },
      { at: "12:00", label: "Posts it on WhatsApp", icon: "whatsapp" },
      { at: "15:30", label: "Looks ahead to tomorrow", icon: "calendar" },
    ],
  },
  {
    personaId: "keeper",
    label: "The record keeper",
    sublabel: "Keeps the day's record",
    events: [
      { at: "09:00", label: "Checks the batches' classes", icon: "calendar" },
      { at: "12:00", label: "Moves a class, tells everyone", icon: "mail" },
      { at: "17:00", label: "Records which classes were held", icon: "sheet" },
      { at: "17:30", label: "Checks lectures left on Moodle", icon: "search" },
    ],
  },
];

/* In the order we heard them. Who: Persons A to D. */
const PROBLEMS: Problem[] = [
  {
    // A (high), B (high), D (medium)
    id: "announce",
    text: "Every change announced by hand, three times",
    personas: ["relayer", "keeper"],
    reach: of(3),
    ratings: { high: 2, medium: 1, low: 0 },
    severity: 4,
    scope: "core",
  },
  {
    // A (medium), C (high)
    id: "missed",
    text: "Students still miss changes",
    personas: ["relayer"],
    reach: of(2),
    ratings: { high: 1, medium: 1, low: 0 },
    severity: 4,
    scope: "core",
  },
  {
    // A (low), B (medium), C (medium), D (low)
    id: "nextday",
    text: "Getting to the next day takes extra clicks",
    personas: ["relayer", "keeper"],
    reach: of(4),
    ratings: { high: 0, medium: 2, low: 2 },
    severity: 2,
    scope: "core",
  },
  {
    // B (high), D (high)
    id: "report",
    text: "The day's report of classes held is typed up by hand",
    personas: ["keeper"],
    reach: of(2),
    ratings: { high: 2, medium: 0, low: 0 },
    severity: 5,
    scope: "core",
  },
  {
    // C (medium)
    id: "late",
    text: "Changes reach them late, by phone",
    personas: ["relayer"],
    reach: of(1),
    ratings: { high: 0, medium: 1, low: 0 },
    severity: 3,
    scope: "core",
  },
];

/** Each problem as a bar, split by how the people who raised it rated it. */
const RAISED: BarDatum[] = PROBLEMS.map((p) => ({
  id: p.id,
  label: p.text,
  tally: p.reach,
  ratings: p.ratings,
  flipId: `coordinators-problem-${p.id}`,
}));

const CHAPTERS: Chapter[] = [
  {
    id: "edit-once",
    problems: ["announce", "missed"],
    title: "Every change, written three times.",
    label: "Every change, three times",
    evidence: [
      {
        problem: "announce",
        value: <Of t={of(3)} />,
        label: "announce every change by hand, by mail and on WhatsApp",
        source: INTERVIEWS,
      },
      {
        problem: "missed",
        value: <Of t={of(2)} />,
        label: "say students still miss changes",
        source: INTERVIEWS,
      },
    ],
    feature: {
      id: "edit-follow",
      name: "Edit once, timetables follow",
      tagline: "Save a change, and every timetable it touches moves with it.",
      points: [
        "Drag the class to its new slot, and save",
        "Every affected timetable follows, and synced calendars too",
        "A notice to everyone affected",
      ],
      solves: ["announce", "missed"],
      icon: "send",
    },
    visual: ({ step, active, flipId }) => (
      <EditOnceNotify step={step} active={active} flipId={flipId} />
    ),
    notes: {
      track: [
        "So, the ranking, one problem at a time. At the top, two that go together: every change announced by hand, and students still missing changes.",
        "3 of 4 write every change out by hand: a mail to the batch, then the same message again on the class WhatsApp group, so nobody misses it. And still, 2 of 4 say students miss changes: the mail gets buried, or it isn't forwarded.",
      ],
      feature: [
        "Here's what we built. Edit once, and the timetables follow. The coordinator drags the class to its new slot, and saves.",
        "Every timetable that class touches updates on its own: every student in the group and the teacher, and the Google Calendars of anyone who turned sync on.",
        "And the notice goes out for them: a mail and a push to exactly the people affected, and nobody else. No mail to write, no WhatsApp message to post again. The timetable is already right by the time anyone opens it, so students stop missing changes.",
      ],
    },
  },
  {
    id: "report",
    problems: ["report"],
    title: "The day, typed up by hand.",
    label: "The day's report, by hand",
    evidence: [
      {
        problem: "report",
        value: <Of t={of(2)} />,
        label: "type up which classes were held, every evening",
        source: INTERVIEWS,
      },
    ],
    quote: {
      text: <Ph>Every evening I type up which classes were held.</Ph>,
      who: <Ph>Coordinator, SICSR</Ph>,
    },
    feature: {
      id: "day-report",
      name: "The day's report, written for you",
      tagline: "What ran, moved or was called off, ready by five.",
      points: [
        "Held from the registers; moves and cancellations from the timetable",
        "Lectures held and left for every course, in one report",
        "Ready at five, to send or download",
      ],
      solves: ["report"],
      icon: "file",
    },
    visual: ({ step, active, flipId }) => (
      <DayReport step={step} active={active} flipId={flipId} />
    ),
    notes: {
      track: [
        "Next, the day's report. 2 of 4 type up, every evening, which classes were actually held, and both of them rated it high.",
        "They put it together from faculty messages and their own notes, into a sheet, for the records. And to see how many lectures a course has left, they go and check Moodle. [The quote is our paraphrase; swap in their words.]",
      ],
      feature: [
        "The day's report, written for you. Which classes were held comes from the registers teachers already mark in Plannr; moves and cancellations come from the timetable itself.",
        "For every course, lectures held and lectures left, in one report. Nobody has to check Moodle for how many are left.",
        "And it's ready at five, to send on or to download. Nothing to type up in the evening.",
      ],
    },
  },
  {
    id: "swipe",
    problems: ["nextday"],
    title: "Tomorrow takes extra clicks.",
    label: "Tomorrow takes extra clicks",
    evidence: [
      {
        problem: "nextday",
        value: <Of t={of(4)} />,
        label: "say getting to the next day takes extra clicks",
        source: INTERVIEWS,
      },
    ],
    feature: {
      id: "any-day",
      name: "Every day, a swipe away",
      tagline: "Any group's day, on a phone or at the desk.",
      points: [
        "Any group's day, wherever you are",
        "Swipe, and tomorrow slides in",
        "Opens on what's next",
      ],
      solves: ["nextday"],
      icon: "phone",
    },
    visual: ({ step, active, flipId }) => (
      // The phone's own "Viewing BCA-A" pill is product-sized; the chip beside
      // it says the same thing at a size the room can read.
      <div className="relative flex h-[844px] w-[960px] items-center justify-center">
        <PhoneMyDay
          step={step}
          active={active}
          flipId={flipId}
          viewing="BCA-A"
        />
        <Chip
          icon="users"
          size={24}
          className="absolute"
          style={{ left: 8, top: 112 }}
        >
          Viewing BCA-A
        </Chip>
      </div>
    ),
    notes: {
      track: [
        "Then the one every coordinator raised: all 4 of 4. Getting to the next day takes extra clicks, or a reload.",
        "They rated it low to medium, a small cost. But they pay it every afternoon, when they check tomorrow's classes, and on a phone it's worse: the site only really works on the desktop.",
      ],
      feature: [
        "Every day, a swipe away. A coordinator can open any group's day, here BCA-A, on a phone in the corridor or at the desk.",
        "Swipe, and tomorrow slides in. No reload, no date links at the foot of the page.",
        "And it opens on what's next, so the first thing you see is the class coming up.",
      ],
    },
  },
  {
    id: "inbox",
    problems: ["late"],
    title: "Changes arrive late, by phone.",
    label: "Changes arrive late",
    evidence: [
      {
        problem: "late",
        value: <Of t={of(1)} />,
        label: "hear about changes late, by call or message",
        source: INTERVIEWS,
      },
    ],
    feature: {
      id: "one-inbox",
      name: "Every request, one inbox",
      tagline:
        "Faculty requests arrive in one queue, not in calls, chats and mails.",
      points: [
        "Extra lectures, room changes and cancellations, in one queue",
        "Approve, and it's on the timetable, clash-checked",
        "Every affected timetable updates as you approve",
      ],
      solves: ["late"],
      icon: "inbox",
    },
    visual: ({ step, active, flipId }) => (
      <ApprovalsInbox step={step} active={active} flipId={flipId} />
    ),
    notes: {
      track: [
        "And last: changes reach them late. 1 of 4 told us they hear of a change late, by a call or a message, so they pass it on late.",
        "There's no single place where a change lands. It comes from a teacher, from the admin office, sometimes from the corridor.",
      ],
      feature: [
        "Every request, in one inbox. Extra lectures, room changes and cancellations from faculty arrive in one queue, not in calls, chats and mails.",
        "Approve one, and it's on the timetable, already checked for clashes: the room, the teacher, the group and the room's capacity.",
        "And every timetable it touches updates as you approve. The coordinator hears first, because the request comes to them, not around them.",
      ],
    },
  },
];

export const coordinators: SectionDef = {
  id: "coordinators",
  title: "Coordinators",
  speaker: "tanisha",
  slides: [
    {
      id: "coordinators",
      title: "Coordinators",
      notes: "Thanks, Ravya. I spent my time with the coordinators.",
      render: ({ step }) => (
        <SectionOpener
          stakeholder="coordinators"
          photo={{
            src: "/images/stakeholders/coordinators.jpg",
            alt: "A coordinator's desk: notes, keyboard and tablet",
            credit: "Photo: Sparsh Paliwal / Unsplash",
            position: "50% 55%",
          }}
          number="03"
          lede="Every change to the timetable passes through their desk, by hand."
          step={step}
        />
      ),
    },
    {
      id: "coordinators-why",
      title: "Why coordinators",
      steps: 2,
      notes: [
        "Many people have tried to replace the existing system. But as Paras said, we feel they lacked an understanding of what each user actually does. They built for the people reading the timetable — and stopped there.",
        "So we didn't just focus on students and faculty. We also focused on the people who manage it. Because if their job gets easier, everybody's timetable gets better.",
      ],
      render: ({ step }) => (
        <Statement
          accent="var(--coordinators)"
          title={
            <>
              Most replacements stop at the people reading the timetable.{" "}
              <Grad>We didn&apos;t.</Grad>
            </>
          }
          points={[
            "Make the coordinator's job easier, and every timetable gets better.",
          ]}
          step={step}
        />
      ),
    },
    {
      id: "coordinators-interviews",
      title: "Who we talked to",
      steps: 2,
      notes: [
        "I interviewed four coordinators at SICSR, in person, at their desks: their day from start to finish, with photos of the screens they use. Four tools came up: the timetable site, Gmail, WhatsApp, and Excel for the records. And every change gets written in three places: the timetable, a mail, and the WhatsApp group.",
        "This is the kind of thing they told me. [These three are our paraphrases of the notes; swap in their words.]",
      ],
      render: ({ step, active }) => (
        <InterviewSummary
          active={active}
          stakeholder="coordinators"
          title="At the coordinator's desk."
          research={RESEARCH}
          step={step}
        />
      ),
    },
    {
      id: "coordinators-screen",
      title: "The screen they schedule with",
      notes:
        "This is the screen a coordinator schedules lectures with. It's the timetable site's booking form, 'Add Entry'. One entry per lecture, by hand. The rooms are a list you Ctrl-click through, and the course goes in as free text in the description. Every lecture in the timetable went in through this form, one at a time.",
      render: ({ step }) => (
        <VisualSlide
          title="A booking form, not a timetable."
          lede="One entry per lecture, by hand: rooms picked with Ctrl-click, the course typed in as free text."
          visual={
            <div className="flex h-full w-full items-center justify-center">
              <Bezel className="h-[844px] w-[764px] shrink-0">
                <ImageSlot
                  src="/images/research/coordinator-add-entry.jpg"
                  alt="The timetable site's Add Entry form: description boxes, start and end times, a room list with a note to Ctrl-click for more than one room, the group, and repeat options"
                  label="The coordinator's Add Entry screen"
                  position="50% 0%"
                  radius={22}
                  className="h-full w-full"
                />
              </Bezel>
            </div>
          }
          step={step}
        />
      ),
    },
    {
      id: "coordinators-today",
      title: "One change, four steps by hand",
      steps: 5,
      notes: [
        "Here's one change, from the coordinator's side. It starts with a teacher calling or messaging.",
        "Then they check which rooms are free, by hand.",
        "Then they edit the timetable, in that booking form.",
        "And then it's mailed to the students, and posted again on WhatsApp so nobody misses it. Then come the questions.",
        "And at five, the day's report of classes held is typed up by hand.",
      ],
      render: ({ step }) => (
        <FlowDiagram
          title="One change, four steps by hand."
          accent="var(--coordinators)"
          nodes={[
            {
              id: "request",
              actor: "Request",
              action: "A teacher calls or messages",
              icon: "message",
            },
            {
              id: "check",
              actor: "Check",
              action: "Free rooms are checked",
              icon: "search",
              wait: "by hand",
              waitIcon: "hand",
              tone: "warn",
            },
            {
              id: "edit",
              actor: "Edit",
              action: "The timetable is edited",
              icon: "edit",
            },
            {
              id: "mail",
              actor: "Announce",
              action: "Mailed to students, then again on WhatsApp",
              icon: "mail",
              tone: "warn",
            },
          ]}
          outcome="And at five, the day's report is typed up by hand."
          step={step}
        />
      ),
    },
    {
      id: "coordinators-day",
      title: "A coordinator's day",
      steps: 2,
      notes: [
        "Two kinds of day, each a composite of the people I met. The relayer opens the day's timetable on the desktop at half past eight. At ten, a teacher calls with a change. At eleven they edit the timetable and mail the batch, and at noon it goes on the class WhatsApp group. At half past three, they look ahead to tomorrow.",
        "The record keeper starts with the batches' classes at nine. At noon a class moves, and they let the students and the teacher know. At five they record which classes were held, and at half past five they check Moodle for how many lectures each course has left.",
      ],
      render: ({ step, active }) => (
        <DayTimeline
          active={active}
          stakeholder="coordinators"
          title="A coordinator's day, hour by hour."
          lanes={DAYS}
          from={8}
          to={19}
          step={step}
        />
      ),
    },
    {
      id: "coordinators-problems",
      title: "Everything they told us",
      notes:
        "Everything the coordinators told us, in the order we heard it. Every change announced by hand, three times: the timetable, a mail and the WhatsApp group. Students still missing changes. Extra clicks to get to the next day. The day's report, typed up by hand. And changes reaching them late, by phone, so they pass them on late.",
      render: ({ step }) => (
        <ProblemBoard
          stakeholder="coordinators"
          title="Everything they told us."
          problems={PROBLEMS}
          step={step}
        />
      ),
    },
    {
      id: "coordinators-chart",
      title: "Who raised what",
      notes:
        "Here's how many raised each one, and how they rated it themselves. Getting to the next day: every one of them, 4 of 4, but rated low to medium. Announcing changes by hand: 3 of 4, mostly high. Students missing changes and the day's report: 2 of 4 each, and the report rated high by both.",
      render: ({ step, active }) => (
        <BarChart
          title="Who raised what, and how much it hurts."
          panels={[{ data: RAISED }]}
          stacked
          primary="count"
          source={<>{INTERVIEWS} · split by their own rating</>}
          step={step}
          active={active}
        />
      ),
    },
    {
      id: "coordinators-ranking",
      title: "What hurts most",
      steps: 6,
      notes: [
        "Now we rank them, the same way. They start in the chart's order, by how many raised them.",
        "Reach: the share of the coordinators who raised it. Getting to the next day leads, all 4 of 4; announcing changes by hand is 3 of 4.",
        "Severity, from their own ratings: high is five, medium three, low one. The highest rating per person, averaged. The day's report is a five; the next day is a two.",
        "Reach times severity, and they sort: announcing by hand first, then the day's report, then the next day and missed changes, tied.",
        "Then scope. Every problem the coordinators raised is core: the timetable, and keeping track of classes. So scope changes nothing here.",
        "Times scope, out of a hundred: the same order. At the top: every change announced by hand, the day's report typed up by hand, and getting to the next day. It ties with missed changes at forty, and goes ahead because more of them raised it, all 4 of 4. Missed changes is answered in the first chapter anyway.",
      ],
      render: ({ step }) => (
        <ProblemRanking
          stakeholder="coordinators"
          title="What hurts most."
          problems={byReach(PROBLEMS)}
          top={3}
          footnote="Severity: their own ratings (high 5, medium 3, low 1), highest per person, averaged."
          step={step}
        />
      ),
    },
    ...chapterSlides({
      stakeholder: "coordinators",
      problems: PROBLEMS,
      chapters: CHAPTERS,
      recap: {
        title: "Where that leaves coordinators.",
        label: "Where that leaves coordinators",
        notes:
          "So, where that leaves coordinators. Every change is edited once, and the notice goes out on its own, so no more mail and WhatsApp message, and students stop missing changes. The day's report is written for them. Tomorrow is a swipe away, and every request lands in one inbox. Everything they raised is core, and all of it is built.",
      },
    }),
    {
      id: "coordinators-handoff",
      title: "Over to Paras",
      notes:
        "That's coordinators, and that's all three groups. Over to Paras, to bring it together.",
      render: ({ step }) => (
        <StakeholderMap
          title="That's coordinators."
          struck={OUT_OF_SCOPE}
          presenter="paras"
          caption="Over to Paras, to bring it together."
          step={step}
        />
      ),
    },
  ],
};
