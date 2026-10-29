import type { ReactNode } from "react";

import type { IconName } from "~/ui/icon";

/*
 * The shapes each stakeholder section fills in. Every section file
 * (src/sections/<stakeholder>.tsx) builds the same kinds of slide out of
 * these, so filling in research means editing data, not layout.
 */

/** A kind of user inside a stakeholder group: "the 6am planner". */
export interface Persona {
  /** Stable id; problems refer to personas by it. Also used in flip ids. */
  id: string;
  /** "The Planner" */
  name: string;
  /** One line that sums them up. */
  tagline: ReactNode;
  icon: IconName;
  /** Three or four short habits or facts. */
  traits: ReactNode[];
  /** How many of the people we met were like this, e.g. "5 of 14". */
  share?: ReactNode;
}

/** Something that happens in a persona's day. */
export interface DayEvent {
  /** 24-hour "HH:MM". */
  at: string;
  label: ReactNode;
  icon?: IconName;
  /**
   * Emphasis, if a day ever needs it (good: works fine · warn: friction ·
   * bad: where it breaks). The deck's days leave it out: they show how a day
   * runs, not where it goes wrong.
   */
  tone?: "neutral" | "good" | "warn" | "bad";
}

/** One row of a day timeline: a persona, and what their day looks like. */
export interface DayLane {
  /** Matches a Persona id, so the lane label can morph into its card. */
  personaId: string;
  label: string;
  sublabel?: ReactNode;
  icon?: IconName;
  events: DayEvent[];
}

/**
 * How central a problem is to what Plannr set out to automate. Core is the
 * job itself (the timetable, attendance, scheduling classes and keeping track
 * of them), secondary is tests, and future is everything else (assignments,
 * file uploads, the rest of what Moodle does): a far stretch for now.
 */
export type Scope = "core" | "secondary" | "future";

export const SCOPE: Record<
  Scope,
  { label: string; weight: 1 | 3 | 5; what: string }
> = {
  core: {
    label: "Core",
    weight: 5,
    what: "Timetable, attendance, class scheduling and tracking",
  },
  secondary: { label: "Secondary", weight: 3, what: "Tests" },
  future: {
    label: "Future",
    weight: 1,
    what: "File uploads, assignments and everything else",
  },
};

/**
 * A count from the research, as we collected it: `count` of the `of` people
 * we asked. The deck shows it through src/content/research.tsx; keep the
 * real numbers here. `placeholder` marks a tally with no research
 * behind it yet, which always shows as a placeholder.
 */
export interface Tally {
  count: number;
  of: number;
  placeholder?: boolean;
}

/** How the people who raised a problem rated it. */
export interface Ratings {
  high: number;
  medium: number;
  low: number;
}

/** A problem someone told us about. */
export interface Problem {
  id: string;
  /** Short enough for a sticky note: under ~60 characters. */
  text: ReactNode;
  /** Who said it, or a quote that shows it. Optional. */
  quote?: ReactNode;
  /** Which personas run into it (Persona ids). Not used for the score. */
  personas?: string[];
  /** Reach: how many of the people we asked raised it. */
  reach: Tally;
  /** How the people who raised it rated it, when they did. */
  ratings?: Ratings;
  /**
   * How badly it hurts when it happens, 1 (annoying) to 5 (miss a class).
   * Where people rated it themselves (high 5, medium 3, low 1), this is their
   * mean, rounded; elsewhere it is our judgement.
   */
  severity: 1 | 2 | 3 | 4 | 5;
  /** How central it is to what we set out to automate. */
  scope: Scope;
}

/** A Plannr feature: one we built, or one we plan to build. */
export interface Feature {
  id: string;
  /** "Your day, on one screen". Keep it to about 28 characters (two lines). */
  name: string;
  /** One sentence under the name, about 70 characters at most. */
  tagline: ReactNode;
  /** Two or three benefits, shown one per build, about 70 characters each. */
  points: ReactNode[];
  /**
   * On a built feature, the indices of `points` that are not built yet: they
   * carry a "Planned" tag. (Every point of a planned feature is planned.)
   */
  planned?: number[];
  /** Problem ids this feature answers. */
  solves: string[];
  icon: IconName;
  /** Built (the default): in Plannr today. Planned: what we build next. */
  status?: "built" | "planned";
  /** Shown on a planned feature, so the room knows how far off it is. */
  scope?: Scope;
}

