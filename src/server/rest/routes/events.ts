import { type RouteDef } from "../types";

/**
 * Bookings, approvals and change requests — the half of the API that changes
 * somebody's week.
 *
 * Three things are worth knowing before reading the list, because they explain
 * most of the shapes below.
 *
 * **Scope.** Editing, cancelling and asking for a change all take a `scope` of
 * `occurrence`, `following` or `series`, and the two narrow ones take an
 * `originalStart` naming the sitting they hang off — the date the recurrence
 * rule produced, not the date it was moved to. `series` is the default
 * everywhere, so an omitted `scope` is the *widest* one: a client that forgets
 * the field retimes or cancels every sitting of a weekly lecture rather than
 * the one it meant. That default is the app's, not this layer's, and it is
 * repeated in every description that carries it.
 *
 * **Asking is not doing.** A caller who may not write directly does not get a
 * refusal — they get a change request. `PATCH /events/{id}` files one on their
 * behalf and answers `applied: false` with a `requestId`, and that is the same
 * object `POST /events/{id}/change-requests` creates deliberately. An
 * integration must read `applied` rather than assume a 200 moved anything.
 *
 * **`scopes: []` is not "open to anyone".** Most of the writes here are bare
 * `protectedProcedure`s that check for themselves inside, because which bit you
 * need depends on what you are touching: adding a class needs
 * `ManageAllEvents`, booking a room needs `BookRoom`, and editing needs one of
 * those or ownership of the thing being edited. Naming a single bit in `scopes`
 * would refuse legitimate callers early, since this layer may only ever be
 * stricter than the app — so those routes name nothing and say what the
 * procedure really wants in prose.
 *
 * Judgement calls made in the shape itself:
 *
 *   - `/approvals` is a top-level queue rather than `/events/approvals`,
 *     because the thing it lists is not events. Bookings and change requests
 *     are stored differently and compete for the same rooms, and the procedure
 *     deliberately returns them interleaved; hanging that off `/events` would
 *     promise a collection of events and hand back something else.
 *   - Change requests get their own collection, `/change-requests/{id}`, since
 *     that is the id every decision is made against — but they are created
 *     under the event they are about, where a stranger will look for them.
 *   - Every path under `/events` spells its parameter `id`, including the one
 *     whose procedure calls the field `eventId`. One name across a group of
 *     endpoints reads better than an accurate reflection of the internals, and
 *     `params` exists for exactly this.
 *   - Cancelling is `POST /events/{id}/cancel`, not `DELETE /events/{id}`.
 *     Nothing is deleted — the event survives as `CANCELLED` and its
 *     occurrences are regenerated — and the request carries a scope, a date and
 *     a reason, which is not a body a `DELETE` should be carrying.
 */
