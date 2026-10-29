import { PROJECTION, Projected } from "~/content/research";
import { OUT_OF_SCOPE } from "~/content/team";
import type { SectionDef } from "~/deck/types";
import { NumberedPoints } from "~/templates/NumberedPoints";
import { QuestionsBoard } from "~/templates/QuestionsBoard";
import { QuotePortrait } from "~/templates/QuotePortrait";
import { SampleOverview } from "~/templates/SampleOverview";
import { ScopeTiers } from "~/templates/ScopeTiers";
import { StakeholderMap } from "~/templates/StakeholderMap";
import { Grad } from "~/ui/layout";
import { Ph } from "~/ui/placeholder";

/*
 * Section 01 — Paras on how we researched: one stakeholder each, interviews
 * about people's days first and a survey to count the problems after, who we
 * heard from, and what the project sets out to automate (the scope every
 * ranking weighs). Ends by handing over to Sonal.
 *
 * "Who we heard from" is where the system admins are struck off: we decided
 * during the research that they play little part in running the timetable
 * and Moodle, so they are out of scope (OUT_OF_SCOPE in src/content/team.ts)
 * and crossed out on every stakeholder map after it.
 */

/** How many times the first round the head counts are shown at, in words. */
const PROJECTED_AS = PROJECTION === 2 ? "twice" : `${PROJECTION} times`;

