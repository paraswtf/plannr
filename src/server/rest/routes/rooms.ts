import { type RouteDef } from "../types";

/**
 * Rooms, and the buildings that hold them.
 *
 * The most-used corner of the API and the least surprising one, with three
 * judgement calls worth writing down.
 *
 * Reads carry no scope. `rooms.list`, `rooms.byId`, `rooms.availability`,
 * `rooms.nextFreeSlot` and `buildings.list` are bare `protectedProcedure`s: the
 * app asks only that you are signed in, and the room directory is not a secret
 * from anybody who is. Naming `ViewRooms` on them would read as documentation
 * and behave as a rule — one this layer had invented and the web client did not
 * have — so where a scope appears below it is because the procedure checks that
 * exact bit. `deleteImpact` is the odd one: a read, scoped `ManageRooms`,
 * because it is only ever asked immediately before a deletion.
 *
 * Method follows what the procedure does with what you send. PATCH where it
 * merges your fields into the row already there, PUT where it wants every
 * writable field and overwrites. `rooms.update` takes a partial and is the
 * former; `buildings.update` insists on a name and is the latter.
 *
 * A room has three endings and they are not interchangeable. Archiving takes it
 * out of service while leaving every timetable it appears in readable, and is
 * almost always what somebody means; deleting removes it, and with `force`
 * takes its events down too. `GET /rooms/{id}/delete-impact` is the question
 * the confirmation dialog asks, and changes nothing.
 */
export const roomRoutes: RouteDef[] = [
  {
    method: "GET",
    path: "/rooms",
    procedure: "rooms.list",
    summary: "List rooms",
    description:
      "Filter by building, type, minimum capacity and features — `features` matches rooms that have every one you name, not any of them. Archived rooms are left out unless `includeInactive` is true.",
    tag: "Rooms",
    scopes: [],
  },
  {
    method: "GET",
    path: "/rooms/available",
    procedure: "rooms.availability",
    summary: "List the rooms free for a window",
    description:
      "`from` and `to` are required, and the filters from `/rooms` all apply. A room is free when nothing that occupies it overlaps the window — a cancelled sitting does not hold a room, so it does not count against one. Archived rooms are never offered.",
    tag: "Rooms",
    scopes: [],
  },
  {
    method: "POST",
    path: "/rooms",
    procedure: "rooms.create",
    summary: "Add a room",
    tag: "Rooms",
    scopes: ["ManageRooms"],
    status: 201,
  },
  {
    method: "POST",
    path: "/rooms/batch",
    procedure: "rooms.createMany",
    summary: "Add up to 200 rooms at once",
    description:
      "All or nothing. Codes are checked against each other and against the rooms already there before anything is written, so a clash names the offending code instead of failing the batch on a unique-constraint error halfway through.",
    tag: "Rooms",
    scopes: ["ManageRooms"],
    status: 201,
  },
  {
    method: "GET",
    path: "/rooms/{id}",
    procedure: "rooms.byId",
    summary: "Fetch one room",
    description:
      "Answers `null` with a 200, not a 404, when there is no such room. That is what the procedure the web client calls does, and this layer reports the app rather than improving on it.",
    tag: "Rooms",
    scopes: [],
  },
  {
    method: "PATCH",
    path: "/rooms/{id}",
    procedure: "rooms.update",
    summary: "Edit a room",
    description:
      "Every field is optional and what you send is merged into the room — except `features`, which replaces the list outright rather than adding to it.",
    tag: "Rooms",
    scopes: ["ManageRooms"],
  },
  {
    method: "DELETE",
    path: "/rooms/{id}",
    procedure: "rooms.delete",
    summary: "Delete a room",
    description:
      "Refused while the room has events, unless you pass `?force=true` — which deletes those events, every sitting of them, and queues the calendar update that tells whoever was due there. Archiving is the reversible answer and is nearly always the one you want.",
    tag: "Rooms",
    scopes: ["ManageRooms"],
    dangerous: true,
  },
  {
    method: "GET",
    path: "/rooms/{id}/delete-impact",
    procedure: "rooms.deleteImpact",
    summary: "Count what deleting a room would take with it",
    description:
      "The events attached to the room, and how many of their sittings are still ahead. Scoped `ManageRooms` despite being a read, because it is the question asked just before a deletion and the answer is only useful to somebody who could go through with it.",
    tag: "Rooms",
    scopes: ["ManageRooms"],
  },
  {
    method: "POST",
    path: "/rooms/{id}/archive",
    procedure: "rooms.archive",
    summary: "Take a room out of service",
    description:
      "Drops it from the room lists and the availability search while leaving every timetable it appears in readable. Safe to repeat, and an unknown id is a quiet no-op rather than a 404 — the procedure reports success without checking that the room was there.",
    tag: "Rooms",
    scopes: ["ManageRooms"],
  },
  {
    method: "POST",
    path: "/rooms/{id}/restore",
    procedure: "rooms.restore",
    summary: "Put an archived room back into service",
    description:
      "The other half of `/rooms/{id}/archive`, with the same quiet no-op on an id that does not exist.",
    tag: "Rooms",
    scopes: ["ManageRooms"],
  },
  {
    method: "GET",
    path: "/rooms/{id}/next-free-slot",
    procedure: "rooms.nextFreeSlot",
    summary: "Find the next window this room is free",
    description:
      "The earliest gap of `durationMinutes` starting at or after `after`. `ignoreEventId` leaves one event out of the search, which is what makes the answer usable when that event is the one you are trying to move.",
    tag: "Rooms",
    scopes: [],
    params: { id: "roomId" },
  },

  {
    method: "GET",
    path: "/buildings",
    procedure: "buildings.list",
    summary: "List buildings",
    description:
      "Every building the college has, alphabetically, each with a count of the rooms grouped under it.",
    tag: "Buildings",
    scopes: [],
    input: "none",
  },
  {
    method: "POST",
    path: "/buildings",
    procedure: "buildings.create",
    summary: "Add a building",
    tag: "Buildings",
    scopes: ["ManageRooms"],
    status: 201,
  },
  {
    method: "PUT",
    path: "/buildings/{id}",
    procedure: "buildings.update",
    summary: "Rename a building",
    description:
      "The name is the only thing about a building anybody edits, and the procedure requires it, so this is a PUT rather than a PATCH with one mandatory field.",
    tag: "Buildings",
    scopes: ["ManageRooms"],
  },
  {
    method: "DELETE",
    path: "/buildings/{id}",
    procedure: "buildings.delete",
    summary: "Delete an empty building",
    description:
      "Refused while any room still names it, because those rooms would go with it. Move them or delete them first.",
    tag: "Buildings",
    scopes: ["ManageRooms"],
  },
];
