import { resolveDeck, type SectionDef } from "~/deck/types";

import { approach } from "./approach";
import { closing } from "./closing";
import { coordinators } from "./coordinators";
import { faculty } from "./faculty";
import { opening } from "./opening";
import { students } from "./students";

/**
 * The running order. Each section is one file, owned by whoever presents it:
 *
 *   opening, approach, closing — Paras
 *   students — Sonal
 *   faculty — Ravya
 *   coordinators — Tanisha
 *
 * System admins are out of scope: we struck them off during the research
 * (OUT_OF_SCOPE in src/content/team.ts). Their section, admins.tsx, is kept
 * but not presented.
 */
export const SECTIONS: SectionDef[] = [
  opening,
  approach,
  students,
  faculty,
  coordinators,
  closing,
];

export const SLIDES = resolveDeck(SECTIONS);
