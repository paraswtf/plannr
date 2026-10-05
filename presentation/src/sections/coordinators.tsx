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
import { ProblemBoard } from "~/templates/ProblemBoard";
import { ProblemRanking } from "~/templates/ProblemRanking";
import { SectionOpener } from "~/templates/SectionOpener";
import { SolutionMap } from "~/templates/SolutionMap";
import { StakeholderMap } from "~/templates/StakeholderMap";
import { Statement } from "~/templates/Statement";
import { Grad } from "~/ui/layout";
import { Ph } from "~/ui/placeholder";
import { ApprovalsInbox } from "~/visuals/coordinators/ApprovalsInbox";
import { ClashGuard } from "~/visuals/coordinators/ClashGuard";
import { EditOnceNotify } from "~/visuals/coordinators/EditOnceNotify";

/*
 * Section 04 — COORDINATORS, presented by Tanisha.
 *
 * Tanisha: the two kinds of coordinator below are placeholders — rename or
 * replace them with the roles you actually met. Everything in <Ph> needs your
 * numbers or quotes; the ranking re-sorts itself from the data.
 */

const RESEARCH: Research = {
  stats: [
    { value: <Ph>3</Ph>, label: "coordinators shadowed" },
    { value: <Ph>40+</Ph>, label: "change requests logged" },
    { value: "7", label: "days with them" },
  ],
  methods: [
    "Shadowing a coordinator's desk",
    "Logging every request for a week",
    "Interviews about the start of term",
  ],
  quotes: [
    {
      text: "I change the event, then I still have to mail everyone about it.",
      who: <Ph>Programme coordinator</Ph>,
    },
    {
      text: (
        <Ph>
          I find out about a clash when someone calls me from the corridor.
        </Ph>
      ),
      who: <Ph>Coordinator</Ph>,
    },
    {
      text: <Ph>Half my day is answering “is it still on?”</Ph>,
      who: <Ph>Class coordinator</Ph>,
    },
  ],
};

const PERSONAS: Persona[] = [
  {
    id: "programme",
    name: "Programme coordinator",
    tagline: "Owns a programme's whole timetable for the term.",
    icon: "layers",
    traits: [
      "Builds the term's timetable from faculty availability",
      "Fields every change request",
      "Writes the change mails",
    ],
  },
  {
    id: "class",
    name: "Class coordinator",
    tagline: "Looks after one division, day to day.",
    icon: "users",
    traits: [
      "First stop for students' questions",
      "Relays changes to the class group",
      "Chases rooms and attendance",
    ],
  },
];

const DAYS: DayLane[] = [
  {
    personaId: "programme",
    label: "Programme coordinator",
    events: [
      { at: "09:00", label: "Inbox: 14 requests", icon: "inbox", tone: "warn" },
      {
        at: "10:30",
        label: "Checks clashes by hand",
        icon: "search",
        tone: "warn",
      },
      { at: "12:00", label: "Edits the timetable", icon: "edit" },
      {
        at: "12:30",
        label: "Writes the same change as a mail",
        icon: "mail",
        tone: "bad",
      },
      {
        at: "15:00",
        label: "“Is it still on?” — again",
        icon: "message",
        tone: "bad",
      },
      { at: "18:00", label: "Plans next week", icon: "calendar" },
    ],
  },
  {
    personaId: "class",
    label: "Class coordinator",
    events: [
      { at: "08:45", label: "Students ask what's on", icon: "message" },
      {
        at: "11:00",
        label: "Forwards the mail to the class group",
        icon: "send",
        tone: "warn",
      },
      {
        at: "14:00",
        label: "Hunts for a free room",
        icon: "door",
        tone: "warn",
      },
      {
        at: "17:00",
        label: "Updates attendance on Moodle",
        icon: "checkCircle",
      },
    ],
  },
];

const PROBLEMS: Problem[] = [
  {
    id: "twice",
    text: "Every change done twice: timetable, then mail",
    personas: ["programme", "class"],
    severity: 5,
  },
  {
    id: "clash",
    text: "Clashes found by a phone call, after saving",
    personas: ["programme"],
    severity: 5,
  },
  {
    id: "requests",
    text: "Requests arrive by call, chat and mail",
    personas: ["programme", "class"],
    severity: 3,
  },
  {
    id: "seen",
    text: "No way to know who saw a change",
    personas: ["programme", "class"],
    severity: 4,
  },
  {
    id: "rooms",
    text: "Finding a free room means asking around",
    personas: ["programme", "class"],
    severity: 2,
  },
  {
    id: "questions",
    text: "Answering the same question all day",
    personas: ["class"],
    severity: 3,
  },
  {
    id: "term",
    text: "Building a term's timetable by hand",
    personas: ["programme"],
    severity: 4,
  },
];

