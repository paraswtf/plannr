/**
 * Permission bitfield — successor to the Symbi MRBS `UserPermissions`/`BitField`
 * classes.
 *
 * A user holds any number of roles; their permissions are the union of those
 * roles' bits plus any granted to them personally. Some permissions imply
 * others — managing every event necessarily means being able to see them — and
 * that closure is applied here so no caller has to remember the relationships.
 *
 * Pure and dependency-free on purpose: the server, the client, and the tests all
 * import this same module.
 */

export const PermissionFlags = {
  // --- Events ---
  /** See the events you teach or booked yourself. */
  ViewOwnEvents: 1n << 0n,
  /** See the whole institution's timetable. */
  ViewAllEvents: 1n << 1n,
  /** Edit and cancel the events you teach or booked yourself. */
  ManageOwnEvents: 1n << 2n,
  /** Schedule, move and cancel anyone's events. */
  ManageAllEvents: 1n << 3n,
  /** Request a room. */
  BookRoom: 1n << 4n,
  /** Approve or reject other people's booking requests. */
  ApproveBookings: 1n << 5n,

  // --- Spaces ---
  ViewRooms: 1n << 10n,
  ManageRooms: 1n << 11n,

  // --- People ---
  ViewUsers: 1n << 20n,
  ManageUsers: 1n << 21n,
  ImportUsers: 1n << 22n,
  ManageRoles: 1n << 23n,

  // --- Academic structure ---
  ViewGroups: 1n << 30n,
  ManageGroups: 1n << 31n,
  ManageCourses: 1n << 32n,

  // --- Organisation ---
  ManageSettings: 1n << 40n,

  /** Implies every other flag, present and future. */
  Administrator: 1n << 62n,
} as const;

export type PermissionName = keyof typeof PermissionFlags;

export const PERMISSION_NAMES = Object.keys(
  PermissionFlags,
) as PermissionName[];

/** Every flag this module knows about. */
export const ALL_PERMISSIONS = PERMISSION_NAMES.reduce(
  (bits, name) => bits | PermissionFlags[name],
  0n,
);

/**
 * Direct implications: holding the key grants the values. Applied transitively
 * by `expandPermissions`, so `ManageAllEvents` reaches `ViewOwnEvents` through
 * `ViewAllEvents` without being listed here.
 */
export const PERMISSION_IMPLIES: Partial<
  Record<PermissionName, PermissionName[]>
> = {
  ManageAllEvents: ["ViewAllEvents", "ManageOwnEvents"],
  ViewAllEvents: ["ViewOwnEvents"],
  ManageOwnEvents: ["ViewOwnEvents"],
  ApproveBookings: ["ViewAllEvents"],
  ManageRooms: ["ViewRooms"],
  ManageUsers: ["ViewUsers"],
  ImportUsers: ["ManageUsers"],
  ManageRoles: ["ViewUsers"],
  ManageGroups: ["ViewGroups"],
  ManageCourses: ["ViewGroups"],
};

/** Metadata for the permission editor, grouped the way the UI lists them. */
export interface PermissionMeta {
  name: PermissionName;
  label: string;
  description: string;
  category: string;
}

