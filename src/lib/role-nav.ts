import {
  PermissionBitField,
  PermissionFlags as F,
  type PermissionName,
} from "./permissions";

/**
 * Navigation and route access, driven by permissions rather than roles.
 *
 * A person can hold several roles at once — teaching while also coordinating —
 * so "which nav does a faculty member see?" is the wrong question. Each screen
 * declares what it needs, and everyone sees the screens they can actually open.
 * The middleware, the sidebar and the post-login redirect all read from here,
 * so a link can never appear for someone who would be bounced off it.
 *
 * `requires` answers one question and one only: may this person *open* the
 * screen. Whether they get more than a read of it is asked twice more, and
 * neither time here — by the screen itself against `PermissionBitField`, and
 * again by the tRPC procedure behind every write, which is the one that counts.
 * That separation is why two of the screens below ask only for the permission
 * everybody holds and are still read-only for almost everybody: the timetable
 * and the room list are noticeboard information, and reading a noticeboard was
 * never the privileged act.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Any one of these is enough to reach the screen. */
  requires: PermissionName[];
}

export const NAV_ITEMS: NavItem[] = [
  // One screen for "what am I doing", whichever way you are involved: every
  // other permission implies ViewOwnEvents, so everybody reaches it and the
  // screen itself decides what to show them. It stays first because homeFor
  // lands people on the first thing they can open.
  {
    href: "/schedule",
    label: "Schedule",
    icon: "calendar",
    requires: ["ViewOwnEvents"],
  },
  // The campus day, open to anybody who has one of their own. A student stands
  // in the corridor and reads the same grid off a noticeboard, so what it costs
  // is the permission everybody already holds, and the screen withholds the
  // affordances that would change anything. ViewAllEvents is still the gate on
  // the genuinely privileged read — other people's schedules, by name, through
  // `timetable.peopleWithSchedules`.
  {
    href: "/timetable",
    label: "Timetable",
    icon: "grid",
    requires: ["ViewOwnEvents"],
  },
  // Two screens in one, and the looser of the two requirements is the one that
  // has to be listed: a student reads their own attendance without holding
  // ViewAttendance, which is the permission for reading other people's. The page
  // decides which half to draw, and /attendance/<id> — the register itself —
  // sits behind this prefix but checks ViewAttendance for itself.
  {
    href: "/attendance",
    label: "Attendance",
    icon: "checkCircle",
    requires: ["ViewOwnEvents", "ViewAttendance"],
  },
  {
    href: "/planner",
    label: "Schedule builder",
    icon: "sparkles",
    requires: ["ViewSchedulePlans"],
  },
  // Where a coordinator clears the queue. It sits above the room screens
  // because it is work waiting on them rather than a reference they consult,
  // and somebody has to be waiting on the other end of every item in it.
  {
    href: "/approvals",
    label: "Approvals",
    icon: "checkCircle",
    requires: ["ApproveBookings"],
  },
  // Both listed, for the reason /attendance lists both: the looser requirement
  // is what opens the screen now, but nothing implies ViewRooms and ViewRooms
  // implies nothing, so a role holding only it — a porter, a facilities account
  // — would lose the room directory if this were narrowed to the events
  // permission alone.
  {
    href: "/rooms",
    label: "Rooms",
    icon: "door",
    requires: ["ViewOwnEvents", "ViewRooms"],
  },
  { href: "/book", label: "Book a room", icon: "plus", requires: ["BookRoom"] },
  { href: "/people", label: "People", icon: "users", requires: ["ViewUsers"] },
  {
    href: "/groups",
    label: "Groups",
    icon: "layers",
    requires: ["ViewGroups"],
  },
  // The subjects taught this semester. It shares ViewGroups rather than owning
  // a permission because the questions it answers — who may teach this, which
  // groups sit for it — are asked about other people, and ViewGroups is already
  // the right to read the institution rather than only your own place in it. A
  // student therefore does not get this screen: their own courses reach them
  // through /schedule and /attendance, neither of which needs ViewGroups.
  {
    href: "/courses",
    label: "Courses",
    icon: "book",
    requires: ["ViewGroups"],
  },
  // The shape of the institution in one picture, for whoever has to arrange it.
  // Read-only, and it spans the two halves of that job — programmes and their
  // intakes on one side, the groups and courses hung off them on the other — so
  // either permission is enough to look at it.
  {
    href: "/setup",
    label: "Setup",
    icon: "building",
    requires: ["ManageGroups", "ManageProgrammes"],
  },
  {
    href: "/settings",
    label: "Settings",
    icon: "settings",
    requires: ["ManageSettings"],
  },
];

/** Route prefixes that need a session, with what each one requires. */
export const ROUTE_ACL: Array<{ prefix: string; requires: PermissionName[] }> =
  NAV_ITEMS.map(({ href, requires }) => ({ prefix: href, requires }));

const bitsFor = (permissions: bigint) => new PermissionBitField(permissions);

/** The nav items this person can actually open, in display order. */
export function navFor(permissions: bigint): NavItem[] {
  const bits = bitsFor(permissions);
  return NAV_ITEMS.filter((item) =>
    item.requires.some((name) => bits.has(F[name])),
  );
}

/** Where to land after signing in: the first screen they can open. */
export function homeFor(permissions: bigint): string {
  return navFor(permissions)[0]?.href ?? "/no-access";
}

/** May this person open `pathname`? Unlisted paths are open to any signed-in user. */
export function canOpen(permissions: bigint, pathname: string): boolean {
  const rule = ROUTE_ACL.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  if (!rule) return true;
  const bits = bitsFor(permissions);
  return rule.requires.some((name) => bits.has(F[name]));
}

export const APP_PREFIXES = ROUTE_ACL.map((r) => r.prefix);

export function isAppRoute(pathname: string): boolean {
  return APP_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
