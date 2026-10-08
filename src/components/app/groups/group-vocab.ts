import type { BadgeTone } from "~/components/ui/badge";

/**
 * The ways an intake gets divided, mirroring the `GroupKind` enum so the browser
 * needs no Prisma.
 */
export const GROUP_KINDS = [
  "DIVISION",
  "MAJOR",
  "MINOR",
  "SUBJECT",
  "OTHER",
] as const;

export type GroupKindName = (typeof GROUP_KINDS)[number];

export const KIND_LABEL: Record<GroupKindName, string> = {
  DIVISION: "Division",
  MAJOR: "Major",
  MINOR: "Minor",
  SUBJECT: "Subject",
  OTHER: "Other",
};

/** What each split is for, shown where there is room to explain. */
export const KIND_HINT: Record<GroupKindName, string> = {
  DIVISION: "Splits the batch: everyone is in exactly one.",
  MAJOR: "A specialisation the batch chooses.",
  MINOR: "A second, smaller specialisation.",
  SUBJECT: "An elective cohort, possibly across batches.",
  OTHER: "Anything else, such as a combined lecture.",
};

/*
 * A Major keeps the brand wash: it is the one kind a batch chooses as its
 * specialisation, and the badge's gradient tone is now a thin wash under a
 * deep violet ink (AA at 11px) rather than white type on the solid gradient.
 */
export const KIND_TONE: Record<GroupKindName, BadgeTone> = {
  DIVISION: "slate",
  MAJOR: "gradient",
  MINOR: "orange",
  SUBJECT: "green",
  OTHER: "neutral",
};