export const PERMISSION_CATALOG: PermissionMeta[] = [
  {
    name: "ViewOwnEvents",
    label: "View own events",
    description: "See the classes you teach and the rooms you booked.",
    category: "Events",
  },
  {
    name: "ViewAllEvents",
    label: "View all events",
    description: "See the whole institution's timetable.",
    category: "Events",
  },
  {
    name: "ManageOwnEvents",
    label: "Manage own events",
    description: "Edit and cancel your own classes and bookings.",
    category: "Events",
  },
  {
    name: "ManageAllEvents",
    label: "Manage all events",
    description: "Schedule, move and cancel anyone's events.",
    category: "Events",
  },
  {
    name: "BookRoom",
    label: "Book a room",
    description: "Request a room for a class or study session.",
    category: "Events",
  },
  {
    name: "ApproveBookings",
    label: "Approve bookings",
    description: "Approve or reject other people's room requests.",
    category: "Events",
  },
  {
    name: "ViewRooms",
    label: "View rooms",
    description: "Browse the room directory.",
    category: "Spaces",
  },
  {
    name: "ManageRooms",
    label: "Manage rooms",
    description: "Add, edit and archive rooms and buildings.",
    category: "Spaces",
  },
  {
    name: "ViewUsers",
    label: "View people",
    description: "See the staff and student directory.",
    category: "People",
  },
  {
    name: "ManageUsers",
    label: "Manage people",
    description: "Add, edit and remove people.",
    category: "People",
  },
  {
    name: "ImportUsers",
    label: "Import people",
    description: "Bulk-import people from a CSV file.",
    category: "People",
  },
  {
    name: "ManageRoles",
    label: "Manage roles",
    description: "Create roles and change what they can do.",
    category: "People",
  },
  {
    name: "ViewGroups",
    label: "View groups",
    description: "See class groups and their members.",
    category: "Academic",
  },
  {
    name: "ManageGroups",
    label: "Manage groups",
    description: "Create groups and change their membership.",
    category: "Academic",
  },
  {
    name: "ManageCourses",
    label: "Manage courses",
    description: "Create and edit courses and terms.",
    category: "Academic",
  },
  {
    name: "ManageSettings",
    label: "Manage settings",
    description: "Change scheduling rules and institution settings.",
    category: "Organisation",
  },
  {
    name: "Administrator",
    label: "Administrator",
    description: "Full access to everything, including future features.",
    category: "Organisation",
  },
];

export const PERMISSION_CATEGORIES = [
  "Events",
  "Spaces",
  "People",
  "Academic",
  "Organisation",
] as const;

/** Bits implied by a single flag, computed once per flag at module load. */
const IMPLIED_BY_FLAG = new Map<PermissionName, bigint>();

function computeImplied(
  name: PermissionName,
  seen = new Set<PermissionName>(),
): bigint {
  if (seen.has(name)) return 0n;
  seen.add(name);

  let bits = 0n;
  for (const implied of PERMISSION_IMPLIES[name] ?? []) {
    bits |= PermissionFlags[implied] | computeImplied(implied, seen);
  }
  return bits;
}

for (const name of PERMISSION_NAMES) {
  IMPLIED_BY_FLAG.set(name, computeImplied(name));
}

/**
 * Adds every permission implied by the ones held.
 *
 * This is the single place the implication rules are applied. `has()` uses it,
 * so a check for "view all events" succeeds for someone who only holds "manage
 * all events", and the permission editor uses it to show which boxes are ticked
 * for you rather than by you.
 */
export function expandPermissions(bits: bigint): bigint {
  if ((bits & PermissionFlags.Administrator) !== 0n) return ALL_PERMISSIONS;

  let expanded = bits;
  for (const name of PERMISSION_NAMES) {
    if ((bits & PermissionFlags[name]) !== 0n) {
      expanded |= IMPLIED_BY_FLAG.get(name)!;
    }
  }
  return expanded;
}

/**
 * Which of `bits` are only held by implication — the ones a permission editor
 * should show ticked but locked, because unticking them would do nothing.
 */
export function impliedPermissions(bits: bigint): bigint {
  return expandPermissions(bits) & ~bits;
}

/** Does holding `flag` grant `candidate`, directly or through implication? */
export function grants(flag: bigint, candidate: bigint): boolean {
  return (expandPermissions(flag) & candidate) === candidate;
}

export class PermissionBitField {
  /** The bits as granted, before implications are applied. */
  readonly bits: bigint;
  /** The bits actually in force. */
  readonly effective: bigint;

  constructor(bits: bigint) {
    this.bits = bits;
    this.effective = expandPermissions(bits);
  }

  static fromRoles(
    roles: Array<{ permissions: bigint }>,
    extra = 0n,
  ): PermissionBitField {
    const union = roles.reduce((bits, role) => bits | role.permissions, extra);
    return new PermissionBitField(union);
  }

  has(flag: bigint): boolean {
    // Checked against the raw bits, not the expanded set: `effective` resolves
    // to the flags this module knows about today, whereas an Administrator is
    // meant to hold permissions added in future releases too, with no
    // migration.
    if ((this.bits & PermissionFlags.Administrator) !== 0n) return true;
    return (this.effective & flag) === flag;
  }

