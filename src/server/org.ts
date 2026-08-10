import "server-only";

import { db } from "~/server/db";

/**
 * The single seam where "which organisation is this?" is answered.
 *
 * Plannr runs one institution today, so this resolves to the only row. When
 * tenants arrive, this is the function that starts reading the session instead
 * — every query already filters by the `orgId` it returns.
 */

export const DEFAULT_ORG_SLUG = "default";

let cachedOrgId: string | null = null;

/** The current organisation's id, creating the singleton row if needed. */
export async function getOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;

  const org = await db.organization.upsert({
    where: { slug: DEFAULT_ORG_SLUG },
    update: {},
    create: {
      slug: DEFAULT_ORG_SLUG,
      name: "Plannr",
      settings: { create: {} },
    },
    select: { id: true },
  });

  cachedOrgId = org.id;
  return org.id;
}

/** Settings for the current organisation, creating defaults if absent. */
export async function getOrgSettings() {
  const orgId = await getOrgId();
  return db.orgSettings.upsert({
    where: { orgId },
    update: {},
    create: { orgId },
  });
}

/** Only for tests, which swap databases between suites. */
export function resetOrgCache(): void {
  cachedOrgId = null;
}
