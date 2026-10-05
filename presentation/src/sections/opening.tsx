import type { SectionDef } from "~/deck/types";
import { Cover } from "~/templates/Cover";
import { FlowDiagram } from "~/templates/FlowDiagram";
import { VisualSlide } from "~/templates/VisualSlide";
import { Grad } from "~/ui/layout";
import { FacultyHunt } from "~/visuals/opening/FacultyHunt";
import { IssueWall } from "~/visuals/opening/IssueWall";
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
      title: "We're replacing the timetable",
      steps: 5,
      notes: [
        "Plannr is a replacement for the timetable app we all use today. This is it — time-table.sicsr.ac.in. One huge page for the entire college: every room, every course, every hour. To be fair, it does show the timetable. But that is all it does.",
        "Look at what it asks of you. It's one page for everybody, so first you hunt for your own division.",
        "It's built for a desktop, but almost all of us open it on a phone.",
        "It loads the whole college on every visit.",
        "And it isn't even served securely. That's where we started — but the real problem isn't this page. It's everything people do around it.",
      ],
      render: ({ step, active }) => (
        <VisualSlide
          title={
            <>
              We&apos;re replacing the <Grad>college timetable.</Grad>
            </>
          }
          lede="Plannr takes over from the timetable site, and from the mails, calls and spreadsheets that hold it together."
          visual={
            <OldTimetable
              step={step}
              active={active}
              flipId="app-timetable"
              stepped
            />
          }
          step={step}
        />
      ),
    },
    {
      id: "three-apps",
      title: "Three apps, no single source of truth",
      steps: 3,
      notes: [
        "Today a student lives in three places. The timetable site, for classes. Moodle, for assignments, material and attendance. And email, for every change to either of them.",
        "Here's what that looks like on a normal morning. A coordinator sends a mail: Design Thinking has moved to two o'clock, room 304.",
        "But the timetable still says eleven, room 301 — the mail went out, and the data was never updated anywhere. Moodle says something else again. So which one do you believe? There is no single source of truth, and it's on the student to reconcile three apps every morning.",
      ],
      render: ({ step, active }) => (
        <VisualSlide
          layout="below"
          title={
            <>
              Three apps. <Grad>No single source of truth.</Grad>
            </>
          }
          visual={<ThreeApps step={step} active={active} />}
          step={step}
        />
      ),
    },
    {
      id: "change-flow",
      title: "One change, passed by hand",
      steps: 5,
      notes: [
        "Let's follow one change through the system. A teacher wants to schedule an extra lecture. There is no way for them to do that themselves — so they have to ask the coordinator.",
        "And they ask however they can — a call, a mail, in person, or they just send a student over. The coordinator then updates the timetable by hand.",
        "Then they write the same change out again, as an email, because the timetable tells nobody that anything changed.",
        "And the students check the timetable — if it was updated at all. For a last-minute change, sometimes only the mail goes out, and the timetable is never updated.",
        "Four hand-offs, every single one done by a person. If any one of them slips, somebody walks into an empty room.",
      ],
      render: ({ step }) => (
        <FlowDiagram
          title="One change, passed along by hand."
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
              action: "Updates the timetable by hand",
              icon: "edit",
              wait: "via call, mail, in person or a student",
              waitIcon: "message",
            },
            {
              id: "mail",
              actor: "Coordinator",
              action: "Writes the same change again, as a mail",
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
          outcome="Four hand-offs, all done by people, and nothing notices when one is missed."
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
              rootCause={
                <>
                  The timetable was built as a <Grad>notice board</Grad>, not a
                  system.
                </>
              }
            />
          }
          step={step}
        />
      ),
    },
  ],
};