export const eventRoutes: RouteDef[] = [
  {
    method: "GET",
    path: "/events/{id}",
    procedure: "events.byId",
    summary: "Fetch one event",
    description:
      "The event with its room, building, cohort, teacher and exceptions, plus `recurrenceText` — the recurrence rule written out in English. An id that belongs to another organisation, or to nothing at all, answers `200` with a body of `null` rather than `404`: the procedure returns null, and this layer adds no behaviour of its own.",
    tag: "Events",
    scopes: [],
  },
  {
    method: "GET",
    path: "/events/conflicts",
    procedure: "events.checkConflicts",
    summary: "Check what a proposed slot would clash with",
    description:
      "The preflight behind the booking form's warning banner. Takes the same fields as `POST /events` — room, cohorts, teacher, times and an optional recurrence rule — and books nothing. Pass `excludeEventId` when checking a slot for an event that already exists, or it will clash with itself. Answers a list of conflicts, each `hard` or `warning`, including a capacity note when the cohort outgrows the room. A hard conflict is not automatically a refusal: whether one blocks a booking is an organisation setting, and the same check runs again inside the transaction when you actually write, so a clean answer here is a courtesy rather than a reservation.",
    tag: "Events",
    scopes: [],
  },
  {
    method: "GET",
    path: "/events/mine",
    procedure: "events.myBookings",
    summary: "List the room bookings you made",
    description:
      "Every booking the calling person requested — granted, waiting and refused alike, because being told no and why is the point of having asked. One page of them in the standard envelope, ordered by when the room is wanted rather than when it was asked for; the default page is larger than anybody books in a degree, so a caller that never sends `page` gets the lot. People only. An app should read `GET /approvals` for what is still undecided and `GET /timetable/week` with an explicit `roomId`, `groupId` or `facultyId` for what was granted; there is no bookings-by-creator endpoint, and a key that created a booking already holds its id from the response that made it.",
    tag: "Events",
    scopes: [],
    actor: "session",
  },
  {
    method: "POST",
    path: "/events",
    procedure: "events.create",
    summary: "Schedule a class or book a room",
    description:
      "One endpoint for both, told apart by `kind`. A `CLASS` is institutional scheduling and needs `ManageAllEvents` and at least one group attending; a `BOOKING` is a request for a room and needs `BookRoom`, may be capped in length, and may land as `PENDING` rather than `CONFIRMED` when the organisation requires sign-off — read `event.status`, do not assume. `scopes` is empty here because the bit required depends on `kind`, and naming either would refuse half the legitimate callers.\n\nSet `rrule` for a repeating class and `skipDates` for the dates within it to leave out; a skipped date is recorded as a cancelled sitting, so the series stays one event with visible gaps. `groupIds` lists every cohort attending a combined lecture, the first being the one the read paths denormalise onto. The answer carries the event, how many dates were skipped, and any soft conflicts that did not block it.",
    tag: "Events",
    scopes: [],
    status: 201,
  },
  {
    method: "PATCH",
    path: "/events/{id}",
    procedure: "events.update",
    summary: "Move, retime or re-title an event",
    description:
      'Everything being changed goes in `patch`; `scope` says how much of the series it applies to and defaults to `series`, so omitting it rewrites every sitting. `occurrence` and `following` both require `originalStart`.\n\nTwo answers are possible and they are not the same event. When the caller may write directly, `applied` is true and the change is live — and for `scope: "following"` the returned `eventId` is a **new** event, because the series was split at that date and the tail is now its own record. When the caller may not, nothing changes: a change request is filed for somebody to decide, and the answer is `applied: false` with a `requestId`. Which case you are in depends on the organisation\'s settings and on what you are editing, so branch on `applied` rather than on the status code.',
    tag: "Events",
    scopes: [],
    dangerous: true,
  },
  {
    method: "POST",
    path: "/events/{id}/cancel",
    procedure: "events.cancel",
    summary: "Cancel an event or one of its sittings",
    description:
      'The widest endpoint in this API, and the default is the widest option it has. With no `scope`, or `scope: "series"`, the whole event is cancelled — every sitting of a weekly lecture, for everybody who has it in their week. `occurrence` drops the single sitting named by `originalStart`. `following` truncates the rule so that sitting and everything after it stop, keeping the ones already past — but only when `originalStart` is given **and** the event actually repeats; without either it falls through to cancelling the series, which is the trap worth reading twice.\n\nNothing is deleted: the event stays as `CANCELLED` and its occurrences are regenerated, so registers and calendars follow. A single cancelled sitting can be brought back with `POST /events/{id}/restore`; a cancelled series cannot be un-cancelled through this API.',
    tag: "Events",
    scopes: [],
    dangerous: true,
  },
  {
    method: "POST",
    path: "/events/{id}/restore",
    procedure: "events.restoreOccurrence",
    summary: "Restore a single cancelled sitting",
    description:
      'Undoes one occurrence-level cancellation by dropping its exception; `originalStart` is required and must be the date the recurrence rule produced. This is the counterpart of `POST /events/{id}/cancel` with `scope: "occurrence"` and nothing else — a series cancelled outright, or a tail truncated with `following`, is not reachable from here.',
    tag: "Events",
    scopes: [],
  },
  {
    method: "GET",
    path: "/approvals",
    procedure: "events.approvalQueue",
    summary: "List everything waiting for a decision",
    description:
      'Booking requests and change requests in one list, oldest first, each tagged `kind: "booking" | "change"`. They are stored differently but compete for the same rooms, so they are read together — two requests for the same hour have to be visible at once or they get decided as though they were independent.\n\nEvery item carries a server-computed `verdict`: what it would clash with, what it would merely bump into, and `contested` — the other undecided requests that want the same slot. A change also carries `was`, the state of the event today, so the item reads as a change rather than a proposal with no context.\n\nThis is the one list in the API that is never paged. It answers in the standard envelope for consistency, but always with every undecided request on page one: the queue is two tables merged and re-sorted by age, so a second page would not be a `skip` on either of them — and cutting the list is precisely how two requests for the same hour stop being visible together. The old `take` parameter is gone and is ignored if you send it.',
    tag: "Approvals",
    scopes: ["ApproveBookings"],
  },
  {
    method: "GET",
    path: "/approvals/bookings",
    procedure: "events.pendingApprovals",
    summary: "List booking requests waiting for a decision",
    description:
      "The plain list: pending room requests with their room and requester, soonest first, in the standard envelope. A queue is only ever as long as the decisions nobody has made yet, so the default page holds a year of neglect and a caller that ignores paging still sees all of it. `GET /approvals` answers the same question with change requests included and a conflict verdict worked out for each, and is what an approval screen should be built on; this one is for a client that only wants the bookings and can decide for itself.",
    tag: "Approvals",
    scopes: ["ApproveBookings"],
  },
  {
    method: "POST",
    path: "/events/{id}/approve",
    procedure: "events.approve",
    summary: "Approve a booking request",
    description:
      "Grants a pending booking and confirms it. Only a request can be granted — an event that has already been decided, cancelled or refused answers `400` rather than coming back to life on the strength of its id.\n\nThe slot is re-checked at the moment of approval, against everything the original request was checked against, because the room may well have gone while the request sat in the queue; a hard clash answers `409` when the organisation blocks conflicts. The answer names the soft `warnings` it went ahead despite, and `contested` — the other undecided requests that wanted this slot and have just lost it. Those are said out loud on purpose: somebody has to tell the people in them.",
    tag: "Approvals",
    scopes: ["ApproveBookings"],
  },
  {
    method: "POST",
    path: "/events/{id}/reject",
    procedure: "events.reject",
    summary: "Refuse a booking request",
    description:
      "Marks a pending booking as refused, recording who decided and why. The `reason` is stored separately from whatever the requester wrote, so the original ask survives the refusal — including for the appeal. The event stays visible to the person who asked, which is why `GET /events/mine` still lists it.",
    tag: "Approvals",
    scopes: ["ApproveBookings"],
  },
  {
    method: "POST",
    path: "/events/{id}/change-requests",
    procedure: "events.requestChange",
    summary: "Ask for an event to be changed",
    description:
      "Files a proposal against an event instead of editing it. The event goes on being exactly what it is — sixty people have that lecture in their week already, and a proposal nobody has agreed to must not move it under them.\n\nA request has to ask for something: a new room, a new start or end, a new title, or `cancelling: true` for the sitting to be dropped. `scope` behaves as it does everywhere here — `series` by default, `originalStart` required for the other two. Asking is not open to strangers: the people who may ask are the people who could have edited the event directly if the organisation did not require sign-off, so `scopes` is empty and the procedure applies the same ownership test as `PATCH /events/{id}`.",
    tag: "Approvals",
    scopes: [],
    params: { id: "eventId" },
    status: 201,
  },
  {
    method: "GET",
    path: "/change-requests/mine",
    procedure: "events.myRequests",
    summary: "List the change requests you filed",
    description:
      'The proposals the calling person made, decided or not, newest first, with the event each one is about and who decided it. One page in the standard envelope — the default holds a hundred, where this used to stop dead at fifty. People only — "mine" is a person-shaped question. An approver should read `GET /approvals`, which lists every pending request with its requester named explicitly; an app that filed a request holds its id from the `201` that created it and can act on that directly.',
    tag: "Approvals",
    scopes: [],
    actor: "session",
  },
  {
    method: "POST",
    path: "/change-requests/{id}/approve",
    procedure: "events.approveChange",
    summary: "Approve a change request, and apply it",
    description:
      "Approving is not a decision recorded for somebody else to carry out — it makes the change, by exactly the road an ordinary edit takes, so it reaches the grid, the registers and everybody's calendar the same way. A `series` request retimes the whole event, `following` splits it in two at `originalStart` and moves only the tail, `occurrence` moves the single sitting, and a `cancelling` request cancels — the series outright when its scope is `series`.\n\nThe destination is re-checked first, since the queue may have sat a while, and a hard clash answers `409` when the organisation blocks conflicts. A request that has already been decided answers `400`.",
    tag: "Approvals",
    scopes: ["ApproveBookings"],
    dangerous: true,
  },
  {
    method: "POST",
    path: "/change-requests/{id}/reject",
    procedure: "events.rejectChange",
    summary: "Refuse a change request",
    description:
      "Records the refusal and its reason against the request. The event is untouched, because it never moved in the first place — a pending request has no effect on the timetable until it is approved.",
    tag: "Approvals",
    scopes: ["ApproveBookings"],
  },
  {
    method: "POST",
    path: "/change-requests/{id}/withdraw",
    procedure: "events.withdrawChange",
    summary: "Withdraw a change request you filed",
    description:
      "Thought better of it. Only whoever filed the request may take it back, and only while it is still undecided — an approver refuses a request, they do not withdraw it. Unlike `GET /change-requests/mine`, this is open to an app as well as a person: the subject is the request id, not the caller, so a key withdrawing its own request is asking a question with a truthful answer.",
    tag: "Approvals",
    scopes: [],
  },
];