const FEATURES: Feature[] = [
  {
    id: "edit-once",
    name: "Edit once. Everyone knows.",
    tagline:
      "Save a change, and the students and teachers it affects are told — by Plannr, not by you.",
    points: [
      "Drag a class to its new slot, and save",
      "Exactly the people affected are notified",
      "See who's seen it — no reply-all",
    ],
    solves: ["twice", "seen", "questions"],
    icon: "send",
  },
  {
    id: "clash-guard",
    name: "Clashes caught before you save",
    tagline: "Rooms, teachers and groups are checked as you place a class.",
    points: [
      "Rooms, teachers and groups checked as you drag",
      "A warning before a clash is saved — not a call after",
      "Clash-free alternatives, offered on the spot",
    ],
    solves: ["clash", "rooms"],
    icon: "shield",
  },
  {
    id: "inbox",
    name: "Every request, one inbox",
    tagline:
      "Faculty requests arrive in one queue, not in calls, chats and mails.",
    points: [
      "Extra lectures, room changes, cancellations — one queue",
      "Approve, and it's on the timetable",
      "Everyone affected is told as you approve",
    ],
    solves: ["requests"],
    icon: "inbox",
  },
];

const RANKED = rankProblems(PROBLEMS);
const TOP = RANKED.slice(0, 4);
const solvesOf = (f: Feature) =>
  PROBLEMS.filter((p) => f.solves.includes(p.id));

