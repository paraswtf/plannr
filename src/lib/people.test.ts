import { describe, expect, it } from "vitest";

import {
  addressSearch,
  contactAddresses,
  contactAddress,
  personName,
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
