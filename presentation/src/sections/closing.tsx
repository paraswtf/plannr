import { PROJECT } from "~/content/team";
import type { SectionDef } from "~/deck/types";
import { Credits } from "~/templates/Credits";
import { Findings } from "~/templates/Findings";
import { MergeApps } from "~/templates/MergeApps";
import { OpenSource } from "~/templates/OpenSource";
import { Roadmap } from "~/templates/Roadmap";
import { Thanks } from "~/templates/Thanks";
import { Grad } from "~/ui/layout";
import { Ph } from "~/ui/placeholder";

/*
 * Section 06 — Paras closes: what we found, what we combined, what comes
 * next, an invitation to build it with us, and the credits.
 */

export const closing: SectionDef = {
  id: "closing",
  title: "What's next",
  speaker: "paras",
  slides: [
    {
      id: "findings",
      title: "What we found",
      steps: 5,
      notes: [
        "So, what did four weeks with four kinds of people add up to? From students: they don't need more information. They need the right information, in time.",
        "From faculty: they want to act, not ask. Scheduling, rooms, even getting paid — today it all goes through someone else.",
        "From coordinators: every change is done twice — once in the timetable, once in a mail — and they still can't tell who saw it.",
        "And from the admins: the data is kept right by hand, one row at a time, with no way to see the whole picture.",
        "Put together, it's one finding. The college doesn't need a better notice board. It needs one source of truth — that tells people when it changes.",
      ],
      render: ({ step }) => (
        <Findings
          eyebrow="What we found"
          title="Four weeks, four kinds of people, one finding."
          findings={[
            {
              stakeholder: "students",
              icon: "bell",
              title: "Students need the right information, in time.",
              body: "Most of it exists — it just reaches them by mail, late, or not at all.",
            },
            {
              stakeholder: "faculty",
              icon: "calendar",
              title: "Faculty want to act, not ask.",
              body: "Scheduling, rooms and payment all go through someone else today.",
            },
            {
              stakeholder: "coordinators",
              icon: "refresh",
              title: "Coordinators do every change twice.",
              body: "Once in the timetable, once in a mail — and can't tell who saw it.",
            },
            {
              stakeholder: "admins",
              icon: "database",
              title: "Admins fix data a row at a time.",
              body: "No bulk tools, no dashboard, and slow pages for everyone.",
            },
          ]}
          conclusion={
            <>
              One source of truth —{" "}
              <Grad>that tells people when it changes.</Grad>
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
        "So that's what we built. Today there's the timetable for classes, Moodle for assignments, material and attendance, and email for every change — three apps that don't talk to each other.",
        "Plannr is all three, in one place. One source of truth: change it once, and everyone who needs to know, knows.",
      ],
      render: ({ step }) => (
        <MergeApps
          eyebrow="What we combined"
          title="Three apps in. One out."
          apps={[
            { name: "Timetable", does: "Classes and rooms", icon: "grid" },
            {
              name: "Moodle",
              does: "Assignments, material, attendance",
              icon: "cap",
            },
            { name: "Email", does: "Every change, by hand", icon: "mail" },
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
      title: "Future scope",
      steps: 3,
      notes: [
        "Where does it go from here? Next, we bring in what Moodle does today: assignments and deadlines on your day, course material beside each class, and attendance in the same place.",
        "Then we put it wherever you are: an installable app that works offline, push notifications, and a daily digest for the people who never open an app.",
        "And later — any college. Plannr is open source and built so another institution can run it, import its own timetable, and give its management real numbers. [Adjust the phases to the actual plan.]",
      ],
      render: ({ step }) => (
        <Roadmap
          eyebrow="Future scope"
          title="What we're building next."
          phases={[
            {
              label: "Next",
              title: "Everything Moodle does",
              items: [
                "Assignments and deadlines on your day",
                "Course material beside each class",
                <Ph key="att">Attendance in the same place</Ph>,
              ],
              status: "next",
            },
            {
              label: "Then",
              title: "Wherever you are",
              items: [
                "An installable app that works offline",
                "Push notifications",
                <Ph key="dig">A daily digest by mail or WhatsApp</Ph>,
              ],
              status: "next",
            },
            {
              label: "Later",
              title: "Any college",
              items: [
                "Self-hostable, open source",
                "Import from any timetable system",
                <Ph key="ana">Analytics for management</Ph>,
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
          eyebrow="We need your help"
          title={
            <>
              Build it <Grad>with us.</Grad>
            </>
          }
          lede="Plannr is open source. If you design, code, test — or just have opinions about the timetable — there's a place for you."
          repoUrl={PROJECT.repoUrl}
          repoLabel={PROJECT.repo}
          asks={[
            {
              icon: "code",
              title: "Code",
              body: "Next.js, TypeScript and Postgres — with issues for first-timers",
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
      id: "credits",
      title: "Credits",
      notes:
        "Before we finish: this project is funded by Rivant, as part of its contribution to the open-source community. At Rivant we build things that are used by people — and every one of them starts the way this one did: by watching how people actually work. And of course — Sonal, Ravya, Tanisha: thank you.",
      render: ({ step }) => (
        <Credits
          eyebrow="Credits"
          title="Built by students. Backed by Rivant."
          sponsor={{
            name: "Rivant",
            line: "Plannr is funded by Rivant, as part of its contribution to the open-source community.",
            about:
              "We build things that are used by people — and every one starts by watching how they work.",
          }}
          team={["paras", "sonal", "ravya", "tanisha"]}
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
