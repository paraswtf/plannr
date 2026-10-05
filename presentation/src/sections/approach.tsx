import type { SectionDef } from "~/deck/types";
import { NumberedPoints } from "~/templates/NumberedPoints";
import { QuestionsBoard } from "~/templates/QuestionsBoard";
import { QuotePortrait } from "~/templates/QuotePortrait";
import { StakeholderMap } from "~/templates/StakeholderMap";
import { Grad } from "~/ui/layout";

/*
 * Section 01 — Paras on how we researched: one stakeholder each, a week each,
 * questions about people's days rather than about software. Ends by handing
 * over to Sonal.
 */

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
        "Second: a full week. Each of us spent an entire week with their user — learning every pattern, and all the work they actually do in a day.",
        "Third: we asked about their day, not about our app. More on that in a second.",
        "And fourth: no features until every pattern was mapped. Design came last, not first.",
      ],
      render: ({ step }) => (
        <NumberedPoints
          eyebrow="Our approach"
          title="How we did the research."
          points={[
            {
              title: "One stakeholder each",
              body: "Four of us, four kinds of user. Each of us owned one.",
              icon: "users",
            },
            {
              title: "A full week with them",
              body: "We followed their days, not a questionnaire.",
              icon: "calendar",
            },
            {
              title: "Their day, not our app",
              body: "We asked how they live — never what they'd like us to build.",
              icon: "message",
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
      title: "Four people use the timetable",
      steps: 2,
      notes: [
        "These are the four. Students, who read the timetable every day. Faculty — both full-time internal faculty, and external faculty: guest lecturers and people who come in from other colleges, paid per lecture. Coordinators, who make and change the timetable. And the system admins and management behind it all.",
        "Sonal took students, Ravya took faculty, Tanisha took coordinators, and I took the admins. Each of us spent our week with only that one group.",
      ],
      render: ({ step }) => (
        <StakeholderMap
          eyebrow="Who we studied"
          title={
            <>
              Four people use the timetable. <Grad>Not one.</Grad>
            </>
          }
          revealOwners
          step={step}
        />
      ),
    },
    {
      id: "approach-questions",
      title: "We asked about their day",
      steps: 2,
      notes: [
        "Our questions were about people, not software. What's a normal college day like for you? When do you wake up — and what's the first thing you check? How did you hear about the last class that moved? Who do you ask when you're not sure?",
        "What we deliberately did not ask was: what problems do you have with the timetable, or which features do you want. People are used to the process. Ask them about the system and you get small complaints. Ask them about their day, and you see the whole job they are doing around it.",
      ],
      render: ({ step }) => (
        <QuestionsBoard
          eyebrow="What we asked"
          title={
            <>
              We asked about their day — <Grad>not about the app.</Grad>
            </>
          }
          asked={[
            "What does a normal college day look like for you?",
            "When do you wake up, and what do you check first?",
            "How did you hear about the last class that moved?",
            "Walk me through the last time you were late.",
            "Who do you ask when you're not sure?",
          ]}
          notAsked={[
            "What problems do you have with the timetable?",
            "Which features would you like?",
            "Would you use an app for this?",
          ]}
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
        "That is exactly what we found. Hardly anybody we met complained about the timetable — they've stopped seeing the problem, because they're used to working around it. So our job wasn't to collect complaints. It was to understand the process, and make it simpler.",
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
              Our users had stopped seeing the problem. Our job was to make the{" "}
              <Grad>process</Grad> simpler.
            </>
          }
          step={step}
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
          eyebrow="First up"
          title="The people who read it most."
          highlight="students"
          caption="Over to Sonal — students."
          step={step}
        />
      ),
    },
  ],
};
