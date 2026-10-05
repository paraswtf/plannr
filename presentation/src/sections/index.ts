import { resolveDeck, type SectionDef } from "~/deck/types";

import { admins } from "./admins";
import { approach } from "./approach";
import { closing } from "./closing";
import { coordinators } from "./coordinators";
import { faculty } from "./faculty";
import { opening } from "./opening";
import { students } from "./students";

/**
 * The running order. Each section is one file, owned by whoever presents it:
 *
 *   opening, approach, admins, closing — Paras
 *   students — Sonal
 *   faculty — Ravya
 *   coordinators — Tanisha
 */
export const SECTIONS: SectionDef[] = [
  opening,
  approach,
  students,
  faculty,
  coordinators,
  admins,
  closing,
];

export const SLIDES = resolveDeck(SECTIONS);
