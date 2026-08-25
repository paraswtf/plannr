import { describe, expect, it } from "vitest";

import {
  bearerFrom,
  hashSecret,
  mintKey,
  parseToken,
  servicePrincipalEmail,
  TOKEN_SCHEME,
  verifySecret,
} from "./secret";

/**
 * The credential itself.
 *
 * Nothing else in the API has this shape of consequence: every assertion below
 * is either "a real token works" or "a not-quite token does not", and the
 * second kind is the one worth having. A verifier that accepts a token from a
 * different mint, or that throws on a malformed header instead of refusing it,
 * is not a bug that shows up in ordinary use — it shows up when somebody is
 * looking for it.
 *
 * These are pure functions over `node:crypto`, so this is a unit test with no
 * database, no environment and no server behind it.
 */

const headers = (value?: string) =>
  new Headers(value === undefined ? {} : { authorization: value });

describe("mintKey", () => {
  it("issues a token that parses back into the halves it was built from", () => {
    const minted = mintKey();
    const parsed = parseToken(minted.token);

    expect(parsed).not.toBeNull();
    expect(parsed!.prefix).toBe(minted.prefix);
    expect(minted.token.startsWith(`${TOKEN_SCHEME}_${minted.prefix}.`)).toBe(
      true,
    );
    // The whole point of `last4`: a person with four keys can tell them apart
    // from a list that holds none of them.
    expect(parsed!.secret.endsWith(minted.last4)).toBe(true);
    expect(minted.last4).toHaveLength(4);
  });

  it("stores a digest and never the secret", () => {
    const minted = mintKey();
    const { secret } = parseToken(minted.token)!;

    expect(minted.hash).toBe(hashSecret(secret));
    expect(minted.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(minted.hash).not.toContain(secret);
    expect(minted.token).not.toContain(minted.hash);
  });

  it("mints a public handle that is greppable and useless on its own", () => {
    const minted = mintKey();
    expect(minted.prefix).toMatch(/^[0-9a-f]{8}$/);
    // The prefix identifies the row; it does not open it.
    expect(verifySecret(minted.prefix, minted.hash)).toBe(false);
  });

  /**
   * The prefix is `@unique` in the schema and is looked up before any hashing
   * happens, so a collision is not a curiosity — it is a mint that fails, or
   * worse, a lookup that finds the wrong key. Four bytes over the number of
   * keys an institution will ever hold makes that vanishingly unlikely, and
   * this is the assertion that says so out loud.
   */
  it("does not repeat itself", () => {
    const prefixes = new Set<string>();
    const tokens = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const minted = mintKey();
      prefixes.add(minted.prefix);
      tokens.add(minted.token);
    }
    expect(prefixes.size).toBe(500);
    expect(tokens.size).toBe(500);
  });
});

describe("verifySecret", () => {
  it("accepts the secret it was minted from", () => {
    const minted = mintKey();
    const { secret } = parseToken(minted.token)!;
    expect(verifySecret(secret, minted.hash)).toBe(true);
  });

  it("refuses a secret one character out", () => {
    const minted = mintKey();
    const { secret } = parseToken(minted.token)!;

    // Change the first character to something else in the base64url alphabet.
    const altered = (secret.startsWith("A") ? "B" : "A") + secret.slice(1);
    expect(altered).not.toBe(secret);
    expect(verifySecret(altered, minted.hash)).toBe(false);

    // And a digest one character out, which is the same question asked of the
    // stored side rather than the presented one.
    const bentHash =
      (minted.hash.startsWith("a") ? "b" : "a") + minted.hash.slice(1);
    expect(verifySecret(secret, bentHash)).toBe(false);
  });

  it("refuses a secret from a different key", () => {
    const mine = mintKey();
    const yours = mintKey();
    expect(verifySecret(parseToken(yours.token)!.secret, mine.hash)).toBe(
      false,
    );
    expect(verifySecret(parseToken(mine.token)!.secret, yours.hash)).toBe(
      false,
    );
  });

  /**
   * A stored hash is only ever written by `mintKey`, so a value that is not hex
   * means the column has been tampered with or a migration went wrong. Either
   * way the answer is "no", delivered quietly — a throw here would be an
   * unhandled 500 on a request that should have been a flat 401, and would tell
   * whoever caused it that they had found something.
   */
  it("survives a stored hash that is not a digest at all", () => {
    const { token } = mintKey();
    const { secret } = parseToken(token)!;

    for (const stored of [
      "",
      "not-hex-at-all",
      "zz".repeat(32),
      "abc", // odd length
      "0".repeat(63), // right alphabet, wrong length
      "0".repeat(128),
      "☃".repeat(64),
    ]) {
      expect(() => verifySecret(secret, stored)).not.toThrow();
      expect(verifySecret(secret, stored)).toBe(false);
    }
  });

  it("refuses an empty secret against a real hash", () => {
    const minted = mintKey();
    expect(verifySecret("", minted.hash)).toBe(false);
  });
});

