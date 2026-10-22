import { type RouteDef } from "../types";

/**
 * The timetable, read; and the calendar it is pushed into.
 *
 * Everything under `/timetable` is a read. Nothing here writes a lecture —
 * scheduling, moving and cancelling live under `/events`, because the sitting
 * is the thing that changes and a timetable is only the shape those sittings
 * make when you stand back from them. Each of these is one indexed range scan
 * over the occurrences table: recurrence was resolved when the event was
 * saved, so asking for a week never asks the server to expand a rule.
 *
 * Three judgement calls worth naming.
 *
 * The `/timetable/my-*` endpoints are closed to keys, and the point is that
 * the alternative is a real endpoint rather than an apology. They work out
 * what is yours from the caller's own enrolment and teaching, which a machine
 * has none of; `/timetable/week` asks the same question of a named subject —
 * `?facultyId=`, `?groupId=` or `?roomId=` — and is what an integration should
 * be built on. Each refusal below names it rather than leaving it to be found.
 *
 * There are two people searches and they are not redundant. `/timetable/people`
 * is the "view as" picker: names and PRNs, nothing else, open to anybody the
 * app already lets open a schedule. `/timetable/people/directory` is the
 * coordinator's version — it adds contact addresses and lets you search on one
 * — and it costs ViewAllEvents and ViewUsers, which is the app's own line and
 * not one drawn here.
 *
 * `/calendar` lives in this file rather than one of its own because a calendar
 * connection is not a subject in its own right: it is how somebody's timetable
 * arrives on their phone. Every route on it refuses a key, and that is not a
 * scope anybody could add. The connection belongs to a Google account a person
 * signed in to, and an administrator's power to rearrange the timetable —
 * which is what puts classes in other people's calendars in the first place —
 * has never included reaching into those calendars afterwards.
 */
