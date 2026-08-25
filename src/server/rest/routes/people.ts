import { type RouteDef } from "../types";

/**
 * The directory, and the roles that say what everybody in it may do.
 *
 * Two tags, one file, because they are one subject. A role is only interesting
 * as something a person holds, and every question worth asking about somebody's
 * authority — why can she cancel a lecture, why can he not import a spreadsheet
 * — is answered by reading their roles. Filing them apart would mean opening
 * two documents to answer one question.
 *
 * Four judgement calls are baked into the shapes below.
 *
 * **Replacements are `PUT`, not `PATCH`.** `setGroups`, `setRoles` and
 * `setExtraPermissions` each take a whole set and make it so: send one role and
 * the other four are gone. `PATCH` would advertise a merge that none of them
 * performs, and an integration that believed it would quietly strip an
 * administrator down to a single role and report success. `PUT` promises
 * exactly what happens.
 *
 * **Two reads are `POST`.** `POST /users/resolve` and
 * `POST /users/import/preview` change nothing whatsoever — the preview is a dry
 * run that deliberately re-runs at commit rather than being trusted back — but
 * one takes two thousand identifiers and the other takes two megabytes of CSV.
 * Neither survives a query string, and a `GET` with a body is not a request
 * anybody can rely on. So they are `POST`s, and the summaries say plainly that
 * they write nothing.
 *
 * **Some scopes are not the ones you would guess.** Editing a person's group
 * membership wants `ManageGroups`, not `ManageUsers`, because it is a change to
 * a cohort that happens to be reached from a profile page. Granting an
 * individual permission bit wants `ManageRoles`, not `ManageUsers`, because it
 * is an act of granting authority and belongs with the other one. Both are
 * declared as the procedure actually checks, which is the only thing that keeps
 * this file honest.
 *
 * **`GET /users/me` is the one endpoint here a key may not call**, and the
 * reason is specific rather than squeamish. The procedure answers out of the
 * database, and a key's machine identity holds no roles and a `permissions`
 * column that is zero and stays zero — the key's authority lives on
 * `ApiKey.scopes` and nowhere else, which is the whole point of the design. So
 * a key asking "what am I allowed to do?" would be told `effectivePermissions:
 * "0"` by a request that is itself proof of the opposite. A refusal is worth
 * more than a confident lie. Ask about a named person instead, with
 * `GET /users/{id}`.
 *
 * Machine identities are absent from the rest of this slice too, and not by
 * accident here either: the directory filters them out, `GET /users/{id}`
 * answers `null` for one, and every mutation refuses one outright. An API key
 * has a record — it is on `/api-keys`, where its powers can be changed
 * honestly — and it does not have a colleague.
 */
