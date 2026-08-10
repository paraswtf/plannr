/**
 * Permission bitfield — successor to the Symbi MRBS `UserPermissions`/`BitField`
 * classes.
 *
 * Role defaults are computed here at check time rather than copied onto rows, so
 * changing what "faculty" may do is a code change that applies to everyone at
 * once. `User.permissions` therefore stores only the *extra* bits granted to an
 * individual (e.g. one faculty member who may also approve bookings).
 *
 * Pure and dependency-free on purpose: the server, the client, and the tests all
 * import this same module.
 */

export const PermissionFlags = {
  ViewTimetable: 1n << 0n,
  BookStudyRoom: 1n << 1n,
  RequestRoom: 1n << 2n,
  /** Edit or cancel events you teach. */
  ManageOwnEvents: 1n << 3n,
  ManageAllEvents: 1n << 4n,
  ApproveBookings: 1n << 5n,
  ManageRooms: 1n << 6n,
  ManageCourses: 1n << 7n,
  ManageGroups: 1n << 8n,
  ManageUsers: 1n << 9n,
  BulkImportUsers: 1n << 10n,
  ManageSettings: 1n << 11n,
  /** Implies every other flag, present and future. */
  Administrator: 1n << 30n,
} as const;

export type PermissionName = keyof typeof PermissionFlags;

export const PERMISSION_NAMES = Object.keys(PermissionFlags) as PermissionName[];

export type Role = "STUDENT" | "FACULTY" | "ADMIN";

const STUDENT_BITS = PermissionFlags.ViewTimetable | PermissionFlags.BookStudyRoom;

const FACULTY_BITS =
  STUDENT_BITS |
  PermissionFlags.RequestRoom |
  PermissionFlags.ManageOwnEvents;

export const ROLE_DEFAULT_PERMISSIONS: Record<Role, bigint> = {
  STUDENT: STUDENT_BITS,
  FACULTY: FACULTY_BITS,
  ADMIN: PermissionFlags.Administrator,
};

/** Every flag this module knows about. */
export const ALL_PERMISSIONS = PERMISSION_NAMES.reduce(
  (bits, name) => bits | PermissionFlags[name],
  0n,
);

/**
 * Rewrites the Administrator shorthand into the full set of flags it implies.
 * Comparing two users bit-for-bit (as `canActOn` does) needs this, because the
 * raw Administrator bit alone looks like *fewer* permissions than a student's.
 */
export function expandPermissions(bits: bigint): bigint {
  return (bits & PermissionFlags.Administrator) !== 0n
    ? ALL_PERMISSIONS
    : bits;
}

/** Bits a user actually holds: their role's defaults plus any personal grants. */
export function effectivePermissions(user: {
  role: Role;
  permissions: bigint;
}): bigint {
  return ROLE_DEFAULT_PERMISSIONS[user.role] | user.permissions;
}

export class PermissionBitField {
  constructor(readonly bits: bigint) {}

  static for(user: { role: Role; permissions: bigint }): PermissionBitField {
    return new PermissionBitField(effectivePermissions(user));
  }

  /** Administrator satisfies every check, including flags added later. */
  has(flag: bigint): boolean {
    if ((this.bits & PermissionFlags.Administrator) !== 0n) return true;
    return (this.bits & flag) === flag;
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

  /** Names of the flags held, for display and debugging. */
  toArray(): PermissionName[] {
    return PERMISSION_NAMES.filter(
      (name) => (this.bits & PermissionFlags[name]) === PermissionFlags[name],
    );
  }

  toString(): string {
    return this.bits.toString();
  }
}

export type ActOnDenial =
  | "SELF"
  | "HIGHER_PRIVILEGE"
  | "MISSING_MANAGE_USERS"
  | null;

/**
 * Guards every user-mutating operation, mirroring the MRBS rules: you may not
 * act on yourself, and you may not act on anyone holding a permission you lack
 * (which also stops a non-admin touching an admin).
 *
 * Returns the reason the action is denied, or null when it is allowed.
 */
export function canActOn(
  actor: { id: string; role: Role; permissions: bigint },
  target: { id: string; role: Role; permissions: bigint },
): ActOnDenial {
  if (actor.id === target.id) return "SELF";

  const actorBits = expandPermissions(effectivePermissions(actor));
  const targetBits = expandPermissions(effectivePermissions(target));

  if (!new PermissionBitField(actorBits).has(PermissionFlags.ManageUsers)) {
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
 * the bits that let anyone grant them back.
 */
export function wouldLockSelfOut(
  actor: { id: string; role: Role; permissions: bigint },
  target: { id: string },
  nextRole: Role,
  nextPermissions: bigint,
): boolean {
  if (actor.id !== target.id) return false;
  const next = new PermissionBitField(
    ROLE_DEFAULT_PERMISSIONS[nextRole] | nextPermissions,
  );
  return !next.has(PermissionFlags.ManageUsers);
}
