import { describe, expect, it } from "vitest";

import { CLOSE_GRACE_MS, SUBMIT_GRACE_MS } from "~/lib/assignments";
import { studentStatus } from "./status";

const closesAt = new Date("2026-11-04T05:30:00.000Z");
const window = {
  opensAt: new Date("2026-11-04T04:30:00.000Z"),
  closesAt,
  closedByTeacher: false,
};
const at = (ms: number) => new Date(closesAt.getTime() + ms);

describe("studentStatus", () => {
  it("says not started with no answer, and submitted once handed in", () => {
    expect(studentStatus(undefined, window, at(0))).toBe("not started");
    expect(studentStatus(null, null, at(0))).toBe("not started");
    expect(studentStatus("SUBMITTED", window, at(10 * SUBMIT_GRACE_MS))).toBe(
      "submitted",
    );
  });

  it("keeps an answer begun in progress until the window and its grace are over", () => {
    expect(studentStatus("IN_PROGRESS", window, at(-60_000))).toBe(
      "in progress",
    );
    expect(studentStatus("IN_PROGRESS", window, at(SUBMIT_GRACE_MS))).toBe(
      "in progress",
    );
    expect(studentStatus("IN_PROGRESS", window, at(SUBMIT_GRACE_MS + 1))).toBe(
      "handed in at the close",
    );
  });

  it("hands in an answer sooner when the teacher closed the paper early", () => {
    const closed = { ...window, closedByTeacher: true };
    expect(studentStatus("IN_PROGRESS", closed, at(CLOSE_GRACE_MS))).toBe(
      "in progress",
    );
    expect(studentStatus("IN_PROGRESS", closed, at(CLOSE_GRACE_MS + 1))).toBe(
      "handed in at the close",
    );
  });

  it("leaves an answer in progress while there is no window to close", () => {
    expect(studentStatus("IN_PROGRESS", null, at(SUBMIT_GRACE_MS * 100))).toBe(
      "in progress",
    );
  });
});