export const approach: SectionDef = {
  id: "approach",
  title: "Our approach",
  speaker: "paras",
  slides: [
    {
      id: "approach-rules",
      title: "How we did the research",
      steps: 4,
      notes: [
        "Before designing anything, we set ourselves a few rules. The first: one stakeholder each. Four of us, four kinds of people who touch the timetable.",
        "Second: interviews, then a survey. Each of us sat with our people first and heard how their day actually goes. Only after that did we put the problems we'd heard into a short survey, to see how many people really have them.",
        "Third: their day first. We asked how they work before we asked what would help. More on that in a second.",
        "And fourth: no features until every pattern was mapped. Design came last, not first.",
      ],
      render: ({ step }) => (
        <NumberedPoints
          title="How we did the research."
          points={[
            {
              title: "One stakeholder each",
              body: "Four of us, four kinds of user. Each of us owned one.",
              icon: "users",
            },
            {
              title: "Interviews, then a survey",
              body: "We heard their day first, then checked it with numbers.",
              icon: "clipboard",
            },
            {
              title: "Their day first",
              body: "We asked how they work, then what would help.",
              icon: "calendar",
            },
            {
              title: "Patterns before features",
              body: "Nothing was designed until every routine was mapped.",
              icon: "layers",
            },
          ]}
          step={step}
        />
      ),
    },
    {
      id: "approach-owners",
      title: "Four kinds of people use the timetable",
      steps: 2,
      notes: [
        "These are the four. Students, who read the timetable every day. Faculty — both full-time internal faculty, and visiting faculty: guest lecturers and people who come in from other colleges, paid per lecture. Coordinators, who make and change the timetable. And the system admins and management behind it all.",
        "Sonal took students, Ravya took faculty, Tanisha took coordinators, and I took the admins. Each of us spent our week with only that one group.",
      ],
      render: ({ step }) => (
        <StakeholderMap
          title={
            <>
              Four kinds of people use the timetable. <Grad>Not one.</Grad>
            </>
          }
          revealOwners
          step={step}
        />
      ),
    },
    {
      id: "approach-sample",
      title: "Who we heard from",
      steps: 2,
      notes: [
        "This is who we heard from. Sonal had 15 students answer four open questions about their day, and 11 took the survey, all in their third and fourth year. Ravya interviewed 10 faculty across two institutes, SICSR and SIG, in person and by phone. Tanisha sat with 4 coordinators at their desks. One honest note: this is our first round, and a second is on the way.",
        "And the system admins, the group I took. During our research we decided we didn't need them: they don't have a big role in running the timetable or Moodle. So we struck them off. They're out of scope.",
      ],
      render: ({ step, active }) => (
        <SampleOverview
          title="Who we heard from."
          groups={[
            {
              stakeholder: "students",
              figures: [
                {
                  value: <Projected n={15} />,
                  label: "answered four open questions",
                },
                { value: <Projected n={11} />, label: "took the survey" },
              ],
              methods: ["Open questions and a survey", "Third and fourth year"],
            },
            {
              stakeholder: "faculty",
              figures: [
                { value: <Projected n={10} />, label: "interviewed" },
                { value: "2", label: "institutes" },
              ],
              methods: ["SICSR and SIG", "In person and by phone"],
            },
            {
              stakeholder: "coordinators",
              figures: [{ value: <Projected n={4} />, label: "interviewed" }],
              methods: ["At their desks, SICSR"],
            },
            {
              stakeholder: "admins",
              figures: [],
              methods: [],
              struck: {
                verdict: "Out of scope",
                reason:
                  "During our research we found they play little part in running the timetable and Moodle.",
              },
            },
          ]}
          footnote={
            PROJECTION > 1 ? (
              <Ph note="Remove once the second round is in">
                Head counts shown at {PROJECTED_AS} the first round until the
                second is in
              </Ph>
            ) : undefined
          }
          step={step}
          active={active}
        />
      ),
    },
    {
      id: "approach-questions",
      title: "We asked about their day",
      steps: 2,
      notes: [
        "We started with their day, not with software. Sonal's students answered four written questions: how do you find and follow your schedule each day, what goes wrong with how you do it now, how do you work around it, and which apps do you use for it. Ravya and Tanisha sat with faculty and coordinators and asked them to walk us through their day, and only then what would help them.",
        "What we never asked was which features they'd like, or what we should build. What would help them is a need; a feature list is our job. People are used to the process. Ask them about the system and you get small complaints. Ask them about their day, and you see the whole job they are doing around it. Only after the interviews did we run a short survey, built from what they'd told us, to count how many people have each problem.",
      ],
      render: ({ step }) => (
        <QuestionsBoard
          title={
            <>
              We asked about <Grad>their day</Grad> first.
            </>
          }
          asked={[
            "How do you find and follow your schedule?",
            "What goes wrong with how you do it now?",
            "How do you work around it?",
            "Which apps do you use for it?",
            "Walk me through your day. What would help?",
          ]}
          notAsked={["Which features would you like?", "What should we build?"]}
          step={step}
        />
      ),
    },
    {
      id: "approach-quote",
      title: "People don't know what they want",
      steps: 2,
      chrome: false,
      notes: [
        "This approach was inspired by how Apple thinks about design. Steve Jobs put it like this in 1998: “A lot of times, people don't know what they want until you show it to them.”",
        "That is what we found. When we asked, people did name problems, but most had stopped noticing the work they do around them: asking the group, checking the mail twice, copying the week down by hand. So our job wasn't to collect complaints. It was to understand the process, and make it simpler.",
      ],
      render: ({ step }) => (
        <QuotePortrait
          image={{
            src: "/images/steve-jobs.jpg",
            alt: "Steve Jobs",
            credit: "Photo: Matthew Yohe, CC BY-SA 3.0, via Wikimedia Commons",
            position: "50% 30%",
          }}
          imageLabel="Portrait: Steve Jobs"
          quote="A lot of times, people don't know what they want until you show it to them."
          author="Steve Jobs"
          role="Co-founder and CEO, Apple"
          source="BusinessWeek, May 1998"
          takeaway={
            <>
              Our users had learned to work around it. Our job was to make the{" "}
              <Grad>process</Grad> simpler.
            </>
          }
          step={step}
        />
      ),
    },
    {
      id: "approach-scope",
      title: "What we set out to automate",
      steps: 3,
      notes: [
        "One more thing before the findings: what we set out to automate. The core is everything a college day runs on: the timetable, attendance, scheduling classes, tracking which ones ran, and tests and assignments too. That's the job, and a problem there counts in full.",
        "Everything else, file uploads, course material and the rest, is future scope. A far stretch for now, so a problem there counts for a fifth as much.",
        "That gives every problem a score: how many people have it, times how much it hurts, times how close it is to what we automate. One thing to keep in mind: the scores rank problems within one group. They never compare students against faculty.",
      ],
      render: ({ step, active }) => (
        <ScopeTiers
          title="What we set out to automate."
          tiers={[
            {
              scope: "core",
              items: [
                { icon: "calendar", label: "Timetable" },
                { icon: "checkCircle", label: "Attendance" },
                { icon: "plus", label: "Class scheduling" },
                { icon: "chart", label: "Class tracking" },
                { icon: "clipboard", label: "Tests" },
                { icon: "book", label: "Assignments" },
              ],
            },
            {
              scope: "future",
              items: [
                { icon: "upload", label: "File uploads" },
                { icon: "file", label: "Course material" },
                { icon: "layers", label: "Everything else" },
              ],
            },
          ]}
          formula={
            <>
              Score = reach × severity × <Grad>scope</Grad>
            </>
          }
          step={step}
          active={active}
        />
      ),
    },
    {
      id: "approach-handoff",
      title: "Over to Sonal",
      notes:
        "With that said — here's Sonal, to take you through everything we learned from students.",
      render: ({ step }) => (
        <StakeholderMap
          title="The people who read it most."
          highlight="students"
          struck={OUT_OF_SCOPE}
          caption="Over to Sonal, for students."
          step={step}
        />
      ),
    },
  ],
};
