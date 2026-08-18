import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({
  env: { AUTH_SECRET: "a-test-secret-at-least-32-characters-long" },
}));

const { decodeState, encodeState } = await import("./oauth");

/**
 * The signed `state` on the consent round trip.
 *
 * This is the only thing standing between the callback and somebody else's
 * account: Google will happily deliver a valid authorisation code to whoever
 * follows the link, so what stops a connection being bound to the wrong person
 * is that the state names them and cannot be rewritten.
 */
describe("the consent state", () => {
  const USER = "cku00000000000000000000";

  it("names the user it was issued for", () => {
    expect(decodeState(encodeState(USER))).toBe(USER);
  });

  it("refuses a state with the user swapped out", () => {
    // The attack this exists for: take your own consent link, point it at
    // somebody else's id, and have their calendar attached to your account.
    const state = encodeState(USER);
    const [, issuedAt, signature] = state.split(".") as [string, string, string];
    expect(decodeState(`victim.${issuedAt}.${signature}`)).toBeNull();
  });

  it("refuses a state with the signature stripped", () => {
    expect(decodeState(`${USER}.${Date.now()}.`)).toBeNull();
    expect(decodeState(`${USER}.${Date.now()}`)).toBeNull();
  });

  it("refuses a forged signature", () => {
    expect(decodeState(`${USER}.${Date.now()}.deadbeef`)).toBeNull();
  });

  it("lets a link go stale", () => {
    const issued = Date.now() - 11 * 60_000;
    expect(decodeState(encodeState(USER, issued))).toBeNull();
  });

  it("accepts one that is merely old, not stale", () => {
    const issued = Date.now() - 9 * 60_000;
    expect(decodeState(encodeState(USER, issued))).toBe(USER);
  });

  it("refuses one issued in the future", () => {
    // Belt and braces: a clock that jumps backwards must not extend a link's
    // life rather than shorten it.
    const issued = Date.now() + 5 * 60_000;
    expect(decodeState(encodeState(USER, issued))).toBeNull();
  });

  it("refuses rubbish", () => {
    expect(decodeState("")).toBeNull();
    expect(decodeState("....")).toBeNull();
  });
});
