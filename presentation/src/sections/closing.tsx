import { Of, pct } from "~/content/research";
import { PROJECT } from "~/content/team";
import type { SectionDef } from "~/deck/types";
import { Findings } from "~/templates/Findings";
import { MergeApps } from "~/templates/MergeApps";
import { OpenSource } from "~/templates/OpenSource";
import { Roadmap } from "~/templates/Roadmap";
import { Thanks } from "~/templates/Thanks";
import { Grad } from "~/ui/layout";

/*
 * Section 05 — Paras closes: what we found (from the data, for the three
 * groups in scope), the four apps Plannr replaces, the roadmap in four phases
 * (three built, one later), and an invitation to build it with us.
 */

export const closing: SectionDef = {
  id: "closing",
  title: "What’s next",
  speaker: "paras",
  slides: [
    {
      id: "findings",
      title: "What we found",
      steps: 4,
      notes: [
        "So, what did all of this add up to? From students: changes reach them last. 73% say the timetable doesn't tell them when a class changes. They hear it from WhatsApp, from a friend, or not at all.",
        "From faculty: lecture time goes on admin. Attendance set up by hand after every lecture, marks merged in Excel, and every change going through someone else. And more than one asked for a single place where changes reach them.",
        "From coordinators: every change is written three times. 3 of 4 announce each change by hand, by mail and then on WhatsApp, and 2 of 4 type up the day's report by hand every evening.",
        "Put together, it's one finding. Notices are the strongest need across every group: students at 73%, coordinators at 3 of 4, faculty asking for one place. The college doesn't need a better notice board. It needs one source of truth — that tells people when it changes.",
      ],
      render: ({ step }) => (
        <Findings
          title="Three groups, one finding."
          findings={[
            {
              stakeholder: "students",
              icon: "bell",
              title: "Students hear about changes last.",
              body: (
                <>
                  {pct({ count: 8, of: 11 })} say the timetable doesn’t tell
                  them when a class changes.
                </>
              ),
            },
            {
              stakeholder: "faculty",
              icon: "clipboard",
              title: "Faculty lose lecture time to paperwork.",
              body: "Attendance by hand, marks in Excel, every change through someone else.",
            },
            {
              stakeholder: "coordinators",
              icon: "refresh",
              title: "Coordinators retype every change.",
              body: (
                <>
                  <Of t={{ count: 3, of: 4 }} /> announce each change by hand;{" "}
                  <Of t={{ count: 2, of: 4 }} /> type up the day’s report.
                </>
              ),
            },
          ]}
          conclusion={
            <>
              One source of truth,{" "}
              <Grad brand>that tells people when it changes.</Grad>
            </>
          }
          step={step}
        />
      ),
    },
    {
      id: "combined",
      title: "What we combined",
      steps: 2,
      notes: [
        "Today, one college day runs through four apps that don't talk to each other: the timetable site for classes and rooms, the class WhatsApp group for the news, second-hand, Moodle for assignments, tests and attendance, and Gmail for every change, written by hand.",
        "Plannr is all four, in one place. Classes and rooms, notices to exactly the people a change affects, attendance, tests and deadlines, all from one source of truth: change it once, and everyone who needs to know, knows. Course material uploads stay future scope.",
      ],
      render: ({ step }) => (
        <MergeApps
          title="Four apps in. One out."
          apps={[
            { name: "Timetable", does: "Classes and rooms", icon: "grid" },
            {
              name: "WhatsApp",
              does: "The news, second-hand",
              icon: "whatsapp",
            },
            {
              name: "Moodle",
              does: "Assignments, tests, attendance",
              icon: "cap",
            },
            { name: "Gmail", does: "Every change, by hand", icon: "mail" },
          ]}
          tagline={
            <>
              One place. <Grad>One source of truth.</Grad>
            </>
          }
          step={step}
        />
      ),
    },
    {
      id: "future",
      title: "What's built, and what's next",
      steps: 4,
      notes: [
        "Here's where that leaves us. Built, and running today: everyone's own timetable, always current; attendance registers straight from the timetable; and requests, approvals and the planner that generates a term's week.",
        "Built too: the changes. Notices of each change, to exactly the people it affects. The day's report, written for coordinators. Availability entered once by visiting faculty, and students checking themselves in with a code.",
        "And coursework, the other half of a college day: test dates and marks, entered against the college's own assessment plan, and every deadline sitting right beside your classes. Faculty stop merging marks in Excel.",
        "What comes later is everything else: course material and file uploads, one login for every college system, and taking Plannr beyond our college. Students asked for these, but they're a far stretch from what we set out to automate.",
      ],
      render: ({ step }) => (
        <Roadmap
          title="What’s built, and what’s next."
          startLabel={null}
          phases={[
            {
              label: "Timetable",
              title: "Your day, your teaching",
              items: [
                "Your own timetable, always current",
                "Attendance straight from the timetable",
                "Requests, approvals and the planner",
              ],
              status: "done",
            },
            {
              label: "Changes",
              title: "Notices and reports",
              items: [
                "Notices to exactly who’s affected",
                "The day’s report, written for you",
                "Availability once; check-in codes",
              ],
              status: "done",
            },
            {
              label: "Coursework",
              title: "Tests and assignments",
              items: [
                "Test dates and marks",
                "Deadlines beside your classes",
                "The college’s assessment plan",
              ],
              status: "done",
            },
            {
              label: "Later",
              title: "Everything else",
              items: [
                "Course material and file uploads",
                "One login for every college system",
                "Any college, not just ours",
              ],
              status: "later",
            },
          ]}
          step={step}
        />
      ),
    },
    {
      id: "open-source",
      title: "Build it with us",
      steps: 2,
      notes: [
        "And this is where we need you. Plannr is open source. The code is public, and it's built by students, for students — but we can't do it alone.",
        "If you write code, there are issues waiting for first-timers. If you design, we need screens and research. If you just use it, tell us what breaks. And if you know a coordinator, a teacher, or a college that should be on it — introduce us. Scan the code; it takes you straight to the repository.",
      ],
      render: ({ step }) => (
        <OpenSource
          title={
            <>
              Build it <Grad>with us.</Grad>
            </>
          }
          lede="Plannr is open source. If you design, code or test, or just have opinions about the timetable, there’s a place for you."
          repoUrl={PROJECT.repoUrl}
          repoLabel={PROJECT.repo}
          asks={[
            {
              icon: "code",
              title: "Code",
              body: "Next.js, TypeScript and Postgres, with issues for first-timers",
            },
            {
              icon: "sparkles",
              title: "Design",
              body: "Screens, flows, and research with real users",
            },
            {
              icon: "checkCircle",
              title: "Test",
              body: "Use it for your own classes; tell us what breaks",
            },
            {
              icon: "megaphone",
              title: "Spread it",
              body: "Bring your class, your coordinator, your college",
            },
          ]}
          step={step}
        />
      ),
    },
    {
      id: "thanks",
      title: "Thank you",
      chrome: false,
      notes: "Thank you. We'd love to take your questions.",
      render: ({ step, active }) => (
        <Thanks
          title="Thank you."
          subtitle="Questions?"
          footer={`${PROJECT.url} · ${PROJECT.repo}`}
          step={step}
          active={active}
        />
      ),
    },
  ],
};
