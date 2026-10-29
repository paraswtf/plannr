import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

/**
 * The process typst runs in.
 *
 * Typesetting runs in a child Node process, one per server process, kept warm
 * between papers and killed with SIGKILL when a job overruns. Not a worker
 * thread: the compile is one long native call, and `Worker.terminate()` only
 * stops JavaScript. Measured with typst-ts-node-compiler 0.7.0 on Node 20, a
 * worker kept burning a whole core after `terminate()`, the promise it returned
 * never settled, and the parent could not even exit. A process can always be
 * killed, and its memory goes with it.
 *
 * The child is started from source text with `node -e`, so the bundler never
 * has to find a worker file. It requires the compiler by name, which is why
 * next.config.js lists the package for the file tracer.
 *
 * It is given no environment beyond where to find node_modules. It runs a
 * compiler over text that teachers typed, and the parent's environment holds
 * the database URL and every server key.
 */

/** The virtual directory typst sees as its root. Nothing on disk is under it. */
export const TYPST_ROOT = "/__plannr_paper__";

const CHILD_SOURCE = `
"use strict";
const { NodeCompiler } = require("@myriaddreamin/typst-ts-node-compiler");
const ROOT = ${JSON.stringify(TYPST_ROOT)};
let compiler = null;
function messageOf(err) {
  try {
    const list = err.shortDiagnostics || [];
    const text = list.map((d) => String(d && d.message ? d.message : "")).filter(Boolean);
    return text.slice(0, 3).join("; ") || "unknown error";
  } catch (_) {
    return "unknown error";
  }
}
function compileOnce(c, main) {
  const result = c.compile({ mainFileContent: main });
  const err = result.takeError();
  if (err) return { error: messageOf(err) };
  return { doc: result.result };
}
function handle(job) {
  if (!compiler) compiler = NodeCompiler.create({ workspace: ROOT });
  const c = compiler;
  c.resetShadow();
  try {
    for (const name of Object.keys(job.files)) {
      c.mapShadow(ROOT + name, Buffer.from(job.files[name]));
    }
    if (job.kind === "pdf") {
      const r = compileOnce(c, job.main);
      if (r.error) return { ok: false, error: r.error };
      const pdf = c.pdf(r.doc, { creationTimestamp: job.timestamp });
      return { ok: true, pdf: new Uint8Array(pdf), pages: r.doc.numOfPages };
    }
    if (job.kind === "svg") {
      const r = compileOnce(c, job.main);
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, svg: c.plainSvg(r.doc) };
    }
    if (job.kind === "probe") {
      for (let i = 0; i < job.mains.length; i++) {
        const r = compileOnce(c, job.mains[i]);
        if (r.error) return { ok: true, failed: i, error: r.error };
      }
      return { ok: true, failed: null, error: null };
    }
    return { ok: false, error: "unknown job" };
  } finally {
    // Nothing from one paper stays mapped while the next one compiles.
    c.resetShadow();
    c.evictCache(10);
  }
}
process.on("message", (message) => {
  let reply;
  try {
    reply = handle(message.job);
  } catch (_) {
    reply = { ok: false, error: "the typesetter failed" };
  }
  process.send({ id: message.id, reply });
});
`;

export type TypesetJob =
  | {
      kind: "pdf";
      main: string;
      files: Record<string, Uint8Array>;
      /** Seconds since 1970; fixed so the same paper gives the same bytes. */
      timestamp: number;
    }
  | { kind: "svg"; main: string; files: Record<string, Uint8Array> }
  /** Compiles each source in turn and says which, if any, fails first. */
  | { kind: "probe"; mains: string[]; files: Record<string, Uint8Array> };

export type TypesetReply =
  | { ok: false; error: string }
  | { ok: true; pdf: Uint8Array; pages: number }
  | { ok: true; svg: string }
  | { ok: true; failed: number | null; error: string | null };

/** The job ran past its time and the typesetter was killed. */
export class TypesetTimeoutError extends Error {
  constructor() {
    super("The typesetter ran out of time.");
    this.name = "TypesetTimeoutError";
  }
}

/** The typesetter died, or could not be started. */
export class TypesetCrashError extends Error {
  constructor(detail: string) {
    super(`The typesetter stopped unexpectedly (${detail}).`);
    this.name = "TypesetCrashError";
  }
}

/** The job's caller gave up on it before it started, so it never ran. */
export class TypesetCancelledError extends Error {
  constructor() {
    super("The typesetting was given up before it started.");
    this.name = "TypesetCancelledError";
  }
}

/** Too many jobs were already waiting, so this one was not queued. */
export class TypesetBusyError extends Error {
  constructor() {
    super("The typesetter has too many papers waiting.");
    this.name = "TypesetBusyError";
  }
}

export const TYPESET_TIMEOUT_MS = 10_000;

/**
 * How long a job may wait for the jobs ahead of it before it is given up as
 * busy. Requests that typeset are allowed 60 seconds; one that has spent 40 of
 * them waiting would be stopped by the platform before it finished, with a
 * message that says nothing, so it is better told now to try again.
 */
export const MAX_WAIT_MS = 40_000;

/**
 * The most jobs that may wait behind the one running. Each request waits on
 * one job at a time (a released paper's pages go in one after another), so
 * this is how many people can be typesetting at once on one server. The wait
 * limit already drops jobs that waited too long; this keeps a burst from
 * piling papers up in memory meanwhile.
 */
