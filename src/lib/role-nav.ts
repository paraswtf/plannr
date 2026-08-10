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
 */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Any one of these is enough to reach the screen. */
  requires: PermissionName[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/today", label: "Today", icon: "home", requires: ["ViewOwnEvents"] },
  {
    href: "/classes",
    label: "My classes",
    icon: "calendar",
    requires: ["ManageOwnEvents"],
  },
  {
    href: "/timetable",
    label: "Timetable",
    icon: "grid",
    requires: ["ViewAllEvents"],
  },
  { href: "/rooms", label: "Rooms", icon: "door", requires: ["ViewRooms"] },
  { href: "/book", label: "Book a room", icon: "plus", requires: ["BookRoom"] },
  { href: "/people", label: "People", icon: "users", requires: ["ViewUsers"] },
  {
    href: "/groups",
    label: "Groups",
    icon: "layers",
    requires: ["ViewGroups"],
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