export const peopleRoutes: RouteDef[] = [
  {
    method: "GET",
    path: "/users",
    procedure: "users.list",
    summary: "List people in the directory",
    description:
      "Paged, and filterable by free text (`query`, matched against name, email and PRN), by `roleId`, and by `status` — one of `all`, `active`, `inactive` or `never-signed-in`, the last meaning imported but never yet arrived. Machine identities never appear; list those with `GET /api-keys`.",
    tag: "People",
    scopes: ["ViewUsers"],
  },
  {
    method: "GET",
    path: "/users/count",
    procedure: "users.count",
    summary: "Count the people a filter would match",
    description:
      'The same filters as `GET /users`, without fetching the rows. Answers a bare number, for the "N matches" hint that appears while somebody is still typing.',
    tag: "People",
    scopes: ["ViewUsers"],
  },
  {
    method: "GET",
    path: "/users/me",
    procedure: "users.me",
    summary: "Fetch the calling user's own profile",
    description:
      "Name, roles, and the permissions those roles add up to, for whoever is holding the session. There is no equivalent for a key: a key's authority is the `scopes` it was minted with, which it already knows, and this procedure would report the zero sitting in its principal's `permissions` column instead. To read a particular person, say who you mean — `GET /users/{id}`.",
    tag: "People",
    scopes: [],
    actor: "session",
    input: "none",
  },
  {
    method: "POST",
    path: "/users",
    procedure: "users.create",
    summary: "Add a person to the directory",
    description:
      "At least one role is required — an account with none can sign in and do nothing. A `prn` creates the student record that group membership hangs off, and anyone given the built-in `faculty` role also gets a faculty profile, taking `shortName` if you send one and their full name if you do not. An email address already on the system is a 409, whoever holds it.",
    tag: "People",
    scopes: ["ManageUsers"],
    status: 201,
  },
  {
    method: "POST",
    path: "/users/bulk-delete",
    procedure: "users.bulkDelete",
    summary: "Delete up to 500 people at once",
    description:
      "Skips rather than fails. A row you are not allowed to remove — yourself, somebody holding a permission you lack, an API key's machine identity — is left alone and returned under `skipped` with the reason, so one protected person cannot block a whole selection. The response is the only record of which of the ids you sent actually went, so read it: the rest is permanent and everything the deleted people created goes with them.",
    tag: "People",
    scopes: ["ManageUsers"],
    dangerous: true,
  },
  {
    method: "POST",
    path: "/users/resolve",
    procedure: "users.resolveIdentifiers",
    summary: "Resolve pasted emails and PRNs to people",
    description:
      "Writes nothing — a `POST` only because two thousand identifiers do not fit in a query string. Anything containing an `@` is treated as an email and everything else as a PRN. What could not be matched comes back under `unmatched` rather than being silently dropped, which is the difference between adding fifty-eight students to a group and believing you added sixty. Placeholder addresses never match, and neither do machine identities.",
    tag: "People",
    scopes: ["ViewUsers"],
  },
  {
    method: "POST",
    path: "/users/import/preview",
    procedure: "users.importPreview",
    summary: "Preview what importing a CSV would do",
    description:
      "A dry run: parses, validates and diffs the file against the database, and changes nothing at all. `POST` because the file goes in the body. The commit re-runs every bit of this rather than trusting these results back, so a plan cannot be edited on its way to being applied, and a database that moved on in between is noticed.",
    tag: "People",
    scopes: ["ImportUsers"],
  },
  {
    method: "POST",
    path: "/users/import",
    procedure: "users.importCommit",
    summary: "Import a CSV of people",
    description:
      'Creates and updates people, student records and group memberships in one pass, and refuses the whole file if any row still has an error. A file naming groups that do not exist is refused too, unless you send `createMissingGroups: true` — which will invent them under a catch-all "Imported groups" programme, so check the preview\'s `newGroups` before you set it rather than after. Send `fileName` and the batch is recorded under it. There is no undo.',
    tag: "People",
    scopes: ["ImportUsers"],
    dangerous: true,
  },
  {
    method: "GET",
    path: "/users/{id}",
    procedure: "users.byId",
    summary: "Fetch one person",
    description:
      "Answers `200` with `null` rather than `404` when there is no such person, and does the same for an API key's machine identity — those have a record on `/api-keys`, not in the directory.",
    tag: "People",
    scopes: ["ViewUsers"],
  },
  {
    method: "PATCH",
    path: "/users/{id}",
    procedure: "users.update",
    summary: "Edit a person's details",
    description:
      "A genuine partial update: anything you leave out is untouched. Sending `prn` as `null` deletes their student record and, with it, every group membership hanging off it. `isActive: false` is the lockout — the record survives, the person stops being able to sign in. One surprise worth knowing: giving a real email address to somebody who had only a placeholder reactivates them, on the grounds that they were shut out by the college's paperwork rather than by a decision anyone made. You may not edit yourself here, nor anybody holding a permission you lack.",
    tag: "People",
    scopes: ["ManageUsers"],
  },
  {
    method: "DELETE",
    path: "/users/{id}",
    procedure: "users.delete",
    summary: "Delete a person",
    description:
      'Permanent, and it takes their student record, their memberships and their attributions with it. Refused on yourself, on anybody holding a permission you lack, and on an API key\'s machine identity — revoke the key instead, which stops it working while leaving "who created this event" still answerable. Deactivating with `PATCH /users/{id}` is almost always what is wanted for somebody who has simply left.',
    tag: "People",
    scopes: ["ManageUsers"],
    dangerous: true,
  },
  {
    method: "GET",
    path: "/users/{id}/groups",
    procedure: "users.groups",
    summary: "List the groups a person belongs to",
    description:
      "Membership is recorded against a student record, so somebody with no PRN answers `hasStudentProfile: false` and an empty list — which is a different fact from belonging to nothing, and worth distinguishing before you write the set back.",
    tag: "People",
    scopes: ["ViewUsers"],
  },
  {
    method: "PUT",
    path: "/users/{id}/groups",
    procedure: "users.setGroups",
    summary: "Replace the groups a person belongs to",
    description:
      "Replaces the whole set: send every group they should end up in, because any you leave out they are removed from, and dropping a student out of a division quietly rewrites sixty people's rosters. Ids that do not belong to this organisation are ignored rather than rejected, so compare the returned `assigned` count against what you sent. Requires `ManageGroups` — this edits a cohort, and only reaches it through a profile. Somebody with no PRN is refused: give them one first.",
    tag: "People",
    scopes: ["ManageGroups"],
    dangerous: true,
  },
  {
    method: "PUT",
    path: "/users/{id}/roles",
    procedure: "users.setRoles",
    summary: "Replace the roles a person holds",
    description:
      "With `PUT /users/{id}/permissions`, the most security-sensitive endpoint in this API outside `/api-keys`: between them they are how anybody becomes an administrator. Replaces outright — send every role the person should end up with, and an empty array leaves them able to sign in and nothing else. Three guards, none of them waivable: you cannot re-role yourself, you cannot touch anybody already holding a permission you lack, and you cannot hand out a role carrying permissions you do not hold yourself. A key's machine identity is refused, because a role on a principal would widen the key on every request without ever appearing in its scopes.",
    tag: "People",
    scopes: ["ManageUsers"],
    dangerous: true,
  },
  {
    method: "PUT",
    path: "/users/{id}/permissions",
    procedure: "users.setExtraPermissions",
    summary: "Set the permission bits a person holds individually",
    description:
      'Grants that sit on the person rather than on any role, as a decimal bitfield string — JSON has no BigInt, so `"8388608"`, not a number. Replaces outright: send the whole field, since `"0"` is how you take the lot away. Sensitive for the same reason as `PUT /users/{id}/roles`, and guarded the same way — not yourself, not somebody above you, and never a bit you do not hold — but more easily missed, because a permission granted here belongs to no role and so shows up nowhere on the roles screen. Note the scope: `ManageRoles`, not `ManageUsers`. This is granting authority, and it is filed with the rest of it.',
    tag: "People",
    scopes: ["ManageRoles"],
    dangerous: true,
  },
  {
    method: "GET",
    path: "/roles",
    procedure: "roles.list",
    summary: "List the organisation's roles",
    description:
      "Built-in roles first, then custom ones by name. Each carries its permissions three ways: `permissions` as granted, `effectivePermissions` including everything implied, and `impliedPermissions` for the bits held only by implication — which is what an editor renders ticked but locked. `userCount` counts people, so no key is ever counted as a colleague.",
    tag: "Roles",
    scopes: ["ViewUsers"],
    input: "none",
  },
  {
    method: "POST",
    path: "/roles",
    procedure: "roles.create",
    summary: "Create a custom role",
    description:
      "`permissions` is a decimal bitfield string. You cannot mint a role carrying anything you do not hold yourself — without that rule, anybody who could manage roles could escalate to full administrator in two requests. Names are unique within the organisation.",
    tag: "Roles",
    scopes: ["ManageRoles"],
    status: 201,
  },
  {
    method: "GET",
    path: "/roles/permissions",
    procedure: "roles.catalog",
    summary: "List every permission a role can grant",
    description:
      "The vocabulary itself — each permission's name, label, group, its `bit` as a decimal string, and the `implies` mask it expands to. Static, identical in every install, and gated on nothing beyond holding a valid credential: it describes the software, not this college. Build a permission editor from this rather than hard-coding bit positions, which are fixed forever precisely so that stored bitfields keep their meaning.",
    tag: "Roles",
    scopes: [],
    input: "none",
  },
  {
    method: "GET",
    path: "/roles/{id}",
    procedure: "roles.byId",
    summary: "Fetch one role",
    description:
      "Answers `200` with `null` rather than `404` when no such role exists in this organisation.",
    tag: "Roles",
    scopes: ["ViewUsers"],
  },
  {
    method: "PATCH",
    path: "/roles/{id}",
    procedure: "roles.update",
    summary: "Edit a custom role",
    description:
      "Partial: send only what changes. Sending `permissions` replaces the field outright and takes effect immediately for everybody holding the role, which is what makes an innocuous-looking edit here reach further than any single-person change. The built-in roles are locked — their meaning is the same in every install, so bespoke arrangements go in a custom role. You cannot add a permission you do not hold, and you cannot edit a role you hold yourself in a way that removes your own ability to manage roles.",
    tag: "Roles",
    scopes: ["ManageRoles"],
    dangerous: true,
  },
  {
    method: "DELETE",
    path: "/roles/{id}",
    procedure: "roles.delete",
    summary: "Delete a custom role",
    description:
      "Refused for built-in roles, and refused outright if anybody holds this role and no other — deleting it would cascade their only assignment away and strand them with access to nothing. Check `GET /roles/{id}/delete-impact` first and give those people another role. Everyone else simply loses the permissions this role carried.",
    tag: "Roles",
    scopes: ["ManageRoles"],
    dangerous: true,
  },
  {
    method: "GET",
    path: "/roles/{id}/delete-impact",
    procedure: "roles.deleteImpact",
    summary: "Check what deleting a role would do",
    description:
      "`userCount` is how many people would lose the role; `wouldStrand` is how many of them hold nothing else and would therefore block the delete. Answers for a built-in role too, reporting `isSystem: true` — which is the refusal you will get regardless of the counts.",
    tag: "Roles",
    scopes: ["ManageRoles"],
  },
];
