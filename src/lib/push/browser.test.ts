import { describe, expect, it } from "vitest";

import { keyToBytes } from "./browser";

describe("keyToBytes", () => {
  it("reads URL-safe base64 without padding", () => {
    // "hello?>" encodes to aGVsbG8_Pg in the URL-safe alphabet: a `_` where
    // standard base64 has `/`, and no `==` at the end.
    const bytes = keyToBytes("aGVsbG8_Pg");
    expect(String.fromCharCode(...bytes)).toBe("hello?>");
  });

  it("restores the padding a length of 2 or 3 mod 4 needs", () => {
    expect(String.fromCharCode(...keyToBytes("YQ"))).toBe("a");
    expect(String.fromCharCode(...keyToBytes("YWI"))).toBe("ab");
  });

  it("turns a real 65-byte VAPID public key into 65 bytes", () => {
    const key =
      "BEl62iUYgUivxIkv69yViEuiBIa-ib37J8xQmx1cSnNFA3LJJnzy9mmFOjNFU1ZSe3QIKB4VZS2rSIbVN-Mwf4k";
    expect(keyToBytes(key)).toHaveLength(65);
  });
});
