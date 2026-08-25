import { type RouteDef } from "../types";

/**
 * The schedule builder, from outside.
 *
 * A plan is a private sketch of a week that becomes real only at the very end.
 * The lifecycle the endpoints below trace is the whole feature: draft it, fill
 * it with demand, let the solver lay it out, share it for sign-off, and — once
 * everyone it was shared with has said yes — write it onto the live timetable.
 * `POST /plans/{id}/apply` is the one step in this entire API that schedules
 * real classes for real people, and it is deliberately the hardest one to reach
 * by accident.
 *
 * Three shape decisions, all of which were arguable:
 *
 * **Sub-resources nest.** Requirements, sessions and comments have no meaning
 * away from the plan that owns them, and a bare `/requirements/{id}` would let
 * an integrator hold an identifier without ever knowing which draft it belongs
 * to. So they live under `/plans/{planId}/…`, even though several of the
 * procedures underneath take only the child's own id and quietly ignore the
 * parent the path carries. The redundancy costs a caller nothing and buys the
 * URL the one property a URL should have: you can read it and know what it is.
 *
 * **Parameters are named after the field they feed, or after the parent they
 * identify.** `{id}` where the procedure's input is keyed `id`, `{planId}`
 * where the segment names the plan a child hangs off. That is why the plan
 * appears as `/plans/{id}/share` and as `/plans/{planId}/comments` in the same
 * document — the difference is not sloppiness, it is which of the two jobs the
 * segment is doing.
 *
 * **Previews sit under the thing they preview.** `…/requirements/import` and
 * `…/requirements/import/preview`; `…/apply` and `…/apply/preview`. A preview
 * writes nothing and answers the question "what would this do", so pairing it
 * with the operation rather than inventing a `dryRun` flag keeps the
 * destructive verb and its dress rehearsal impossible to confuse. The import
 * preview is a POST despite writing nothing, because its input is a CSV file
 * of up to two megabytes and a query string is not somewhere a file goes.
 *
 * **Scopes.** These are unusually mixed, and the mixture is honest rather than
 * lazy. `loadPlan` in the router applies three rules — a draft belongs to its
 * author alone, a shared plan is readable by anyone with planner access, and
 * only the author edits it while it is still a draft — and it demands
 * `ManageSchedulePlans` on every write path. So every endpoint that edits the
 * draft declares that bit, because the procedure genuinely requires it. The
 * endpoints declaring `[]` are the ones whose real rule is ownership and not a
 * permission: you may read, delete, archive, withdraw, comment on and preview
 * the application of *your own* plan holding no planner bits at all, and no
 * permission in the system lets you do any of it to somebody else's. A scope
 * list cannot express "if it is yours", so those say nothing and their
 * descriptions say the rest.
 *
 * **No endpoint here is `session`-only.** A key is a principal with its own
 * drafts, so the whole lifecycle is legitimately automatable: a key may create
 * a plan, import its demand, generate it, share it with human reviewers and
 * apply it once they have signed off. The one place a key hits a wall is
 * `POST /plans/{id}/review`, and it hits it inside the procedure rather than
 * here — reviewer seats are only ever offered to people, so a key holding
 * `ApproveSchedulePlans` can call the endpoint and will simply never hold a
 * seat to answer from.
 */
