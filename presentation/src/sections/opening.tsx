import type { SectionDef } from "~/deck/types";
import { Cover } from "~/templates/Cover";
import { FlowDiagram } from "~/templates/FlowDiagram";
import { VisualSlide } from "~/templates/VisualSlide";
import { Grad } from "~/ui/layout";
import { AppIcon } from "~/visuals/opening/_app-icons";
import { FacultyHunt } from "~/visuals/opening/FacultyHunt";
import { IssueWall } from "~/visuals/opening/IssueWall";
import { NoticeBoard } from "~/visuals/opening/NoticeBoard";
import { OldTimetable } from "~/visuals/opening/OldTimetable";
import { ThreeApps } from "~/visuals/opening/ThreeApps";

/*
 * Section 00 — Paras introduces the project: what the timetable is today,
 * and why it is not a timetable problem but a whole-process problem.
 */

const ISSUES = [
  "Hard to use on a phone",
  "Slow to load",
  "No app to install",
  "Useless offline, in labs and basements",
  "Click-only: no touch, swipe or keys",
  "No timetable of your own",
  "Clashes saved without a warning",
  "An edit tells nobody",
  "Every change arrives as a mail",
  "Tests and deadlines live elsewhere",
  "Rooms booked without a projector",
  "No way to find a free room",
];