describe("hashSecret", () => {
  it("is deterministic, and is SHA-256", () => {
    expect(hashSecret("hello")).toBe(hashSecret("hello"));
    expect(hashSecret("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(hashSecret("hello")).not.toBe(hashSecret("hellp"));
  });
});

describe("parseToken", () => {
  it("refuses anything not shaped like one of ours, rather than throwing", () => {
    const minted = mintKey();
    const { secret } = parseToken(minted.token)!;

    const malformed = [
      "",
      "   ",
      ".",
      "plk_live_",
      minted.prefix,
      secret,
      // No prefix/secret separator.
      `${TOKEN_SCHEME}_${minted.prefix}${secret}`,
      // Wrong scheme — a token from somebody else's product.
      `sk_live_${minted.prefix}.${secret}`,
      `${TOKEN_SCHEME.toUpperCase()}_${minted.prefix}.${secret}`,
      // Prefix the wrong length, and the wrong alphabet.
      `${TOKEN_SCHEME}_${minted.prefix.slice(1)}.${secret}`,
      `${TOKEN_SCHEME}_${minted.prefix}ab.${secret}`,
      `${TOKEN_SCHEME}_${minted.prefix.toUpperCase()}.${secret}`,
      // Secret too short to be 256 bits of anything.
      `${TOKEN_SCHEME}_${minted.prefix}.short`,
      // Characters base64url does not contain.
      `${TOKEN_SCHEME}_${minted.prefix}.${secret.slice(0, -1)}+`,
      // A second separator, which would make the split ambiguous.
      `${TOKEN_SCHEME}_${minted.prefix}.${secret}.${secret}`,
    ];

    for (const candidate of malformed) {
      expect(() => parseToken(candidate)).not.toThrow();
      expect(parseToken(candidate), `parsed "${candidate}"`).toBeNull();
    }
  });

  it("forgives surrounding whitespace, which a copy-paste always brings", () => {
    const minted = mintKey();
    expect(parseToken(`  ${minted.token}\n`)).toEqual(parseToken(minted.token));
  });
});

describe("bearerFrom", () => {
  it("reads the token out of an Authorization header", () => {
    expect(bearerFrom(headers("Bearer abc123"))).toBe("abc123");
  });

  /**
   * RFC 7235 says the scheme is case-insensitive, and clients take it at its
   * word — `requests`, `curl` and half the HTTP libraries in use will send
   * `bearer`. Refusing those would be correct by nobody's reading and would
   * cost somebody an afternoon.
   */
  it("does not care how the scheme is capitalised", () => {
    for (const scheme of ["Bearer", "bearer", "BEARER", "BeArEr"]) {
      expect(bearerFrom(headers(`${scheme} abc123`))).toBe("abc123");
    }
  });

  it("ignores a credential of another kind", () => {
    expect(bearerFrom(headers("Basic dXNlcjpwYXNz"))).toBeNull();
    expect(bearerFrom(headers("Token abc123"))).toBeNull();
    expect(bearerFrom(headers("abc123"))).toBeNull();
  });

  it("answers null when there is no header, and when there is nothing in it", () => {
    expect(bearerFrom(headers())).toBeNull();
    expect(bearerFrom(headers(""))).toBeNull();
    expect(bearerFrom(headers("Bearer"))).toBeNull();
    expect(bearerFrom(headers("Bearer    "))).toBeNull();
  });

  it("hands a whole minted token straight to parseToken", () => {
    const minted = mintKey();
    const presented = bearerFrom(headers(`Bearer ${minted.token}`));
    expect(presented).toBe(minted.token);
    expect(parseToken(presented!)!.prefix).toBe(minted.prefix);
  });
});

describe("servicePrincipalEmail", () => {
  it("is derived from the prefix, so it moves when the key is rolled", () => {
    const first = mintKey();
    const second = mintKey();

    expect(servicePrincipalEmail(first.prefix)).toContain(first.prefix);
    expect(servicePrincipalEmail(first.prefix)).not.toBe(
      servicePrincipalEmail(second.prefix),
    );
    expect(servicePrincipalEmail(first.prefix)).toBe(
      servicePrincipalEmail(first.prefix),
    );
  });

  /**
   * `.invalid` is reserved by RFC 2606 and resolves nowhere, which is the
   * point: nothing can be delivered to a principal, and the address cannot pass
   * the Workspace-domain check in the sign-in callback even if one of these
   * rows somehow acquired an OAuth account.
   */
  it("cannot receive mail and cannot sign in", () => {
    const address = servicePrincipalEmail("deadbeef");
    expect(address.endsWith(".invalid")).toBe(true);
    expect(address).toBe("svc-deadbeef@api.plannr.invalid");
    expect(address.endsWith("@sicsr.ac.in")).toBe(false);
  });
});
