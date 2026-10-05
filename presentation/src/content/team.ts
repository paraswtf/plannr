import type { SpeakerId, StakeholderId } from "~/deck/types";
import type { IconName } from "~/ui/icon";

/**
 * Who is presenting, and the four kinds of people Plannr serves.
 *
 * Each of us spent a week with one stakeholder, so a stakeholder's colour is
 * also its researcher's colour: when Sonal is speaking the deck is pink.
 */

export interface Person {
  id: SpeakerId;
  name: string;
  /** Full name for the credits; a placeholder until each of us fills it in. */
  fullName: string;
  /** The stakeholder this person researched. */
  owns: StakeholderId;
  /** `/images/team/<id>.jpg` once a photo is added; initials until then. */
  photo?: string;
}

export const TEAM: Record<SpeakerId, Person> = {
  paras: {
    id: "paras",
    name: "Paras",
    fullName: "Paras Deshpande",
    owns: "admins",
  },
  sonal: { id: "sonal", name: "Sonal", fullName: "Sonal", owns: "students" },
  ravya: { id: "ravya", name: "Ravya", fullName: "Ravya", owns: "faculty" },
  tanisha: {
    id: "tanisha",
    name: "Tanisha",
    fullName: "Tanisha",
    owns: "coordinators",
  },
};

/** Presenting order, which is also the order of the stakeholder sections. */
export const SPEAKER_ORDER: SpeakerId[] = [
  "paras",
  "sonal",
  "ravya",
  "tanisha",
];

export interface Stakeholder {
  id: StakeholderId;
  /** "Students" */
  title: string;
  /** One line under the title. */
  subtitle: string;
  owner: SpeakerId;
  /** CSS colour, matching the --students / --faculty / … tokens. */
  color: string;
  /** The token's name, for `var(--…)` and Tailwind's `text-students`. */
  token: StakeholderId;
  icon: IconName;
  /** What they need from a timetable, in one sentence. */
  need: string;
}

export const STAKEHOLDERS: Record<StakeholderId, Stakeholder> = {
  students: {
    id: "students",
    title: "Students",
    subtitle: "Who read the timetable every day",
    owner: "sonal",
    color: "var(--students)",
    token: "students",
    icon: "cap",
    need: "Know where to be, and hear about every change in time.",
  },
  faculty: {
    id: "faculty",
    title: "Faculty",
    subtitle: "Internal and external",
    owner: "ravya",
    color: "var(--faculty)",
    token: "faculty",
    icon: "book",
    need: "Teach several groups without chasing rooms, slots or mail.",
  },
  coordinators: {
    id: "coordinators",
    title: "Coordinators",
    subtitle: "Who make and change the timetable",
    owner: "tanisha",
    color: "var(--coordinators)",
    token: "coordinators",
    icon: "clipboard",
    need: "Make a change once, and know everyone it affects has it.",
  },
  admins: {
    id: "admins",
    title: "System admins",
    subtitle: "And the management behind them",
    owner: "paras",
    color: "var(--admins)",
    token: "admins",
    icon: "shield",
    need: "Keep the data right without editing it one row at a time.",
  },
};

export const STAKEHOLDER_ORDER: StakeholderId[] = [
  "students",
  "faculty",
  "coordinators",
  "admins",
];

export const COLLEGE = {
  name: "Symbiosis Institute of Computer Studies and Research",
  short: "SICSR",
  city: "Pune",
  course: "Design Thinking",
};

export const PROJECT = {
  name: "Plannr",
  url: "plannr.paraswtf.com",
  repo: "github.com/paraswtf/plannr",
  repoUrl: "https://github.com/paraswtf/plannr",
  sponsor: "Rivant",
};
