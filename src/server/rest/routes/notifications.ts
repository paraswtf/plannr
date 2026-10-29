import { type RouteDef } from "../types";

/**
 * A person's own inbox, and how they have chosen to hear about things.
 *
 * Every route is `actor: "person"`. An inbox is one human's to read and clear,
 * so a service key, which is something rather than somebody, has none and is
 * refused. A personal key is its owner, and can read and clear the same inbox
 * the owner can, which is what lets a shortcut on a phone ask how many things
 * are waiting.
 *
 * No scopes: the procedures check no permission, because nobody needs one to
 * read their own. What a person is offered on the preferences list does depend
 * on what they may do (a student is never asked about approvals), and that
 * filtering is the procedure's.
 *
 * The device routes for push (`/notifications/push/...`) live with the
 * calendar in `timetable.ts`, and stay browser-only: a push subscription
 * belongs to one browser on one phone.
 */
export const notificationRoutes: RouteDef[] = [
  {
    method: "GET",
    path: "/notifications",
    procedure: "notifications.list",
    summary: "List the caller's notifications, newest first",
    description:
      "The caller's inbox. `filter=unread` leaves out what has been opened or cleared. A category the person has switched off for the inbox never appears here, even if it is still pushed to their phone. Takes `page` and `pageSize`. A service key has no inbox and is refused.",
    tag: "Notifications",
    scopes: [],
    actor: "person",
  },
  {
    method: "GET",
    path: "/notifications/unread-count",
    procedure: "notifications.unreadCount",
    summary: "Count the caller's unread notifications",
    description:
      "The number shown on the Notifications tab. Counts only what the inbox would list.",
    tag: "Notifications",
    scopes: [],
    actor: "person",
    input: "none",
  },
  {
    method: "POST",
    path: "/notifications/read",
    procedure: "notifications.markRead",
    summary: "Mark some notifications read",
    description:
      "Marks up to 200 of the caller's notifications read, by id. Ids that belong to somebody else, do not exist or are already read are ignored rather than refused, and `updated` says how many changed.",
    tag: "Notifications",
    scopes: [],
    actor: "person",
  },
  {
    method: "POST",
    path: "/notifications/read-all",
    procedure: "notifications.markAllRead",
    summary: "Mark every notification read",
    description:
      "Clears the caller's whole inbox at once and answers with how many it cleared.",
    tag: "Notifications",
    scopes: [],
    actor: "person",
    input: "none",
  },
  {
    method: "GET",
    path: "/notifications/preferences",
    procedure: "notifications.preferences",
    summary: "Read how the caller hears about each category",
    description:
      "Every category the caller can receive, with their choice for the inbox (`inApp`) and for push (`push`), or the default of both on where they have not chosen. Which categories appear depends on what the caller may do: a student sees only changes to their classes. `pushAvailable` says whether this deployment can send push at all; the switches still save when it cannot.",
    tag: "Notifications",
    scopes: [],
    actor: "person",
    input: "none",
  },
  {
    method: "PUT",
    path: "/notifications/preferences/{category}",
    procedure: "notifications.setPreference",
    summary: "Choose how the caller hears about one category",
    description:
      "Sets `inApp`, `push` or both for one category. A switch left out stays as it was. `category` is one of `CLASS_CHANGES`, `REQUESTS`, `APPROVALS` or `PLAN_REVIEWS`.",
    tag: "Notifications",
    scopes: [],
    actor: "person",
  },
];