export const coordinators: SectionDef = {
  id: "coordinators",
  title: "Coordinators",
  speaker: "tanisha",
  slides: [
    {
      id: "coordinators",
      title: "Coordinators",
      notes: "Thanks, Ravya. I spent my week with the coordinators.",
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
          lede="The people who make the timetable — and remake it, every time something changes."
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
          eyebrow="Why coordinators"
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
        "I shadowed [three] coordinators at their desks, logged every change request that reached them for a week — [forty-plus] of them — and interviewed them about the start of term, which is when it all piles up.",
        "[Read one quote.] That first line is the whole problem in one sentence.",
      ],
      render: ({ step, active }) => (
        <InterviewSummary
          active={active}
          stakeholder="coordinators"
          eyebrow="Coordinators · Research"
          title="A week at the coordinator's desk."
          research={RESEARCH}
          step={step}
        />
      ),
    },
    {
      id: "coordinators-today",
      title: "One change, done four times",
      steps: 5,
      notes: [
        "This is one change, from the coordinator's side. It starts with a request — a call, a WhatsApp message, or a mail.",
        "Then they check clashes and rooms by hand: other classes, other teachers, which rooms are free.",
        "Then they edit the timetable.",
        "And then they write the same change again as a mail — and spend the rest of the afternoon answering replies.",
        "And after all of that, there's still no way to know who actually saw it.",
      ],
      render: ({ step }) => (
        <FlowDiagram
          eyebrow="Coordinators · Today"
          title="One change, done four times."
          accent="var(--coordinators)"
          nodes={[
            {
              id: "request",
              actor: "Request",
              action: "A teacher calls, messages or mails",
              icon: "message",
            },
            {
              id: "check",
              actor: "Check",
              action: "Clashes and rooms checked by hand",
              icon: "search",
              wait: "~20 min",
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
              action: "The same change written again, as a mail",
              icon: "mail",
              wait: "then the replies",
              tone: "bad",
            },
          ]}
          outcome="And still no way to know who actually saw it."
          step={step}
        />
      ),
    },
    {
      id: "coordinators-day",
      title: "A coordinator's day",
      steps: 2,
      notes: [
        "Here's a programme coordinator's day. Fourteen requests waiting at nine. Clash-checking by hand. The edit, then the same change again as a mail. And by three, the same question over and over: is it still on?",
        "The class coordinator sits closer to the students — forwarding mails to the class group, hunting for free rooms, and updating attendance in Moodle, a different app again.",
      ],
      render: ({ step, active }) => (
        <DayTimeline
          active={active}
          stakeholder="coordinators"
          eyebrow="Coordinators · Their days"
          title="A day spent repeating itself."
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
        "Everything the coordinators told us. Doing every change twice. Clashes found by a phone call, after they're saved. Requests arriving through three different channels. And never knowing who saw the change.",
      render: ({ step }) => (
        <ProblemBoard
          stakeholder="coordinators"
          eyebrow="Coordinators · What we heard"
          title="Everything they told us."
          problems={PROBLEMS}
          step={step}
        />
      ),
    },
    {
      id: "coordinators-ranking",
      title: "What hurts most",
      steps: 4,
      notes: [
        "Ranked the same way.",
        "Reach: programme coordinators, class coordinators, or both.",
        "Severity: what it costs.",
        "At the top: every change done twice, not knowing who saw it, requests from everywhere, and clashes found too late. [Placeholder ranking — swap in the logged requests.]",
      ],
      render: ({ step }) => (
        <ProblemRanking
          stakeholder="coordinators"
          eyebrow="Coordinators · Ranking"
          title="What hurts most."
          problems={PROBLEMS}
          personas={PERSONAS}
          top={4}
          step={step}
        />
      ),
    },
    {
      id: "coordinators-solutions",
      title: "What fixes each problem",
      steps: 2,
      notes: [
        "The top four.",
        "And three features that take the repetition out of the job.",
      ],
      render: ({ step }) => (
        <SolutionMap
          stakeholder="coordinators"
          eyebrow="Coordinators · Solutions"
          title="One answer for each."
          problems={TOP}
          features={FEATURES}
          step={step}
        />
      ),
    },
    {
      id: "coordinators-feature-edit",
      title: "Edit once. Everyone knows.",
      steps: 3,
      notes: [
        "First: edit once, and everyone knows. The coordinator drags the class to its new slot, and saves.",
        "Plannr tells exactly the students and the teacher it affects — nobody else, and nobody left out.",
        "And they can see who's seen it. No mail written, no reply-all, no 'is it still on?'.",
      ],
      render: ({ step, active }) => {
        const f = FEATURES[0]!;
        return (
          <FeatureShowcase
            stakeholder="coordinators"
            feature={f}
            number={1}
            solves={solvesOf(f)}
            visual={
              <EditOnceNotify
                step={step}
                active={active}
                flipId="coordinators-device"
              />
            }
            step={step}
          />
        );
      },
    },
    {
      id: "coordinators-feature-clash",
      title: "Clashes caught before you save",
      steps: 3,
      notes: [
        "Second: clashes are caught before they're saved. As you place a class, Plannr checks the room, the teacher and the group.",
        "If there's a clash, you get the warning now — not a phone call from the corridor later.",
        "And it offers you three slots that do work, with free rooms that fit the session.",
      ],
      render: ({ step, active }) => {
        const f = FEATURES[1]!;
        return (
          <FeatureShowcase
            stakeholder="coordinators"
            feature={f}
            number={2}
            solves={solvesOf(f)}
            visual={
              <ClashGuard
                step={step}
                active={active}
                flipId="coordinators-device"
              />
            }
            step={step}
          />
        );
      },
    },
    {
      id: "coordinators-feature-inbox",
      title: "Every request, one inbox",
      steps: 3,
      notes: [
        "Third: every request in one inbox. Extra lectures, room changes, cancellations — all in one queue instead of calls, chats and mails.",
        "Approve one, and it's on the timetable.",
        "And everyone it affects is told, as you approve it.",
      ],
      render: ({ step, active }) => {
        const f = FEATURES[2]!;
        return (
          <FeatureShowcase
            stakeholder="coordinators"
            feature={f}
            number={3}
            solves={solvesOf(f)}
            visual={
              <ApprovalsInbox
                step={step}
                active={active}
                flipId="coordinators-device"
              />
            }
            step={step}
          />
        );
      },
    },
    {
      id: "coordinators-handoff",
      title: "Over to Paras",
      notes:
        "That's coordinators. And behind every one of us are the people who keep the system itself running. Over to Paras.",
      render: ({ step }) => (
        <StakeholderMap
          eyebrow="Next"
          title="That's coordinators."
          highlight="admins"
          caption="Over to Paras — system admins."
          step={step}
        />
      ),
    },
  ],
};
