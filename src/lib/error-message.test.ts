import { describe, expect, it } from "vitest";

import { errorMessage } from "./error-message";

describe("errorMessage", () => {
  it("shows the server's own sentence as it is", () => {
    expect(
      errorMessage({ message: "Wrong password. 3 tries left.", data: {} }),
    ).toBe("Wrong password. 3 tries left.");
  });

  it("turns refused input into the checks' messages, not JSON", () => {
    const error = {
      message:
        '[{"code":"too_big","maximum":160,"path":["title"],"message":"Too long"}]',
      data: {
        zodError: {
          formErrors: [],
          fieldErrors: {
            title: ["String must contain at most 160 character(s)"],
            topic: ["String must contain at most 200 character(s)"],
          },
        },
      },
    };
    expect(errorMessage(error)).toBe(
      "String must contain at most 160 character(s) String must contain at most 200 character(s)",
    );
  });

  it("never shows a report that arrived unflattened", () => {
    expect(errorMessage({ message: '[{"code":"custom"}]' }, "Try again.")).toBe(
      "Try again.",
    );
    expect(errorMessage({ message: '{"a":1}' }, "Try again.")).toBe(
      "Try again.",
    );
  });

  it("falls back for anything that is not an error", () => {
    expect(errorMessage(null, "Try again.")).toBe("Try again.");
    expect(errorMessage("oops", "Try again.")).toBe("Try again.");
    expect(errorMessage({ message: "  " }, "Try again.")).toBe("Try again.");
  });
});
