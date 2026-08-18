import { beforeEach, describe, expect, it, vi } from "vitest";

// A fixed 32-byte key, so these tests do not depend on a .env being present.
const KEY = Buffer.alloc(32, 7).toString("base64");
const settings = { CALENDAR_TOKEN_KEY: KEY as string | undefined };

vi.mock("~/env", () => ({
  get env() {
    return settings;
  },
}));

const { open, seal, hasTokenKey } = await import("./crypto");

/**
 * Sealing the refresh tokens.
 *
 * These are not session cookies: a Google refresh token is a standing licence
 * to write to somebody's calendar that works for anyone holding it, from
 * anywhere, until it is revoked. The tests below are therefore about the two
 * properties that make it safe to keep one in a table — that it cannot be read,
 * and that a modified one fails loudly instead of being handed to Google.
 */
describe("sealed tokens", () => {
  beforeEach(() => {
    settings.CALENDAR_TOKEN_KEY = KEY;
  });

  it("comes back out as it went in", () => {
    const token = "1//0gT-a_very_long_looking_google_refresh_token";
    expect(open(seal(token))).toBe(token);
  });

  it("does not leave the plaintext lying about in the ciphertext", () => {
    expect(seal("swordfish")).not.toContain("swordfish");
  });

  it("gives a different ciphertext each time", () => {
    // A repeated nonce in GCM is catastrophic, and identical output for
    // identical input is the visible symptom of one.
    expect(seal("same")).not.toBe(seal("same"));
  });

  it("refuses a ciphertext that has been tampered with", () => {
    const sealed = seal("secret");
    const [version, iv, tag, body] = sealed.split(".") as [
      string,
      string,
      string,
      string,
    ];
    const flipped = Buffer.from(body, "base64url");
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    expect(() =>
      open([version, iv, tag, flipped.toString("base64url")].join(".")),
    ).toThrow();
  });

  it("refuses a ciphertext sealed with another key", () => {
    const sealed = seal("secret");
    settings.CALENDAR_TOKEN_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => open(sealed)).toThrow();
  });

  it("refuses a version it does not know", () => {
    const sealed = seal("secret").split(".");
    sealed[0] = "v2";
    expect(() => open(sealed.join("."))).toThrow(/version/i);
  });

  it("refuses anything that is not in the expected shape", () => {
    expect(() => open("not-a-sealed-token")).toThrow(/malformed/i);
  });

  describe("when the key is missing or wrong", () => {
    it("says which variable to set rather than failing obscurely", () => {
      settings.CALENDAR_TOKEN_KEY = undefined;
      expect(() => seal("x")).toThrow(/CALENDAR_TOKEN_KEY/);
      expect(hasTokenKey()).toBe(false);
    });

    it("rejects a key of the wrong length instead of padding it", () => {
      settings.CALENDAR_TOKEN_KEY = Buffer.alloc(16, 1).toString("base64");
      expect(() => seal("x")).toThrow(/32 bytes/);
      expect(hasTokenKey()).toBe(false);
    });
  });
});
