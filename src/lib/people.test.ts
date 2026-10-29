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
  const now = new Date("2026-10-29T09:00:00Z");
  const DAY = 24 * 60 * 60 * 1000;
  const yesterday = new Date(now.getTime() - DAY);
  const lastMonth = new Date(now.getTime() - 30 * DAY);

  it("gives every kind of person exactly one status, and uses them all", () => {
    const seen = new Set<AccountStatus>();
    for (const isActive of [true, false])
      for (const email of [REAL, PLACEHOLDER])
        for (const hasSignedIn of [true, false])
          for (const lastSeenAt of [null, yesterday, lastMonth]) {
            const status = accountStatus(
              { isActive, email, hasSignedIn, lastSeenAt },
              now,
            );
            expect(ACCOUNT_STATUSES).toContain(status);
            seen.add(status);
          }
    expect(seen).toEqual(new Set(ACCOUNT_STATUSES));
  });

  it("calls somebody active only when they used Plannr in the last week", () => {
    const signedIn = { isActive: true, email: REAL, hasSignedIn: true };
    expect(accountStatus({ ...signedIn, lastSeenAt: yesterday }, now)).toBe(
      "active",
    );
    expect(
      accountStatus(
        { ...signedIn, lastSeenAt: new Date(now.getTime() - 7 * DAY) },
        now,
      ),
    ).toBe("active");
    expect(accountStatus({ ...signedIn, lastSeenAt: lastMonth }, now)).toBe(
      "not-seen-lately",
    );
    // Signed in, but no visit recorded since the column began being kept.
    expect(accountStatus({ ...signedIn, lastSeenAt: null }, now)).toBe(
      "not-seen-lately",
    );
  });

  it("calls somebody who never signed in that, whatever else is true", () => {
    expect(
      accountStatus(
        { isActive: true, email: REAL, hasSignedIn: false, lastSeenAt: null },
        now,
      ),
    ).toBe("never-signed-in");
    // Enabled with a placeholder cannot sign in, but nobody switched it off.
    expect(
      accountStatus(
        {
          isActive: true,
          email: PLACEHOLDER,
          hasSignedIn: false,
          lastSeenAt: null,
        },
        now,
      ),
    ).toBe("never-signed-in");
  });

  it("tells waiting on the college apart from disabled by somebody here", () => {
    expect(
      accountStatus(
        {
          isActive: false,
          email: REAL,
          hasSignedIn: true,
          lastSeenAt: yesterday,
        },
        now,
      ),
    ).toBe("inactive");
    expect(
      accountStatus(
        {
          isActive: false,
          email: PLACEHOLDER,
          hasSignedIn: false,
          lastSeenAt: null,
        },
        now,
      ),
    ).toBe("waiting");
  });

  it("reads an address a screen was handed the same as the raw column", () => {
    // users.list hands the screen null where the placeholder was.
    expect(
      accountStatus(
        { isActive: false, email: null, hasSignedIn: false, lastSeenAt: null },
        now,
      ),
    ).toBe("waiting");
  });
});

describe("accountStatusWhere", () => {
  const now = new Date("2026-10-29T09:00:00Z");
  const since = new Date("2026-10-22T09:00:00Z");

  it("filters by the same rule the row's badge is drawn by", () => {
    expect(accountStatusWhere("active", now)).toEqual({
      isActive: true,
      accounts: { some: {} },
      lastSeenAt: { gte: since },
    });
    expect(accountStatusWhere("not-seen-lately", now)).toEqual({
      isActive: true,
      accounts: { some: {} },
      AND: [{ OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: since } }] }],
    });
    expect(accountStatusWhere("never-signed-in", now)).toEqual({
      isActive: true,
      accounts: { none: {} },
    });
    expect(accountStatusWhere("inactive", now)).toEqual({
      isActive: false,
      NOT: { email: { endsWith: "@unknown.invalid", mode: "insensitive" } },
    });
    expect(accountStatusWhere("waiting", now)).toEqual({
      isActive: false,
      email: { endsWith: "@unknown.invalid", mode: "insensitive" },
    });
    expect(accountStatusWhere("all", now)).toEqual({});
  });

  it("matches each kind of person under one status only", () => {
    // A small reading of the filters against a person, enough to show that
    // no two statuses claim the same row and that none is left out.
    type Person = {
      isActive: boolean;
      email: string;
      hasSignedIn: boolean;
      lastSeenAt: Date | null;
    };
    type Seen = { lastSeenAt?: null | { gte?: Date; lt?: Date } };
    const seenMatches = (clause: Seen, p: Person) => {
      if (!("lastSeenAt" in clause)) return true;
      const c = clause.lastSeenAt;
      if (c === null) return p.lastSeenAt === null;
      if (!p.lastSeenAt) return false;
      if (c?.gte && p.lastSeenAt < c.gte) return false;
      if (c?.lt && !(p.lastSeenAt < c.lt)) return false;
      return true;
    };
    const matches = (status: AccountStatus, p: Person) => {
      const where = accountStatusWhere(status, now) as {
        isActive?: boolean;
        accounts?: { some?: object; none?: object };
        email?: { endsWith: string };
        NOT?: { email: { endsWith: string } };
        lastSeenAt?: { gte: Date };
        AND?: Array<{ OR: Seen[] }>;
      };
      const ends = (suffix: string) => p.email.toLowerCase().endsWith(suffix);
      if (where.isActive !== undefined && where.isActive !== p.isActive)
        return false;
      if (where.accounts?.some && !p.hasSignedIn) return false;
      if (where.accounts?.none && p.hasSignedIn) return false;
      if (where.email && !ends(where.email.endsWith)) return false;
      if (where.NOT && ends(where.NOT.email.endsWith)) return false;
      if (where.lastSeenAt && !seenMatches({ lastSeenAt: where.lastSeenAt }, p))
        return false;
      if (
        where.AND &&
        !where.AND.every((a) => a.OR.some((o) => seenMatches(o, p)))
      )
        return false;
      return true;
    };

    for (const isActive of [true, false])
      for (const email of ["a@sicsr.ac.in", "1@UNKNOWN.INVALID"])
        for (const hasSignedIn of [true, false])
          for (const lastSeenAt of [
            null,
            new Date("2026-10-28T09:00:00Z"),
            new Date("2026-09-01T09:00:00Z"),
          ]) {
            const person = { isActive, email, hasSignedIn, lastSeenAt };
            const claimed = ACCOUNT_STATUSES.filter((s) => matches(s, person));
            expect(claimed).toEqual([accountStatus(person, now)]);
          }
  });
});