export const planRoutes: RouteDef[] = [
  {
    method: "GET",
    path: "/plans",
    procedure: "plans.list",
    summary: "List schedule plans",
    description:
      "Your own drafts plus everything that has been shared, newest activity first. `scope` narrows it: `mine` is what you created, `shared` is everything past the draft stage, and `review` is the subset waiting on your own answer — which for a key is always empty, since keys are never named as reviewers.",
    tag: "Schedule plans",
    scopes: ["ViewSchedulePlans"],
  },
  {
    method: "GET",
    path: "/plans/workspace",
    procedure: "plans.workspace",
    summary: "Fetch the reference data a plan is built against",
    description:
      "Active rooms, the terms a plan can be attached to, the organisation's scheduling settings and its timezone. Nothing about any particular plan — fetch it once and reuse it across all of them.",
    tag: "Schedule plans",
    scopes: ["ViewSchedulePlans"],
    input: "none",
  },
  {
    method: "GET",
    path: "/plans/reviewer-candidates",
    procedure: "plans.reviewerCandidates",
    summary: "List the people who can sign a plan off",
    description:
      "Only people who actually hold `ApproveSchedulePlans` are returned, and never yourself. Service accounts are excluded whoever asks: a key can hold the approval bit, but it can never be asked to exercise judgement, and naming one as a reviewer would leave the plan waiting forever on somebody who will never open it.",
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans"],
  },
  {
    method: "POST",
    path: "/plans",
    procedure: "plans.create",
    summary: "Start a schedule plan",
    description:
      "Creates an empty draft, visible to nobody but you until you share it. `weekStart` may be any date inside the week the pattern hangs off — it is snapped to that week's Monday in the organisation's timezone. Set `repeatUntil` to have the pattern repeat weekly when the plan is eventually applied.",
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans"],
    status: 201,
  },
  {
    method: "GET",
    path: "/plans/{id}",
    procedure: "plans.byId",
    summary: "Fetch one plan with its demand, sessions, reviewers and comments",
    description:
      "Everything a plan workspace needs in a single call. No scope is listed because the rule is ownership rather than permission: a draft answers only to the person who created it and is indistinguishable from a missing plan to everybody else, while a shared plan needs `ViewSchedulePlans`.",
    tag: "Schedule plans",
    scopes: [],
  },
  {
    method: "PATCH",
    path: "/plans/{id}",
    procedure: "plans.update",
    summary: "Edit a plan's name, term and scheduling settings",
    description:
      "Changing the working days, the day's start and end, the slot size or the per-day cap changes the box the solver has to fit the week into; it does not move anything already placed, so regenerate afterwards. Only the person who created a plan can edit it, and only while it is still a draft — a plan out for review must be withdrawn or revised first.",
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans"],
  },
  {
    method: "DELETE",
    path: "/plans/{id}",
    procedure: "plans.delete",
    summary: "Delete a plan",
    description:
      "Takes the demand, the placements and the whole review history with it. Only the creator may delete, and a plan that has been applied is refused outright — deleting it would erase the record of what put those classes on the timetable. Archive that one instead.",
    tag: "Schedule plans",
    scopes: [],
    dangerous: true,
  },
  {
    method: "GET",
    path: "/plans/{id}/history",
    procedure: "plans.history",
    summary: "List the revisions in a plan's chain",
    description:
      "Every draft descended from the same original, oldest first, with the one you asked about flagged as current. Revisions you cannot see — somebody else's private drafts in the same chain — are left out rather than redacted.",
    tag: "Schedule plans",
    scopes: [],
  },
  {
    method: "POST",
    path: "/plans/{id}/archive",
    procedure: "plans.archive",
    summary: "Archive a plan",
    description:
      "Retires a plan without destroying it — the right ending for one that has been applied, and the only ending available to it. Archived plans stay readable and stay in the revision history; they simply cannot be edited again. Creator only.",
    tag: "Schedule plans",
    scopes: [],
  },
  {
    method: "POST",
    path: "/plans/{planId}/requirements",
    procedure: "plans.addRequirement",
    summary: "Add a teaching requirement to a plan",
    description:
      "One line of demand: this group needs this subject this many times a week, for this long, with these teachers and in a room of this kind. It is a statement of what is needed, not a placement — nothing lands on the grid until you generate.",
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans"],
    status: 201,
  },
  {
    method: "POST",
    path: "/plans/{planId}/requirements/import",
    procedure: "plans.importCommit",
    summary: "Import a plan's demand from a CSV",
    description:
      "The CSV is parsed again on the server rather than trusted from the preview, and the whole file is refused if any line still has an error — a half-imported timetable is worse than none. `replace: true` deletes every requirement already on the plan before importing, and takes their generated sessions with them. Send the same CSV to `/preview` first to see what it resolves to.",
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans"],
    dangerous: true,
  },
  {
    method: "POST",
    path: "/plans/{planId}/requirements/import/preview",
    procedure: "plans.importPreview",
    summary: "Check a demand CSV without importing it",
    description:
      "Resolves every line against the real groups, teachers and rooms and reports what it matched, what it guessed at and what it could not make sense of. Writes nothing. A POST rather than a GET only because a two-megabyte CSV has nowhere sensible to sit in a query string.",
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans"],
    input: "body",
  },
  {
    method: "PATCH",
    path: "/plans/{planId}/requirements/{requirementId}",
    procedure: "plans.updateRequirement",
    summary: "Edit a teaching requirement",
    description:
      "Fields left out are left alone. Already-generated sessions are not re-laid-out by this call, so a change to `sessionsPerWeek` or `durationMinutes` does not take effect on the grid until the plan is generated again.",
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans"],
    params: { requirementId: "id" },
  },
  {
    method: "DELETE",
    path: "/plans/{planId}/requirements/{requirementId}",
    procedure: "plans.removeRequirement",
    summary: "Remove a teaching requirement",
    description:
      "Every session the solver generated from this requirement is deleted with it, pinned ones included — the demand is what those sessions existed to satisfy.",
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans"],
    params: { requirementId: "id" },
    dangerous: true,
  },
  {
    method: "POST",
    path: "/plans/{id}/generate",
    procedure: "plans.generate",
    summary: "Lay the plan's demand out across the week",
    description:
      'Deletes every unpinned session and solves the week again from the demand. Pinned sessions survive untouched and are treated as fixed points, which is what makes "regenerate, but leave the Monday lab where I put it" work — so pin anything you have placed by hand and want to keep. Sessions cleared off the grid are unpinned, and will not come back unchanged. Touches only the draft; nothing here reaches the live timetable.',
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans"],
    dangerous: true,
  },
  {
    method: "POST",
    path: "/plans/{planId}/sessions/{sessionId}/move",
    procedure: "plans.moveSession",
    summary: "Place a proposed session by hand",
    description:
      "Sets the day, the time and optionally the room, and pins the session as a side effect so the next generate leaves it alone. The placement is checked against the rest of the plan — and against the live timetable, if the plan respects it — before it is written; a clash answers 409 with the reason rather than moving the session anywhere.",
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans"],
    params: { sessionId: "id" },
  },
  {
    method: "POST",
    path: "/plans/{planId}/sessions/{sessionId}/pin",
    procedure: "plans.setSessionPinned",
    summary: "Pin a proposed session so regenerating leaves it alone",
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans"],
    params: { sessionId: "id" },
    defaults: { pinned: true },
  },
  {
    method: "POST",
    path: "/plans/{planId}/sessions/{sessionId}/unpin",
    procedure: "plans.setSessionPinned",
    summary: "Unpin a proposed session",
    description:
      "Hands the session back to the solver. It is a candidate for deletion and replacement from the next generate onwards.",
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans"],
    params: { sessionId: "id" },
    defaults: { pinned: false },
  },
  {
    method: "POST",
    path: "/plans/{planId}/sessions/{sessionId}/clear",
    procedure: "plans.clearSession",
    summary: "Take a proposed session off the grid",
    description:
      "Strips the day, time and room and unpins the session, leaving the requirement behind it untouched — the demand is still there, it just has nowhere to be. Because clearing unpins, the next generate will delete this session and place a fresh one for the same requirement.",
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans"],
    params: { sessionId: "id" },
  },
  {
    method: "POST",
    path: "/plans/{id}/share",
    procedure: "plans.share",
    summary: "Share a plan for sign-off",
    description:
      "The moment a draft stops being private, and therefore the moment its reviewer list is fixed. Everyone named must actually hold `ApproveSchedulePlans` — a reviewer who cannot answer is a plan that can never reach approved — and the plan cannot be edited again until it is withdrawn or revised. Creator only.",
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans"],
    dangerous: true,
  },
  {
    method: "POST",
    path: "/plans/{id}/withdraw",
    procedure: "plans.withdraw",
    summary: "Pull a plan back out of review",
    description:
      "Makes the plan a private draft again and resets every reviewer to pending, discarding the decisions and notes they had already given. Refused once a plan has been applied — by then the timetable is the record, not the plan. Creator only.",
    tag: "Schedule plans",
    scopes: [],
    dangerous: true,
  },
  {
    method: "POST",
    path: "/plans/{id}/review",
    procedure: "plans.review",
    summary: "Approve a shared plan, or send it back for changes",
    description:
      "Answers on your own behalf, so it needs a reviewer seat on this particular plan as well as the scope — holding `ApproveSchedulePlans` in general is not enough, and a key will never be offered a seat. A `note` is recorded against your decision and posted as a comment. The plan's status is recomputed from every reviewer at once: one request for changes outweighs any number of approvals, and it reaches approved only when everybody has approved.",
    tag: "Schedule plans",
    scopes: ["ApproveSchedulePlans"],
  },
  {
    method: "POST",
    path: "/plans/{planId}/comments",
    procedure: "plans.comment",
    summary: "Comment on a plan",
    description:
      "Anyone who can see the plan can comment on it. Pass `sessionId` to pin the remark to one proposed session rather than the plan as a whole.",
    tag: "Schedule plans",
    scopes: [],
    status: 201,
  },
  {
    method: "PATCH",
    path: "/plans/{planId}/comments/{commentId}",
    procedure: "plans.resolveComment",
    summary: "Mark a comment resolved or reopen it",
    description:
      "`resolved` is the only field this accepts — a comment's text is never edited after the fact, since the review history is a record of what was said. Resolving is open to the plan's creator, who is usually the one dealing with the point, and to anyone holding `ApproveSchedulePlans`.",
    tag: "Schedule plans",
    scopes: [],
    params: { commentId: "id" },
  },
  {
    method: "DELETE",
    path: "/plans/{planId}/comments/{commentId}",
    procedure: "plans.deleteComment",
    summary: "Delete your own comment",
    description:
      "Authors only, with no override for the plan's creator or an administrator. Somebody else's remark on a plan is part of the review record and is not yours to remove.",
    tag: "Schedule plans",
    scopes: [],
    params: { commentId: "id" },
  },
  {
    method: "POST",
    path: "/plans/{id}/revise",
    procedure: "plans.revise",
    summary: "Copy a plan into a fresh draft",
    description:
      "The way to change a plan that has been shared, approved or applied. The demand and the placements come across; the comments and the approvals do not, because an approval is an answer about one specific timetable and must not survive a change to it. The new draft joins the same revision chain with the next version number, and a given draft can only be revised once.",
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans"],
    status: 201,
  },
  {
    method: "GET",
    path: "/plans/{id}/apply/preview",
    procedure: "plans.applyPreview",
    summary: "See what applying a plan would do to the timetable",
    description:
      "Writes nothing. Reports how many classes would be created and over how many weeks, which sessions are blocked by a clash and which merely warn, and which co-taught sessions would reach the class under only their first teacher. Read this before every apply — it is the last cheap look at the consequences.",
    tag: "Schedule plans",
    scopes: [],
  },
  {
    method: "POST",
    path: "/plans/{id}/apply",
    procedure: "plans.applyToTimetable",
    summary: "Write an approved plan onto the live timetable",
    description:
      "Stop and read this one twice. Every other endpoint in this API edits a draft; this creates real classes, in real rooms, for real students and staff, repeating every week until the plan's `repeatUntil` — a term's worth of teaching from a single request. There is no undo: reversing it means cancelling the events it created, one series at a time. The gates are deliberately narrow. The plan must be approved by every reviewer it was shared with, and is re-checked for that inside the transaction so two people cannot both apply it; you must be the person who created it; and you must hold `ManageSchedulePlans` and `ManageAllEvents` together, because scheduling a term is a timetable operation and not merely a planning one. Call `/apply/preview` first and act on what it tells you — sessions it lists as blocking will not be created, and if the organisation blocks conflicts the whole apply fails rather than skipping them.",
    tag: "Schedule plans",
    scopes: ["ManageSchedulePlans", "ManageAllEvents"],
    dangerous: true,
  },
];