export const MAX_WAITING_JOBS = 16;

interface Pending {
  id: number;
  job: TypesetJob;
  timeoutMs: number;
  resolve: (reply: TypesetReply) => void;
  reject: (error: Error) => void;
  /** Stops listening for the caller giving up, once the job has started. */
  release: () => void;
}

/**
 * A dev server re-evaluates this module on every edit, which would leave the
 * previous evaluation's warm child running, idle and unref'd, with nothing left
 * to stop it. Its handle is kept on `globalThis` so that a new evaluation can.
 */
const leftOver = globalThis as unknown as {
  plannrTypesetter?: ChildProcess | null;
};
leftOver.plannrTypesetter?.kill("SIGKILL");
leftOver.plannrTypesetter = null;

let child: ChildProcess | null = null;
let current: Pending | null = null;
let timer: NodeJS.Timeout | null = null;
const queue: Pending[] = [];
let nextId = 1;

/** Lets the server, and a test run, exit while the typesetter is idle. */
function setHeld(proc: ChildProcess, held: boolean) {
  const channel = proc.channel as
    { ref?: () => void; unref?: () => void } | null | undefined;
  if (held) {
    proc.ref();
    channel?.ref?.();
  } else {
    proc.unref();
    channel?.unref?.();
  }
}

function start(): ChildProcess {
  const proc = spawn(
    process.execPath,
    ["--input-type=commonjs", "-e", CHILD_SOURCE],
    {
      cwd: process.cwd(),
      env: {
        NODE_ENV: process.env.NODE_ENV,
        NODE_PATH: path.join(process.cwd(), "node_modules"),
      },
      // stderr is dropped: a panic message could quote the paper being set.
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      serialization: "advanced",
    },
  );

  proc.on("message", (message: { id: number; reply: TypesetReply }) => {
    if (proc !== child || message.id !== current?.id) return;
    const done = current;
    finish();
    done.resolve(message.reply);
  });
  const died = (detail: string) => {
    if (proc !== child) return;
    child = null;
    const lost = current;
    finish();
    lost?.reject(new TypesetCrashError(detail));
  };
  proc.on("exit", (code, signal) =>
    died(signal ? `signal ${signal}` : `exit code ${code}`),
  );
  proc.on("error", (error) => died(error.message));
  leftOver.plannrTypesetter = proc;
  return proc;
}

function finish() {
  if (timer) clearTimeout(timer);
  timer = null;
  current = null;
  if (child) setHeld(child, false);
  setImmediate(pump);
}

function pump() {
  if (current || queue.length === 0) return;
  const next = queue.shift()!;
  next.release();
  current = next;
  child ??= start();
  const proc = child;
  setHeld(proc, true);
  // The clock starts when the job starts, not when it joined the queue, so a
  // paper waiting behind somebody else's is not charged for their time.
  timer = setTimeout(() => {
    if (current !== next) return;
    child = null;
    proc.kill("SIGKILL");
    finish();
    next.reject(new TypesetTimeoutError());
  }, next.timeoutMs);
  proc.send({ id: next.id, job: next.job }, (error) => {
    if (error && current === next) {
      child = null;
      proc.kill("SIGKILL");
      finish();
      next.reject(new TypesetCrashError(error.message));
    }
  });
}

/**
 * Runs one job in the typesetter, after any already waiting.
 *
 * `signal` is the request's: when its caller goes away (a closed tab, a
 * request the platform stopped, a deadline), a job still waiting is dropped
 * rather than run for nobody. A job already running is left to finish, which
 * its own time limit bounds.
 */
export function runTypesetJob(
  job: TypesetJob,
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
    maxWaitMs?: number;
  } = {},
): Promise<TypesetReply> {
  return new Promise((resolve, reject) => {
    const { signal } = options;
    if (signal?.aborted) {
      reject(new TypesetCancelledError());
      return;
    }
    if (queue.length >= MAX_WAITING_JOBS) {
      reject(new TypesetBusyError());
      return;
    }
    const giveUp = (error: Error) => {
      const at = queue.indexOf(pending);
      if (at === -1) return;
      queue.splice(at, 1);
      pending.release();
      reject(error);
    };
    const cancelled = () => giveUp(new TypesetCancelledError());
    const waited = setTimeout(
      () => giveUp(new TypesetBusyError()),
      options.maxWaitMs ?? MAX_WAIT_MS,
    );
    const pending: Pending = {
      id: nextId++,
      job,
      timeoutMs: options.timeoutMs ?? TYPESET_TIMEOUT_MS,
      resolve,
      reject,
      release: () => {
        clearTimeout(waited);
        signal?.removeEventListener("abort", cancelled);
      },
    };
    signal?.addEventListener("abort", cancelled, { once: true });
    queue.push(pending);
    pump();
  });
}

/** The typesetter's process id, while one is running. For tests. */
export function typesetterPid(): number | null {
  return child?.pid ?? null;
}

/** Kills the typesetter. The next job starts a fresh one. */
export function stopTypesetter(): void {
  const proc = child;
  child = null;
  proc?.kill("SIGKILL");
  // Its exit is ignored now that it is no longer `child`, so a job it was
  // running is answered here instead of waiting for ever.
  const lost = current;
  if (lost) {
    finish();
    lost.reject(new TypesetCrashError("stopped"));
  }
}
