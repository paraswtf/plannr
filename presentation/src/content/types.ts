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
  /** good: works fine · warn: friction · bad: where it breaks. */
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

/** A problem someone told us about. */
export interface Problem {
  id: string;
  /** Short enough for a sticky note: under ~60 characters. */
  text: ReactNode;
  /** Who said it, or a quote that shows it. Optional. */
  quote?: ReactNode;
  /** Which personas run into it (Persona ids). Reach, for the ranking. */
  personas: string[];
  /** How badly it hurts when it happens, 1 (annoying) to 5 (miss a class). */
  severity: 1 | 2 | 3 | 4 | 5;
}

/** A Plannr feature, pitched as if it already exists. */
export interface Feature {
  id: string;
  /** "Your day, on one screen" */
  name: string;
  /** One sentence under the name. */
  tagline: ReactNode;
  /** Two or three benefits, shown one per build. */
  points: ReactNode[];
  /** Problem ids this feature answers. */
  solves: string[];
  icon: IconName;
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
  tone?: "neutral" | "warn" | "bad";
}

/**
 * Reach × severity: how many of the section's personas a problem touches,
 * times how much it hurts. The ranking slide sorts by this.
 */
export function problemScore(problem: Problem) {
  return problem.personas.length * problem.severity;
}

/** The problems in ranked order: highest reach × severity first. */
export function rankProblems(problems: Problem[]): Problem[] {
  return [...problems].sort(
    (a, b) => problemScore(b) - problemScore(a) || b.severity - a.severity,
  );
}
