import { describe, expect, it } from "vitest";

import {
  ACCOUNT_STATUSES,
  accountStatus,
  accountStatusWhere,
  addressSearch,
  contactAddresses,
  contactAddress,
  personName,
  type AccountStatus,
} from "./people";

/**
 * A fifth of the students on the roll have no address, so these are the rules
 * every screen relies on: the placeholder is never an address, and never a way
 * of finding somebody.
 */
describe("contactAddress", () => {
  it("keeps an address anything could be sent to", () => {
    expect(contactAddress("pad2324026@sicsr.ac.in")).toBe(
      "pad2324026@sicsr.ac.in",
    );
  });

  it("reads the placeholder the student import writes as no address", () => {
    expect(contactAddress("23030125004@unknown.invalid")).toBeNull();
    expect(contactAddress("23030125004@UNKNOWN.INVALID")).toBeNull();
  });

  it("has nothing to show for a person with no address at all", () => {
    expect(contactAddress(null)).toBeNull();
    expect(contactAddress("  ")).toBeNull();
  });

  it("leaves the demo domain alone, reserved TLD and all", () => {
    // The seed parks demo people on plannr-demo.invalid so a demo row can never
    // be claimed by whoever owns the real address. They are not waiting on the
    // college for anything, and one of them is the admin.
    expect(contactAddress("the.lecturer@plannr-demo.invalid")).toBe(
      "the.lecturer@plannr-demo.invalid",
    );
  });
});

describe("personName", () => {
  it("calls somebody by their name", () => {
    expect(
      personName({ name: "Aanya Sharma", email: "aanya@sicsr.ac.in" }),
    ).toBe("Aanya Sharma");
  });

  it("falls back to an address, never to a placeholder", () => {
    expect(personName({ name: null, email: "aanya@sicsr.ac.in" })).toBe(
      "aanya@sicsr.ac.in",
    );
    expect(
      personName(
        { name: null, email: "23030125004@unknown.invalid" },
        "23030125004",
      ),
    ).toBe("23030125004");
  });
});

describe("addressSearch", () => {
  it("rules the placeholders out of what a search box can match", () => {
    // Otherwise "unknown" is a query that returns every student the college
    // owes an address — which is the one thing nobody was searching for.
    const where = addressSearch("unknown");
    expect(where.AND[0]).toEqual({
      email: { contains: "unknown", mode: "insensitive" },
    });
    expect(where.AND[1]).toEqual({
      NOT: { email: { endsWith: "@unknown.invalid", mode: "insensitive" } },
    });
  });
});

describe("contactAddresses", () => {
  it("drops from a paste the addresses nothing could be sent to", () => {
    expect(
      contactAddresses([
        "Aanya@sicsr.ac.in",
        "23030125004@unknown.invalid",
        "b@sicsr.ac.in",
      ]),
    ).toEqual(["aanya@sicsr.ac.in", "b@sicsr.ac.in"]);
  });
});

describe("accountStatus", () => {
  const REAL = "aanya@sicsr.ac.in";
  const PLACEHOLDER = "23030125004@unknown.invalid";

  it("gives every combination of switch, address and sign-in exactly one status", () => {
    const seen = new Map<string, AccountStatus>();
    for (const isActive of [true, false])
      for (const email of [REAL, PLACEHOLDER])
        for (const hasSignedIn of [true, false]) {
          const status = accountStatus({ isActive, email, hasSignedIn });
          expect(ACCOUNT_STATUSES).toContain(status);
          seen.set(`${isActive}/${email}/${hasSignedIn}`, status);
        }
    expect(seen.size).toBe(8);
    expect(new Set(seen.values())).toEqual(new Set(ACCOUNT_STATUSES));
  });

  it("calls somebody active only when the account is on and has been used", () => {
    expect(
      accountStatus({ isActive: true, email: REAL, hasSignedIn: true }),
    ).toBe("active");
    expect(
      accountStatus({ isActive: true, email: REAL, hasSignedIn: false }),
    ).toBe("never-signed-in");
    // Enabled with a placeholder cannot sign in, but nobody switched it off.
    expect(
      accountStatus({
        isActive: true,
        email: PLACEHOLDER,
        hasSignedIn: false,
      }),
    ).toBe("never-signed-in");
  });

  it("tells waiting on the college apart from disabled by somebody here", () => {
    expect(
      accountStatus({ isActive: false, email: REAL, hasSignedIn: true }),
    ).toBe("inactive");
    expect(
      accountStatus({
        isActive: false,
        email: PLACEHOLDER,
        hasSignedIn: false,
      }),
    ).toBe("waiting");
  });

  it("reads an address a screen was handed the same as the raw column", () => {
    // users.list hands the screen null where the placeholder was.
    expect(
      accountStatus({ isActive: false, email: null, hasSignedIn: false }),
    ).toBe("waiting");
  });
});

describe("accountStatusWhere", () => {
  it("filters by the same rule the row's badge is drawn by", () => {
    expect(accountStatusWhere("active")).toEqual({
      isActive: true,
      accounts: { some: {} },
    });
    expect(accountStatusWhere("never-signed-in")).toEqual({
      isActive: true,
      accounts: { none: {} },
    });
    expect(accountStatusWhere("inactive")).toEqual({
      isActive: false,
      NOT: { email: { endsWith: "@unknown.invalid", mode: "insensitive" } },
    });
    expect(accountStatusWhere("waiting")).toEqual({
      isActive: false,
      email: { endsWith: "@unknown.invalid", mode: "insensitive" },
    });
    expect(accountStatusWhere("all")).toEqual({});
  });

  it("matches each of the eight kinds of person under one status only", () => {
    // A small reading of the filters against a person, enough to show that
    // no two statuses claim the same row and that none is left out.
    type Person = { isActive: boolean; email: string; hasSignedIn: boolean };
    const matches = (status: AccountStatus, p: Person) => {
      const where = accountStatusWhere(status) as {
        isActive?: boolean;
        accounts?: { some?: object; none?: object };
        email?: { endsWith: string };
        NOT?: { email: { endsWith: string } };
      };
      const ends = (suffix: string) => p.email.toLowerCase().endsWith(suffix);
      if (where.isActive !== undefined && where.isActive !== p.isActive)
        return false;
      if (where.accounts?.some && !p.hasSignedIn) return false;
      if (where.accounts?.none && p.hasSignedIn) return false;
      if (where.email && !ends(where.email.endsWith)) return false;
      if (where.NOT && ends(where.NOT.email.endsWith)) return false;
      return true;
    };

    for (const isActive of [true, false])
      for (const email of ["a@sicsr.ac.in", "1@UNKNOWN.INVALID"])
        for (const hasSignedIn of [true, false]) {
          const person = { isActive, email, hasSignedIn };
          const claimed = ACCOUNT_STATUSES.filter((s) => matches(s, person));
          expect(claimed).toEqual([accountStatus(person)]);
        }
  });
});
