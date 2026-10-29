import { formatDayLabel, formatHourLabel } from "~/lib/dates";
import {
  PERMISSION_NAMES,
  PermissionBitField,
  PermissionFlags,
} from "~/lib/permissions";
import { Prisma } from "../../../../generated/prisma";
import type { Db } from "../occurrences";

/**
 * Every flag that, held on its own, lets somebody approve bookings.
 *
 * Worked out from the implication table rather than written down, so that
 * `Administrator` (which expands to everything) and any flag a later release
 * makes imply approval are included without anyone remembering to come back
 * here. Prisma cannot filter on bit operations, so the query below applies
 * this mask itself.
 */
const APPROVER_MASK = PERMISSION_NAMES.reduce((mask, name) => {
  const flag = PermissionFlags[name];
  return new PermissionBitField(flag).has(PermissionFlags.ApproveBookings)
    ? mask | flag
    : mask;
}, 0n);

/**
 * The people who can decide a booking or a change request: active, not a
 * machine identity, and holding the permission on their own account or through
 * any of their roles.
 *
 * One statement, because the alternative is loading every person and every role
 * in the college to answer a question about a handful of them.
 */
export async function approversOf(db: Db, orgId: string): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT u."id"
    FROM "User" u
    WHERE u."orgId" = ${orgId}
      AND u."isActive"
      AND NOT u."isServiceAccount"
      AND (
        (u."permissions" & ${APPROVER_MASK}::bigint) <> 0
        OR EXISTS (
          SELECT 1
          FROM "UserRole" ur
          JOIN "Role" r ON r."id" = ur."roleId"
          WHERE ur."userId" = u."id"
            AND (r."permissions" & ${APPROVER_MASK}::bigint) <> 0
        )
      )
  `);
  return rows.map((row) => row.id);
}

/** "Tue 4 Nov, 10am to 11am": when a booking or a class sits, in the org's own time. */
export function slotWords(start: Date, end: Date, timeZone: string): string {
  return `${formatDayLabel(start, timeZone)}, ${formatHourLabel(start, timeZone)} to ${formatHourLabel(end, timeZone)}`;
}

/** Puts a decision note after the sentence it belongs to, if there is one. */
export function withNote(text: string, note?: string | null): string {
  const trimmed = note?.trim();
  return trimmed ? `${text}. ${trimmed}` : text;
}
