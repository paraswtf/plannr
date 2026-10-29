import {
  PermissionBitField,
  PermissionFlags as F,
  type PermissionName,
} from "./permissions";

/**
 * What Plannr tells people about, and how they choose to hear it.
 *
 * Pure and dependency-free, like `permissions.ts`: the settings tab draws its
 * rows from here, and the server reads the same defaults when it decides who
 * gets a row and who gets a push. The strings match the Prisma enum
 * `NotificationCategory` exactly, which a test holds them to.
 */

export const NOTIFICATION_CATEGORIES = [
  "CLASS_CHANGES",
  "REQUESTS",
  "APPROVALS",
  "PLAN_REVIEWS",
  "ASSIGNMENTS",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface CategoryMeta {
  category: NotificationCategory;
  /** The row's name on the settings tab. */
  label: string;
  /** One line on what arrives under it. */
  description: string;
  /** The glyph beside each notification of this kind in the inbox. */
  icon: "calendar" | "inbox" | "checkCircle" | "sparkles" | "pencil";
  /**
   * Only offered to people holding one of these. A student is never asked
   * whether they want to hear about approvals they cannot give.
   */
  requires?: PermissionName[];
}

export const CATEGORY_META: Record<NotificationCategory, CategoryMeta> = {
  CLASS_CHANGES: {
    category: "CLASS_CHANGES",
    label: "Changes to your classes",
    description:
      "A class you attend or teach moves, is called off, is added or is back on.",
    icon: "calendar",
  },
  REQUESTS: {
    category: "REQUESTS",
    label: "Your requests",
    description: "A booking or a change you asked for is approved or declined.",
    icon: "checkCircle",
    requires: ["BookRoom", "ManageOwnEvents"],
  },
  APPROVALS: {
    category: "APPROVALS",
    label: "Waiting on you",
    description: "Somebody asks for a room or a change that you can approve.",
    icon: "inbox",
    requires: ["ApproveBookings"],
  },
  PLAN_REVIEWS: {
    category: "PLAN_REVIEWS",
    label: "Schedule plans",
    description:
      "A plan is shared with you for review, or a plan of yours is approved or sent back.",
    icon: "sparkles",
    requires: ["ViewSchedulePlans"],
  },
  ASSIGNMENTS: {
    category: "ASSIGNMENTS",
    label: "Tests and presentations",
    description:
      "A test or presentation is set for you, a paper opens, or marks are published.",
    icon: "pencil",
  },
};

/** How somebody hears about one category until they say otherwise. */
export const DEFAULT_PREFERENCE = { inApp: true, push: true } as const;

/** The categories somebody can receive, in the order the settings tab lists them. */
export function categoriesFor(permissions: bigint): CategoryMeta[] {
  const bits = new PermissionBitField(permissions);
  return NOTIFICATION_CATEGORIES.map((c) => CATEGORY_META[c]).filter(
    (meta) => !meta.requires || meta.requires.some((name) => bits.has(F[name])),
  );
}