/** True if point `i` of `feature` is still to be built. */
export function isPlannedPoint(feature: Feature, i: number) {
  return feature.status === "planned" || (feature.planned ?? []).includes(i);
}

/**
 * Where a problem stands as a section walks through its answers: not reached
 * yet, the one we're on, answered by something built, answered by something
 * planned, or left for later (outside what we automate).
 */
export type TrackStatus = "todo" | "current" | "built" | "planned" | "later";

/** A number behind a problem, shown beside it while it is the one we're on. */
export interface Evidence {
  /** The problem it is about, if it is about one in particular. */
  problem?: string;
  /** The figure, as shown: "73%", or a count like "2 of 10". */
  value: ReactNode;
  /** What the figure is of: "say the timetable doesn't tell them". */
  label: ReactNode;
  /** Where it comes from: "Survey of 11 students". */
  source?: ReactNode;
}

/** The research behind a section: how many, how, and what they said. */
export interface Research {
  stats: { value: ReactNode; label: ReactNode }[];
  methods: ReactNode[];
  quotes: { text: ReactNode; who: ReactNode }[];
}

/** A step in a "how it works today" flow. */
export interface FlowNode {
  id: string;
  /** Who does it: "Faculty", "Coordinator", "Students". */
  actor: ReactNode;
  /** What they do: "Calls the coordinator". */
  action: ReactNode;
  icon: IconName;
  /** How long it takes or waits, e.g. "~1 day". Shown on the arrow into it. */
  wait?: ReactNode;
  /** The glyph beside the wait. Default "clock"; another when it says how, not how long. */
  waitIcon?: IconName;
  tone?: "neutral" | "warn" | "bad";
}

/**
 * A way round a flow's steps, for when people sometimes leave them out: the
 * change goes from one node straight to a later one.
 */
export interface FlowSkip {
  /** The ids of the node it leaves and the node it lands on. */
  from: string;
  to: string;
  /** What leaving the steps out costs: "timetable out of sync". */
  label?: ReactNode;
  /** The glyph beside the label. Default "alert". */
  icon?: IconName;
}

/** The share of the people asked who raised it, 0 to 1. */
export function share(t: Tally) {
  return t.of > 0 ? t.count / t.of : 0;
}

/**
 * Reach × severity × scope, out of 100: the share of people who raised a
 * problem, times how much it hurts (of 5), times how central it is to what we
 * set out to automate (of 5). A problem everybody has, that costs them a
 * class, in the heart of the job, scores 100. The ranking slide sorts by this.
 */
export function problemScore(problem: Problem) {
  return Math.round(
    100 *
      share(problem.reach) *
      (problem.severity / 5) *
      (SCOPE[problem.scope].weight / 5),
  );
}

/**
 * The same without scope: reach × severity, out of 100. The ranking slide
 * sorts by this first, so the room sees what scope then changes.
 */
export function baseScore(problem: Problem) {
  return Math.round(100 * share(problem.reach) * (problem.severity / 5));
}

/**
 * The problems by how many raised them, most first; ties keep the order
 * told. A chart of reach draws its bars in this order, so a ranking that
 * follows a chart starts from it.
 */
export function byReach(problems: Problem[]): Problem[] {
  return [...problems].sort((a, b) => share(b.reach) - share(a.reach));
}

/**
 * The problems in ranked order: highest score first; then the one more
 * people raised, then the one that hurts more, then the order told.
 * `score` defaults to the full score; pass `baseScore` for the order
 * before scope.
 */
export function rankProblems(
  problems: Problem[],
  score: (p: Problem) => number = problemScore,
): Problem[] {
  return [...problems].sort(
    (a, b) =>
      score(b) - score(a) ||
      share(b.reach) - share(a.reach) ||
      b.severity - a.severity,
  );
}