  hasAll(...flags: bigint[]): boolean {
    return flags.every((f) => this.has(f));
  }

  hasAny(...flags: bigint[]): boolean {
    return flags.some((f) => this.has(f));
  }

  add(flag: bigint): PermissionBitField {
    return new PermissionBitField(this.bits | flag);
  }

  remove(flag: bigint): PermissionBitField {
    return new PermissionBitField(this.bits & ~flag);
  }

  /** Names of the flags in force, including implied ones. */
  toArray(): PermissionName[] {
    return PERMISSION_NAMES.filter(
      (name) =>
        (this.effective & PermissionFlags[name]) === PermissionFlags[name],
    );
  }

  toString(): string {
    return this.bits.toString();
  }
}

// ─── System roles ───────────────────────────────────────────────────────────

/**
 * The four roles every institution starts with. They cannot be renamed, have
 * their permissions changed, or be deleted — too much of the app's behaviour is
 * described in terms of them. Anything bespoke goes in a custom role.
 */
export const SYSTEM_ROLE_KEYS = [
  "student",
  "faculty",
  "coordinator",
  "admin",
] as const;

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

export interface SystemRoleDefinition {
  key: SystemRoleKey;
  name: string;
  description: string;
  permissions: bigint;
}

const F = PermissionFlags;

export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    key: "student",
    name: "Student",
    description: "Sees their own timetable and can book a study room.",
    permissions: F.ViewOwnEvents | F.BookRoom,
  },
  {
    key: "faculty",
    name: "Faculty",
    description: "Teaches classes and manages their own schedule.",
    permissions:
      F.ViewAllEvents |
      F.ManageOwnEvents |
      F.BookRoom |
      F.ViewRooms |
      F.ViewGroups,
  },
  {
    key: "coordinator",
    name: "Coordinator",
    description:
      "Schedules the timetable, approves bookings and manages groups.",
    permissions:
      F.ManageAllEvents |
      F.ApproveBookings |
      F.BookRoom |
      F.ManageRooms |
      F.ManageGroups |
      F.ManageCourses |
      F.ViewUsers,
  },
  {
    key: "admin",
    name: "Admin",
    description: "Full access to the institution.",
    permissions: F.Administrator,
  },
];

export const isSystemRoleKey = (key: string): key is SystemRoleKey =>
  (SYSTEM_ROLE_KEYS as readonly string[]).includes(key);

// ─── Acting on other people ─────────────────────────────────────────────────

export type ActOnDenial =
  "SELF" | "HIGHER_PRIVILEGE" | "MISSING_MANAGE_USERS" | null;

export interface ActorLike {
  id: string;
  permissions: bigint;
}

/**
 * Guards every user-mutating operation, mirroring the MRBS rules: you may not
 * act on yourself, and you may not act on anyone holding a permission you lack
 * (which also stops a non-admin touching an admin).
 *
 * Returns the reason the action is denied, or null when it is allowed.
 */
export function canActOn(actor: ActorLike, target: ActorLike): ActOnDenial {
  if (actor.id === target.id) return "SELF";

  const actorBits = expandPermissions(actor.permissions);
  const targetBits = expandPermissions(target.permissions);

  if (!new PermissionBitField(actorBits).has(F.ManageUsers)) {
    return "MISSING_MANAGE_USERS";
  }
  // Anything the target holds that the actor does not.
  if ((targetBits & ~actorBits) !== 0n) return "HIGHER_PRIVILEGE";

  return null;
}

export const ACT_ON_DENIAL_MESSAGE: Record<
  Exclude<ActOnDenial, null>,
  string
> = {
  SELF: "You cannot perform this action on your own account.",
  HIGHER_PRIVILEGE:
    "This user holds permissions you do not have, so you cannot modify them.",
  MISSING_MANAGE_USERS: "You do not have permission to manage users.",
};

/**
 * Stops an admin locking the organisation out of its own console by dropping
 * the permissions that let anyone grant them back.
 */
export function wouldLockSelfOut(
  actorId: string,
  targetId: string,
  nextPermissions: bigint,
): boolean {
  if (actorId !== targetId) return false;
  return !new PermissionBitField(nextPermissions).has(F.ManageRoles);
}
