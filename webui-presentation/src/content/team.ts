import type { SpeakerId, StakeholderId } from "~/deck/types";
import type { IconName } from "~/ui/icon";

/** Who presents. src/sections/index.ts says who has which slides. */
export interface Person {
  id: SpeakerId;
  name: string;
  fullName: string;
  /** Path under public/; initials without one. */
  photo?: string;
  /** For a photo that is not already a headshot: where to zoom in. */
  photoFocus?: PhotoFocus;
}

/** A point in a square photo, as fractions across and down, and a zoom. */
export interface PhotoFocus {
  x: number;
  y: number;
  zoom: number;
}

export const TEAM: Record<SpeakerId, Person> = {
  paras: {
    id: "paras",
    name: "Paras",
    fullName: "Paras Deshpande",
    photo: "/paras-pfp.avif",
  },
  sonal: {
    id: "sonal",
    name: "Sonal",
    fullName: "Sonal Mohrir",
    photo: "/sonal-pfp.jpg",
    // A wide shot: uncropped, the face is a few pixels across in an avatar.
    photoFocus: { x: 0.615, y: 0.56, zoom: 1.8 },
  },
  tanisha: {
    id: "tanisha",
    name: "Tanisha",
    fullName: "Tanisha Nath",
  },
};

export interface Stakeholder {
  id: StakeholderId;
  title: string;
  subtitle: string;
  owner: SpeakerId;
  color: string;
  token: StakeholderId;
  icon: IconName;
  need: string;
}

/** The feature deck has no stakeholder sections; one inert entry for the engine. */
export const STAKEHOLDERS: Record<StakeholderId, Stakeholder> = {
  none: {
    id: "none",
    title: "None",
    subtitle: "",
    owner: "paras",
    color: "var(--accent)",
    token: "none",
    icon: "shield",
    need: "",
  },
};

export const COLLEGE = {
  name: "Symbiosis Institute of Computer Studies and Research",
  short: "SICSR",
  city: "Pune",
};
