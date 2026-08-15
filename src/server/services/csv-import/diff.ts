import { contactAddress, NO_ADDRESS, personName } from "~/lib/people";
import {
  MAX_IMPORT_ROWS,
  rowSchema,
  splitList,
  type ParsedRow,
} from "./schema";

/**
 * Decides what an import would do to each row, without touching the database.
 *
 * Pure on purpose: the matching rules are the fiddly part of an import, and
 * they are far easier to trust when they can be tested directly.
 */

export type RowStatus = "create" | "update" | "skip" | "error";

export interface ExistingUser {
  id: string;
  email: string;
  name: string | null;
  prn: string | null;
  /** No linked account means they were imported but have never logged in. */
  hasSignedIn: boolean;
  roleKeys: string[];
  groupNames: string[];
}

export interface RowPlan {
  line: number;
  status: RowStatus;
  data: ParsedRow;
  /** Set for update/skip: who this row matched. */
  matchedUserId?: string;
  /** Human-readable field changes, for the preview table. */
  changes: string[];
  errors: string[];
}

export interface DiffResult {
  rows: RowPlan[];
  summary: { create: number; update: number; skip: number; error: number };
  /** Group names in the file that do not exist yet. */
  newGroups: string[];
  /** Role names in the file that are not known. */
  unknownRoles: string[];
}

export interface DiffInput {
  /** Raw records straight from the CSV parser, keyed by our column names. */
  records: Array<{ line: number; values: Record<string, string | undefined> }>;
  domain: string;
  existing: ExistingUser[];
  knownRoleKeys: string[];
  knownGroupNames: string[];
  /** Roles of the person running the import, to stop privilege escalation. */
  assignableRoleKeys: string[];
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v) => b.includes(v));

export function diffRows(input: DiffInput): DiffResult {
  const schema = rowSchema(input.domain);
  const byEmail = new Map(
    input.existing.map((u) => [u.email.toLowerCase(), u]),
  );
  const byPrn = new Map(
    input.existing.filter((u) => u.prn).map((u) => [u.prn!, u]),
  );
  const knownGroups = new Set(
    input.knownGroupNames.map((g) => g.toLowerCase()),
  );
  const knownRoles = new Set(input.knownRoleKeys.map((r) => r.toLowerCase()));
  const assignable = new Set(
    input.assignableRoleKeys.map((r) => r.toLowerCase()),
  );

  const seenEmails = new Map<string, number>();
  const seenPrns = new Map<string, number>();
  const newGroups = new Set<string>();
  const unknownRoles = new Set<string>();
  const rows: RowPlan[] = [];

  for (const record of input.records.slice(0, MAX_IMPORT_ROWS)) {
    const parsed = schema.safeParse(record.values);
    if (!parsed.success) {
      rows.push({
        line: record.line,
        status: "error",
        data: {
          line: record.line,
          name: record.values.name ?? "",
          email: record.values.email ?? "",
          prn: record.values.prn ?? null,
          roles: splitList(record.values.roles),
          groups: splitList(record.values.groups),
        },
        changes: [],
        errors: parsed.error.issues.map(
          (i) => `${i.path.join(".") || "row"}: ${i.message}`,
        ),
      });
      continue;
    }

    const value = parsed.data;
    const roles = splitList(value.roles).map((r) => r.toLowerCase());
    const groups = splitList(value.groups);
    const data: ParsedRow = {
      line: record.line,
      name: value.name,
      email: value.email,
      prn: value.prn ?? null,
      roles: roles.length ? roles : ["student"],
      groups,
    };
    const errors: string[] = [];

    // Duplicates inside the file itself. Reported on the later row so the
    // first occurrence still imports cleanly once the sheet is fixed.
    const firstEmail = seenEmails.get(data.email);
    if (firstEmail !== undefined) {
      errors.push(`Duplicate of line ${firstEmail} (same email)`);
    } else {
      seenEmails.set(data.email, record.line);
    }
    if (data.prn) {
      const firstPrn = seenPrns.get(data.prn);
      if (firstPrn !== undefined) {
        errors.push(`Duplicate of line ${firstPrn} (same PRN)`);
      } else {
        seenPrns.set(data.prn, record.line);
      }
    }

    for (const role of data.roles) {
      if (!knownRoles.has(role)) unknownRoles.add(role);
      else if (!assignable.has(role)) {
        errors.push(`You cannot assign the "${role}" role`);
      }
    }
    if (data.roles.some((r) => !knownRoles.has(r))) {
      errors.push(
        `Unknown role: ${data.roles.filter((r) => !knownRoles.has(r)).join(", ")}`,
      );
    }
    for (const group of groups) {
      if (!knownGroups.has(group.toLowerCase())) newGroups.add(group);
    }

    const emailMatch = byEmail.get(data.email);
    const prnMatch = data.prn ? byPrn.get(data.prn) : undefined;

    // Email is the identity the sign-in flow joins on, so it wins. A PRN-only
    // match is treated as a correction to a record nobody has logged into yet;
    // once an account is live, changing its address is a manual decision.
    let matched: ExistingUser | undefined;
    if (emailMatch && prnMatch && emailMatch.id !== prnMatch.id) {
      errors.push(
        `Email belongs to ${personName(emailMatch)} but PRN belongs to ${personName(prnMatch)}`,
      );
    } else if (emailMatch) {
      matched = emailMatch;
    } else if (prnMatch) {
      if (prnMatch.hasSignedIn) {
        errors.push(
          `PRN belongs to ${personName(prnMatch)}, who has already signed in — change their email manually`,
        );
      } else {
        matched = prnMatch;
      }
    }

    if (errors.length > 0) {
      rows.push({
        line: record.line,
        status: "error",
        data,
        matchedUserId: matched?.id,
        changes: [],
        errors,
      });
      continue;
    }

    if (!matched) {
      rows.push({
        line: record.line,
        status: "create",
        data,
        changes: [],
        errors: [],
      });
      continue;
    }

    const changes: string[] = [];
    if (matched.name !== data.name) {
      changes.push(`name: ${matched.name ?? "—"} → ${data.name}`);
    }
    if (data.prn && matched.prn !== data.prn) {
      changes.push(`PRN: ${matched.prn ?? "—"} → ${data.prn}`);
    }
    if (matched.email !== data.email) {
      // A student whose address the college finally sent is the ordinary case
      // here, and "no address yet → theirs" is what that is; printing the
      // placeholder would read as one address being swapped for another.
      changes.push(
        `email: ${contactAddress(matched.email) ?? NO_ADDRESS} → ${data.email}`,
      );
    }
    if (!sameSet(data.roles, matched.roleKeys)) {
      changes.push(
        `roles: ${matched.roleKeys.join("+") || "—"} → ${data.roles.join("+")}`,
      );
    }
    const addedGroups = groups.filter((g) => !matched.groupNames.includes(g));
    if (addedGroups.length) changes.push(`groups: +${addedGroups.join(", ")}`);

    rows.push({
      line: record.line,
      status: changes.length ? "update" : "skip",
      data,
      matchedUserId: matched.id,
      changes,
      errors: [],
    });
  }

  const summary = { create: 0, update: 0, skip: 0, error: 0 };
  for (const row of rows) summary[row.status]++;

  return {
    rows,
    summary,
    newGroups: [...newGroups],
    unknownRoles: [...unknownRoles],
  };
}
