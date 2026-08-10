import type { Role } from "./permissions";

/**
 * Navigation and route access, in one place.
 *
 * The middleware, the sidebar and the post-login redirect all read from here,
 * so a route can never appear in the nav for a role that cannot open it.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const NAV: Record<Role, NavItem[]> = {
  STUDENT: [
    { href: "/today", label: "Today", icon: "home" },
    { href: "/book", label: "Book a room", icon: "door" },
    { href: "/timetable", label: "Timetable", icon: "grid" },
  ],
  FACULTY: [
    { href: "/classes", label: "My classes", icon: "calendar" },
    { href: "/book", label: "Book a room", icon: "door" },
    { href: "/timetable", label: "Timetable", icon: "grid" },
  ],
  ADMIN: [
    { href: "/timetable", label: "Timetable", icon: "grid" },
    { href: "/rooms", label: "Rooms", icon: "door" },
    { href: "/book", label: "Book a room", icon: "plus" },
    { href: "/people", label: "People", icon: "users" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ],
};

/** Where each role lands after signing in. */
export const ROLE_HOME: Record<Role, string> = {
  STUDENT: "/today",
  FACULTY: "/classes",
  ADMIN: "/timetable",
};

/** Which roles may open each app route prefix. */
export const ROUTE_ACL: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: "/today", roles: ["STUDENT"] },
  { prefix: "/classes", roles: ["FACULTY"] },
  { prefix: "/book", roles: ["STUDENT", "FACULTY", "ADMIN"] },
  { prefix: "/timetable", roles: ["STUDENT", "FACULTY", "ADMIN"] },
  { prefix: "/rooms", roles: ["ADMIN"] },
  { prefix: "/people", roles: ["ADMIN"] },
  { prefix: "/settings", roles: ["ADMIN"] },
];

/** True when `role` may open `pathname`. Unlisted paths are open. */
export function canOpen(role: Role, pathname: string): boolean {
  const rule = ROUTE_ACL.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  return rule ? rule.roles.includes(role) : true;
}

/** Route prefixes that require a session. */
export const APP_PREFIXES = ROUTE_ACL.map((r) => r.prefix);

export function isAppRoute(pathname: string): boolean {
  return APP_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
