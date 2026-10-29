/**
 * Writing a person down for somebody to read.
 *
 * Not everybody has an address. The college sends its student lists as printed
 * PDFs and spreadsheets, and 133 of 644 students arrive on them with no address
 * at all. They are enrolled all the same — sitting in rooms, belonging to
 * groups, counting towards a register — so the import gives them a placeholder
 * at a domain that can never resolve, and no way in until a real one arrives.
 *
 * That placeholder records the state of the college's paperwork, not a fact
 * about the person, so it must never reach a screen. Everything that shows,
 * searches or would write to an address goes through here first.
 */

/**
 * The domain the student import parks an unknown address at.
 *
 * Matched in full rather than by its `.invalid` TLD, even though RFC 2606 makes
 * the whole TLD unresolvable. The demo seed and the integration fixtures sit at
 * `plannr-demo.invalid` on purpose — reserved so a demo row can never be
 * claimed by whoever really owns that address — and those people, the seeded
 * admin and every seeded lecturer among them, do have addresses: it is what
 * sign-in links their account by. Reading the TLD alone told all of them the
 * college owed them an address, and hid them from the people search.
 *
 * Kept in step with NO_ADDRESS_DOMAIN in prisma/import-students.ts, which is
 * deliberately not imported: prisma/ holds scripts run by hand against a
 * database, and nothing served to a browser should pull that graph in.
 */
const NO_ADDRESS_DOMAIN = "@unknown.invalid";

/** What a screen says in place of an address nobody has sent yet. */
export const NO_ADDRESS = "No address yet";

/** The address somebody can actually be reached at, or null when there is none. */
export function contactAddress(
  email: string | null | undefined,
): string | null {
  const address = email?.trim() ?? "";
  if (!address || address.toLowerCase().endsWith(NO_ADDRESS_DOMAIN))
    return null;
  return address;
}

/**
 * What to call somebody on one line.
 *
 * The address is the fallback because a person imported without a name is still
 * recognisable by it; with no address either, say so rather than print the
 * placeholder, which reads as an address and is not one.
 */
export function personName(
  person: { name?: string | null; email?: string | null } | null | undefined,
  fallback = "Unnamed",
): string {
  const name = person?.name?.trim();
  if (name) return name;
  return contactAddress(person?.email) ?? fallback;
}

/**
 * A Prisma filter for searching people by address.
 *
 * The placeholders are ruled out inside the query rather than dropped from the
 * results afterwards, so a page count is right: they share a domain, and typing
 * "unknown" would otherwise return every student the college owes an address.
 */
export const addressSearch = (query: string) => ({
  AND: [
    { email: { contains: query, mode: "insensitive" as const } },
    {
      NOT: {
        email: { endsWith: NO_ADDRESS_DOMAIN, mode: "insensitive" as const },
      },
    },
  ],
});

/** Addresses out of a paste, minus anything nothing could be sent to. */
export const contactAddresses = (values: string[]): string[] =>
  values
    .map((value) => contactAddress(value))
    .filter((value): value is string => value !== null)
    .map((value) => value.toLowerCase());

/**
 * Where somebody's account stands, as the directory names it.
 *
 * One definition shared by the badge on a row and the filter above the list,
 * so that picking "Active" can only ever return rows that say Active. The four
 * cover everybody exactly once: an account that is switched on has either
 * been signed in to or not, and one that is switched off is either waiting on
 * the college for an address or has been disabled by somebody here.
 */
export const ACCOUNT_STATUSES = [
  "active",
  "never-signed-in",
  "inactive",
  "waiting",
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/**
 * A person's account status. `email` may be the raw column or the address a
 * screen was already handed, with the placeholder turned to null:
 * `contactAddress` reads both the same.
 */
export function accountStatus(person: {
  isActive: boolean;
  email: string | null | undefined;
  hasSignedIn: boolean;
}): AccountStatus {
  if (!person.isActive)
    return contactAddress(person.email) === null ? "waiting" : "inactive";
  return person.hasSignedIn ? "active" : "never-signed-in";
}

/**
 * The Prisma filter for one account status, the same rule as `accountStatus`.
 *
 * "Waiting" is read from the placeholder domain because that is all the
 * database holds about it. A blank address, which `contactAddress` also reads
 * as none, is never written: every path that creates a person requires one.
 */
export function accountStatusWhere(status: AccountStatus | "all") {
  switch (status) {
    case "active":
      return { isActive: true, accounts: { some: {} } };
    case "never-signed-in":
      return { isActive: true, accounts: { none: {} } };
    case "inactive":
      return {
        isActive: false,
        NOT: {
          email: { endsWith: NO_ADDRESS_DOMAIN, mode: "insensitive" as const },
        },
      };
    case "waiting":
      return {
        isActive: false,
        email: { endsWith: NO_ADDRESS_DOMAIN, mode: "insensitive" as const },
      };
    case "all":
      return {};
  }
}