export const opening: SectionDef = {
  id: "opening",
  title: "The project",
  speaker: "paras",
  slides: [
    {
      id: "cover",
      title: "Presenting Plannr",
      chrome: false,
      notes:
        "Good morning, everyone. We're Paras, Sonal, Ravya and Tanisha, and today we're presenting Plannr — a design thinking project about the one app every person in this room opens every single day: the college timetable. I'll set up the problem, then each of us will walk you through one group of people we spent a week with.",
      render: ({ step, active }) => (
        <Cover
          kicker="Design Thinking · UI/UX"
          title={
            <>
              Presenting <Grad brand>Plannr</Grad>
            </>
          }
          subtitle="One source of truth for every academic update."
          team={["paras", "sonal", "ravya", "tanisha"]}
          footer="SICSR, Pune · 2026"
          step={step}
          active={active}
        />
      ),
    },
    {
      id: "intro-project",
      title: "We wanted to simplify everyone's schedules",
      steps: 5,
      notes: [
        "Plannr is a replacement for the timetable app we all use today. This is it — time-table.sicsr.ac.in. One huge page for the entire college: every room, every course, every hour. To be fair, it does show the timetable. But that is all it does.",
        "Look at what it asks of you. It's one page for everybody, so first you hunt for your own division. And the names are cut off mid-word: to see the class and the teacher, you hover over each one. (Hover any booking to show it.)",
        "It's built for a desktop, but almost all of us open it on a phone. This is the same page on a phone: nothing adapts, it just shrinks, and every name is down to a few letters. And there's no hover on a phone.",
        "It loads the whole college on every visit.",
        "And it isn't even served securely. That's where we started — but the real problem isn't this page. It's everything people do around it.",
      ],
      render: ({ step, active }) => (
        <VisualSlide
          title={
            <>
              We wanted to simplify <Grad>everyone&apos;s schedules.</Grad>
            </>
          }
          lede="Plannr combines the best features from all the apps you already use and gives you a single place to look at."
          footer={
            <>
              <AppIcon app="gmail" />
              <AppIcon app="whatsapp" />
              <AppIcon app="moodle" />
            </>
          }
          visual={
            <OldTimetable step={step} active={active} flipId="app-timetable" />
          }
          step={step}
        />
      ),
    },
    {
      id: "three-apps",
      title: "Three places and conflicting information",
      steps: 3,
      notes: [
        "Today a student lives in three places. The timetable site, for classes. Gmail, for every change to them. And the class WhatsApp group, where the news actually travels.",
        "Here's what that looks like on a normal morning. A coordinator sends a mail: Design Thinking has moved from nine to two o'clock, room 406.",
        "But the timetable still says nine, room 405 — the mail went out, and the timetable was never updated. And the class group says something else again: three o'clock, room 701. So which one do you believe? Three places, three answers, and it's on the student to work out the right one every morning.",
      ],
      render: ({ step, active }) => (
        <VisualSlide
          layout="below"
          title={
            <>
              Three places and <Grad>conflicting information.</Grad>
            </>
          }
          visual={<ThreeApps step={step} active={active} />}
          step={step}
        />
      ),
    },
    {
      id: "change-flow",
      title: "How extra lectures are scheduled right now",
      steps: 6,
      notes: [
        "Let's follow one change through the system. A teacher wants to schedule an extra lecture. There is no way for them to do that themselves — so they have to ask the coordinator.",
        "And they ask however they can — a call, a mail, in person, or they just send a student over. The coordinator then updates the timetable manually.",
        "Then they announce the same change again, as a mail to the entire batch, because the timetable tells nobody that anything changed.",
        "And sometimes the update never happens. For a last-minute change, the mail goes straight out — and now the timetable is out of sync.",
        "So the students check the timetable — if it was updated at all.",
        "Three human points of failure, and every one of them can easily be automated. If any one of them slips, somebody walks into an empty room.",
      ],
      render: ({ step }) => (
        <FlowDiagram
          title="How extra lectures are scheduled right now."
          nodes={[
            {
              id: "faculty",
              actor: "Faculty",
              action: "Asks the coordinator for an extra lecture",
              icon: "book",
            },
            {
              id: "edit",
              actor: "Coordinator",
              action: "Updates the timetable manually",
              icon: "edit",
              wait: "via call, mail, in person or a student",
              waitIcon: "message",
            },
            {
              id: "mail",
              actor: "Coordinator",
              action: "Announces the change via mail to an entire batch",
              icon: "mail",
              wait: "if they remember",
              tone: "warn",
            },
            {
              id: "students",
              actor: "Students",
              action: "Check the timetable, if it was updated at all",
              icon: "users",
              wait: "whenever they look",
              tone: "bad",
            },
          ]}
          skip={{
            from: "faculty",
            to: "mail",
            label: "timetable out of sync",
            icon: "linkBroken",
          }}
          outcome="Three human points of failure that can be easily automated."
          step={step}
        />
      ),
    },
    {
      id: "find-faculty",
      title: "There's no page for a person",
      steps: 3,
      notes: [
        "Now try to find a teacher. Say you need to see a professor before a deadline. Where is she right now?",
        "If you know which courses she teaches, you open each course's timetable and go through every lecture, looking for her name.",
        "And if you don't know? Then you go through every course running that day. Hundreds of cells, for one person. The information is all there — it's just organised for nobody.",
      ],
      render: ({ step, active }) => (
        <VisualSlide
          title="There's no page for a person."
          lede="To find one teacher, you read the timetable of every course they might teach."
          visual={<FacultyHunt step={step} active={active} />}
          step={step}
        />
      ),
    },
    {
      id: "more-issues",
      title: "And many more",
      steps: 2,
      notes: [
        "And there are many more. It's hard to use on a phone, and slow on mobile data. There's no app, it doesn't work offline in the labs, and it only understands mouse clicks. Clashes get saved without a warning. Rooms get booked without a projector.",
        "When we kept asking why, every one of these led back to one decision: the timetable was built as a notice board — a document to publish — not as a system that knows who you are and tells you when something changes. That's what we set out to fix. But first, how we went about it.",
      ],
      render: ({ step, active }) => (
        <VisualSlide
          layout="below"
          title="That's just the start."
          visual={
            <IssueWall
              step={step}
              active={active}
              issues={ISSUES}
              rootCause={<NoticeBoard step={step} />}
            />
          }
          step={step}
        />
      ),
    },
  ],
};
