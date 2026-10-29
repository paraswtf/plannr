import { existsSync, readFileSync } from "node:fs";

import { afterAll, describe, expect, it } from "vitest";

import {
  MAX_WAITING_JOBS,
  runTypesetJob,
  stopTypesetter,
  TypesetBusyError,
  TypesetCancelledError,
  TypesetTimeoutError,
  typesetterPid,
  type TypesetJob,
} from "./typesetter";

/**
 * The process typst runs in.
 *
 * The point of a separate process is that a paper which will not finish can
 * be stopped for certain. A worker thread could not do that: its native
 * compile kept a core busy after `terminate()`. These tests stop a compile
 * that would run for minutes and check the process is really gone.
 */

afterAll(() => stopTypesetter());

/** "gone", or the one-letter state the kernel reports for a process. */
function processState(pid: number): string {
  const path = `/proc/${pid}/stat`;
  if (!existsSync(path)) return "gone";
  try {
    return readFileSync(path, "utf8").split(") ")[1]!.split(" ")[0]!;
  } catch {
    return "gone";
  }
}

/** A loop no paper could contain, standing in for one that never finishes. */
const ENDLESS = `#let n = 0\n#for i in range(1000000000) { n = n + 1 }\n#n`;

describe("the typesetter process", () => {
  it("kills a compile that runs past its time, and starts afresh next time", async () => {
    const started = Date.now();
    const endless = runTypesetJob(
      { kind: "probe", mains: [ENDLESS], files: {} },
      { timeoutMs: 1500 },
    );
    // Let it get going, then note which process is doing the work.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const pid = typesetterPid();
    expect(pid).not.toBeNull();

    await expect(endless).rejects.toBeInstanceOf(TypesetTimeoutError);
    expect(Date.now() - started).toBeLessThan(5000);
    // SIGKILL cannot be ignored. The process is either gone or a zombie
    // waiting to be reaped, which runs nothing; both mean the CPU is free.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(["gone", "Z"]).toContain(processState(pid!));

    const next = await runTypesetJob({
      kind: "probe",
      mains: ["Hello"],
      files: {},
    });
    expect(next).toEqual({ ok: true, failed: null, error: null });
    expect(typesetterPid()).not.toBe(pid);
  }, 20_000);

  it("runs jobs one after another, each with its own answer", async () => {
    const replies = await Promise.all(
      ["One", '#panic("two")', "Three"].map((main) =>
        runTypesetJob({ kind: "probe", mains: [main], files: {} }),
      ),
    );
    expect(replies[0]).toEqual({ ok: true, failed: null, error: null });
    expect(replies[1]).toMatchObject({ ok: true, failed: 0 });
    expect(replies[2]).toEqual({ ok: true, failed: null, error: null });
  }, 20_000);

  it("keeps no file from one job for the next", async () => {
    const files = { "/data.json": new Uint8Array(Buffer.from("{}")) };
    await runTypesetJob({
      kind: "probe",
      mains: ['#json("/data.json")'],
      files,
    });
    const later = await runTypesetJob({
      kind: "probe",
      mains: ['#json("/data.json")'],
      files: {},
    });
    expect(later).toMatchObject({ ok: true, failed: 0 });
  }, 20_000);

  it("sees no real file on the machine", async () => {
    const reply = await runTypesetJob({
      kind: "probe",
      mains: ['#read("/etc/hostname")', '#read("../../../etc/hostname")'],
      files: {},
    });
    expect(reply).toMatchObject({ ok: true, failed: 0 });
  }, 20_000);

  it("is given none of the server's environment", async () => {
    // The process runs a compiler over text teachers typed, so it is started
    // with nothing but what it needs to find the compiler: no database URL,
    // no server keys.
    await runTypesetJob({ kind: "probe", mains: ["Hello"], files: {} });
    const pid = typesetterPid();
    expect(pid).not.toBeNull();
    const keys = readFileSync(`/proc/${pid}/environ`, "utf8")
      .split("\0")
      .filter((entry) => entry.length > 0)
      .map((entry) => entry.slice(0, entry.indexOf("=")));
    // Node adds the two NODE_CHANNEL_ variables itself, for the IPC channel.
    const allowed = [
      "NODE_ENV",
      "NODE_PATH",
      "NODE_CHANNEL_FD",
      "NODE_CHANNEL_SERIALIZATION_MODE",
    ];
    for (const key of keys) expect(allowed).toContain(key);
    expect(keys).not.toContain("DATABASE_URL");
    expect(keys).not.toContain("QUESTION_PAPER_KEY");
    expect(keys).not.toContain("AUTH_SECRET");
  }, 20_000);
});

describe("the queue in front of it", () => {
  const hello = (): TypesetJob => ({
    kind: "probe",
    mains: ["Hello"],
    files: {},
  });
  /** Keeps the typesetter busy for a while, so later jobs have to wait. */
  const busy = (ms: number) =>
    runTypesetJob(
      { kind: "probe", mains: [ENDLESS], files: {} },
      { timeoutMs: ms },
    ).catch((error: unknown) => error);

  it("drops a job whose caller gave up while it waited, before it runs", async () => {
    const started = Date.now();
    const blocker = busy(2000);
    const caller = new AbortController();
    const waiting = runTypesetJob(hello(), { signal: caller.signal });
    setTimeout(() => caller.abort(), 100);
    await expect(waiting).rejects.toBeInstanceOf(TypesetCancelledError);
    // Answered as soon as the caller left, not after the job ahead finished.
    expect(Date.now() - started).toBeLessThan(1500);
    expect(await blocker).toBeInstanceOf(TypesetTimeoutError);

    // A caller already gone is never queued at all.
    await expect(
      runTypesetJob(hello(), { signal: AbortSignal.abort() }),
    ).rejects.toBeInstanceOf(TypesetCancelledError);
    // And the jobs after it still run.
    expect(await runTypesetJob(hello())).toEqual({
      ok: true,
      failed: null,
      error: null,
    });
  }, 20_000);

  it("turns a job away when too many are waiting, or it waited too long", async () => {
    const blocker = busy(2000);
    const queued = Array.from({ length: MAX_WAITING_JOBS }, () =>
      runTypesetJob(hello()),
    );
    await expect(runTypesetJob(hello())).rejects.toBeInstanceOf(
      TypesetBusyError,
    );
    for (const reply of await Promise.all(queued)) {
      expect(reply).toEqual({ ok: true, failed: null, error: null });
    }
    expect(await blocker).toBeInstanceOf(TypesetTimeoutError);

    const second = busy(2000);
    await expect(
      runTypesetJob(hello(), { maxWaitMs: 200 }),
    ).rejects.toBeInstanceOf(TypesetBusyError);
    expect(await second).toBeInstanceOf(TypesetTimeoutError);
  }, 30_000);
});