export const timetableRoutes: RouteDef[] = [
  {
    method: "GET",
    path: "/timetable/grid",
    procedure: "timetable.grid",
    summary: "Read one day across every room",
    description:
      "The admin grid: every active room, every sitting in it that day, and the buildings and organisation settings the screen draws around them. The day is cut on the organisation's timezone rather than the caller's, so `date` need only land somewhere inside it. `buildingId` narrows the rooms; `includeCancelled` adds the sittings that were called off, which are otherwise absent entirely. Each occurrence carries `isMine`, which marks the caller's own classes — and is therefore always false for a key, which attends and teaches nothing.",
    tag: "Timetable",
    scopes: [],
  },
  {
    method: "GET",
    path: "/timetable/week",
    procedure: "timetable.week",
    summary: "Read a week down one lane",
    description:
      "Whichever of `roomId`, `groupId` and `facultyId` you send picks the lane; send none and you get the whole institution's week, which over a term-length window is a great many rows. Cancelled sittings are left out. This is the endpoint to build an integration on: it names its subject explicitly, so it answers the same for an app as for a person, where every `/timetable/my-*` endpoint cannot.",
    tag: "Timetable",
    scopes: [],
  },
  {
    method: "GET",
    path: "/timetable/my-day",
    procedure: "timetable.myDay",
    summary: "Read the caller's own day",
    description:
      "A student's groups' classes, or a faculty member's teaching, for one date — `date` defaults to today, cut on the organisation's timezone. Ask about a named person instead with `GET /timetable/week?facultyId=…` (or `groupId`, or `roomId`), which takes an explicit `from` and `to` and answers for anybody.",
    tag: "Timetable",
    scopes: [],
    actor: "session",
  },
  {
    method: "GET",
    path: "/timetable/my-week",
    procedure: "timetable.myWeek",
    summary: "Read the caller's own week",
    description:
      "The classes `/timetable/my-day` reports, over an arbitrary `from`–`to` window rather than a single day. `GET /timetable/week?facultyId=…` is the version that says who it is about, and is what an app should call.",
    tag: "Timetable",
    scopes: [],
    actor: "session",
  },
  {
    method: "GET",
    path: "/timetable/my-schedule",
    procedure: "timetable.mySchedule",
    summary:
      "Read the caller's schedule for a day, week or month, from a chosen perspective",
    description:
      "One day's sittings with every cohort attending and the headcount they add up to, plus the perspectives this person is entitled to. `span` widens that to `week` or `month` — the window is derived from the anchor and the span rather than stated, so the widest answer this can be asked for is one month grid of six Monday-aligned weeks, and `truncated` says so if even that ran past the cap. A perspective decides two things at once: which classes count as theirs — the ones they attend, the ones they take, or both — and how much is said about each. With no `date`, the answer is the day the next class falls on, which on a Friday evening is Monday. `asUserId` shows somebody else's day, but the perspectives and the level of detail are still worked out from the *caller's* own profiles and permissions, which is why this is closed to keys rather than merely narrowed: a principal has no profile, so it would read an empty day whoever it named. `GET /timetable/week?groupId=…` or `?facultyId=…` is the explicit-subject read.",
    tag: "Timetable",
    scopes: [],
    actor: "session",
  },
  {
    method: "GET",
    path: "/timetable/favourites",
    procedure: "timetable.favourites",
    summary: "List the schedules the caller keeps one tap away",
    description:
      "The \"view as\" favourites strip: the caller's own perspectives and other people's schedules in one list, in the order they were starred, because to whoever made it they are one kind of thing — a way to reach a schedule that is not the one on screen. A favourite naming somebody who has left, or a perspective the caller may no longer take, is dropped here rather than returned to be filtered: an entry that logs you out of your own view when tapped is worse than one that quietly went away.",
    tag: "Timetable",
    scopes: [],
    actor: "session",
  },
  {
    method: "POST",
    path: "/timetable/favourites",
    procedure: "timetable.toggleFavourite",
    summary: "Star or unstar a schedule",
    description:
      'Idempotent in both directions: `on: true` twice is one favourite, `on: false` on something never starred is a no-op. `kind` is `"perspective"` with a name like `coordinator`, or `"person"` with a user id. A perspective is checked against the ones the caller may actually take, and a person against the same population the picker offers — somebody who attends or teaches and is not a machine — so a favourite can never be a handle on a row that would not have been shown.',
    tag: "Timetable",
    scopes: [],
    actor: "session",
  },
  {
    method: "GET",
    path: "/timetable/people",
    procedure: "timetable.searchPeople",
    summary: "Search the people whose day can be looked at",
    description:
      'Anybody who attends or teaches, matched on name or PRN — the list behind the schedule screen\'s "view as" picker. Thirty at a time by default, which is what a picker wants and what this answered before it was paged; `total` says how many matched altogether, so a caller can tell the difference between thirty people and the first thirty of two thousand. It answers with four fields and no more: no address, no roles, no permission bits, no account state. An address is neither returned nor searchable, so this cannot be used to test whether a given address has an account, and service principals are excluded outright, having no day of their own. No particular scope, which mirrors the app: choosing whose day to look at belongs to a screen every signed-in person can reach. Being able to name somebody here is not being able to read their day — `/timetable/my-schedule` decides that separately.',
    tag: "Timetable",
    scopes: [],
  },
  {
    method: "GET",
    path: "/timetable/people/directory",
    procedure: "timetable.peopleWithSchedules",
    summary: "Search the same people, with their contact addresses",
    description:
      "The coordinator's version of `/timetable/people`: the same population — anyone with a timetable of their own — plus each person's contact address, which is searchable here as well as returned. It is a directory rather than a typeahead, so its default page is far larger than the picker's thirty: a whole department or cohort arrives at once. A college's entire roll runs to thousands and genuinely does need paging, which is what `total` and `pageCount` are for. Being allowed to see every event is not on its own enough to browse named individuals, so this asks for the people permission too; a lecturer holds the first and not the second.",
    tag: "Timetable",
    scopes: ["ViewAllEvents", "ViewUsers"],
  },
  {
    method: "GET",
    path: "/calendar/connection",
    procedure: "calendar.status",
    summary: "Read the caller's own calendar connection",
    description:
      "Whether calendar sync is switched on for this deployment at all, whether the caller has connected a Google account, and if so which address, when it last synced, how much work is still queued, and whether the grant has been revoked and needs reconnecting. There is no explicit-subject version of this and there will not be one: a connection is a person's own grant to their own account, and no permission in the app opens somebody else's.",
    tag: "Calendar",
    scopes: [],
    actor: "session",
    input: "none",
  },
  {
    method: "POST",
    path: "/calendar/connection/resync",
    procedure: "calendar.resync",
    summary: "Bring the caller's calendar up to date now",
    description:
      'Queues a full pass over the caller\'s classes and then works off as much of it as fits in this request, rather than leaving it to the cron — a button called "Sync now" cannot mean "some time within the hour". The budget is deliberately short, since a term\'s worth of classes is hundreds of Google API calls, so what it cannot finish stays queued and `remaining` says how much. Ask again with `resume: true` to carry on: a second call without it would re-arm the very queue it is draining, and the count would rise and fall for ever instead of reaching zero. Answers with zeroes, quietly, when there is no active connection. A key has no Google account to sync, and no scope can give it one.',
    tag: "Calendar",
    scopes: [],
    actor: "session",
  },
  {
    method: "DELETE",
    path: "/calendar/connection",
    procedure: "calendar.disconnect",
    summary: "Disconnect the caller's calendar",
    description:
      "Switches sync off and deletes the calendar Plannr created in the caller's account, along with every class in it. The Google account itself is untouched, and reconnecting later starts a fresh calendar rather than recovering this one. Only the person who granted it can revoke it, which is the same reason the rest of `/calendar` refuses a key.",
    tag: "Calendar",
    scopes: [],
    actor: "session",
    input: "none",
    dangerous: true,
  },
  {
    method: "GET",
    path: "/notifications/push",
    procedure: "push.config",
    summary:
      "Whether push notifications are available, and the key to subscribe with",
    description:
      "Whether this deployment has push configured at all, the public VAPID key a browser needs to subscribe, and how many of the caller's own devices are already listening. Browser-only: a device subscription belongs to a person's phone, and an application has none.",
    tag: "Notifications",
    scopes: [],
    actor: "session",
    input: "none",
  },
  {
    method: "POST",
    path: "/notifications/push/subscriptions",
    procedure: "push.subscribe",
    summary: "Turn notifications on for this browser",
    description:
      "Registers the browser's push endpoint and its two encryption keys against the caller. The endpoint is unique, so signing in as somebody else on the same phone moves the registration to them rather than duplicating it.",
    tag: "Notifications",
    scopes: [],
    actor: "session",
  },
  {
    method: "POST",
    path: "/notifications/push/unsubscribe",
    procedure: "push.unsubscribe",
    summary: "Turn notifications off for this browser",
    description:
      "Forgets one browser's registration. Only the caller's own can be removed; naming somebody else's endpoint removes nothing.",
    tag: "Notifications",
    scopes: [],
    actor: "session",
  },
  {
    method: "POST",
    path: "/notifications/push/test",
    procedure: "push.sendTest",
    summary: "Send a test notification to the caller's devices",
    description:
      "Sends one notification to every device the caller has enabled and answers with how many accepted it.",
    tag: "Notifications",
    scopes: [],
    actor: "session",
    input: "none",
  },
];
