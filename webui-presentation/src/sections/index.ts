import { resolveDeck, type SectionDef } from "~/deck/types";

import { slide as cover } from "~/slides/01-cover";
import { slide as googleSignin } from "~/slides/02-google-signin";
import { slide as personalSchedule } from "~/slides/03-personal-schedule";
import { slide as dragAndDrop } from "~/slides/04-drag-and-drop";
import { slide as responsive } from "~/slides/05-responsive";
import { slide as domApis } from "~/slides/06-dom-apis";
import { slide as hybridRendering } from "~/slides/07-hybrid-rendering";
import { slide as pwa } from "~/slides/08-pwa";
import { slide as trpc } from "~/slides/09-trpc";
import { slide as postgres } from "~/slides/10-postgres";
import { slide as siri } from "~/slides/11-siri";
import { slide as openApi } from "~/slides/12-open-api";
import { slide as calendarSync } from "~/slides/13-calendar-sync";
import { slide as pushNotifications } from "~/slides/14-push-notifications";
import { slide as thanks } from "~/slides/15-thanks";
import { slide as problem } from "~/slides/a1-problem";
import { slide as objectives } from "~/slides/a2-objectives";
import { slide as techUsed } from "~/slides/a3-tech-used";
import { slide as whyStack } from "~/slides/a4-why-stack";
import { slide as mainFeatures } from "~/slides/a5-main-features";
import { slide as architecture } from "~/slides/a6-architecture";
import { slide as erDiagram } from "~/slides/a7-er-diagram";
import { slide as dfd } from "~/slides/a8-dfd";
import { slide as dfdLevel1 } from "~/slides/a9-dfd-level1";
import { slide as interfaceTour } from "~/slides/z0-interface";
import { slide as demo } from "~/slides/z1-demo";
import { slide as conclusion } from "~/slides/z2-conclusion";

/**
 * The running order. To add a slide: create src/slides/NN-name.tsx exporting
 * `slide`, import it here and put it in the list. See SLIDES.md.
 */
export const SECTIONS: SectionDef[] = [
  {
    id: "the-project",
    title: "The project",
    speaker: "paras",
    slides: [
      cover,
      problem,
      objectives,
      techUsed,
      whyStack,
      mainFeatures,
      architecture,
      erDiagram,
      dfd,
      dfdLevel1,
    ],
  },
  {
    id: "under-the-hood",
    title: "Under the hood",
    speaker: "paras",
    slides: [
      googleSignin,
      personalSchedule,
      dragAndDrop,
      responsive,
      domApis,
      hybridRendering,
      pwa,
      trpc,
      postgres,
      siri,
      openApi,
      calendarSync,
      pushNotifications,
    ],
  },
  {
    id: "wrap-up",
    title: "Wrap up",
    speaker: "paras",
    slides: [interfaceTour, demo, conclusion, thanks],
  },
];

export const SLIDES = resolveDeck(SECTIONS);
