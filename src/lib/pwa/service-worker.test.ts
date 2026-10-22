import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

import { beforeEach, describe, expect, it } from "vitest";

/**
 * `public/sw.js` is plain JavaScript that only runs in a browser's worker, so
 * it is loaded here into a sandbox that stands in for one: a `self` that records
 * its listeners, an in-memory `caches`, and a `fetch` the test controls. What is
 * checked is the file that ships, not a copy of its logic.
 */

const ORIGIN = "https://plannr.test";
const SOURCE = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

class FakeCache {
  entries = new Map<string, Response>();
  async addAll(urls: string[]) {
    for (const url of urls)
      this.entries.set(new URL(url, ORIGIN).href, ok(url));
  }
  async put(request: Request | string, response: Response) {
    this.entries.set(keyOf(request), response);
  }
  async match(request: Request | string) {
    return this.entries.get(keyOf(request))?.clone();
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
  async delete(request: Request | string) {
    return this.entries.delete(keyOf(request));
  }
}
const keyOf = (r: Request | string) =>
  typeof r === "string" ? new URL(r, ORIGIN).href : r.url;

/**
 * A same-origin answer, the way `fetch` hands one back. `type` and `redirected`
 * are read-only on a real `Response`, and a real `clone()` keeps them, so the
 * fake does both.
 */
function ok(body: string, extra: { redirected?: boolean } = {}): Response {
  const make = (text: string): Response => {
    const response = new Response(text, { status: 200 });
    Object.defineProperty(response, "type", { value: "basic" });
    Object.defineProperty(response, "redirected", {
      value: extra.redirected ?? false,
    });
    response.clone = () => make(text);
    return response;
  };
  return make(body);
}

type Listener = (event: unknown) => void;

function boot() {
  const store = new Map<string, FakeCache>();
  const listeners: Record<string, Listener> = {};
  let network: (request: Request) => Promise<Response> = async () => {
    throw new TypeError("offline");
  };

  const caches = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new FakeCache());
      return store.get(name)!;
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (request: string | Request) => {
      for (const cache of store.values()) {
        const hit = await cache.match(request);
        if (hit) return hit;
      }
      return undefined;
    },
  };

  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => (listeners[type] = fn),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };

  vm.runInNewContext(SOURCE, {
    self,
    caches,
    fetch: (request: Request) => network(request),
    Response,
    URL,
    Promise,
    setTimeout,
    console,
  });

  /** Fires a fetch event and resolves with what the worker answered, if anything. */
  async function request(
    path: string,
    init: RequestInit & { navigate?: boolean; rsc?: boolean } = {},
  ) {
    const headers = new Headers(init.headers);
    if (init.rsc) headers.set("RSC", "1");
    const req = new Request(new URL(path, ORIGIN), { ...init, headers });
    if (init.navigate)
      Object.defineProperty(req, "mode", { value: "navigate" });
    let answered: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    listeners.fetch!({
      request: req,
      respondWith: (p: Promise<Response>) => (answered = p),
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    });
    const response = answered ? await answered : undefined;
    await Promise.all(pending);
    return { response, handled: answered !== undefined };
  }

  async function install() {
    const pending: Promise<unknown>[] = [];
    listeners.install!({ waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
  }

  return {
    store,
    request,
    install,
    setNetwork: (fn: typeof network) => (network = fn),
    cachedUrls: async (name: string) => [
      ...(store.get(name)?.entries.keys() ?? []),
    ],
  };
}

let sw: ReturnType<typeof boot>;
beforeEach(() => {
  sw = boot();
});

describe("pages", () => {
  it("serve live when online and are kept for later", async () => {
    sw.setNetwork(async () => ok("live schedule"));
    const { response } = await sw.request("/schedule", { navigate: true });
    expect(await response!.text()).toBe("live schedule");
    expect(await sw.cachedUrls("plannr-pages-v1")).toContain(
      `${ORIGIN}/schedule`,
    );
  });

  it("serve the last saved copy when the network is gone", async () => {
    sw.setNetwork(async () => ok("monday's classes"));
    await sw.request("/schedule", { navigate: true });

    sw.setNetwork(async () => {
      throw new TypeError("offline");
    });
    const { response } = await sw.request("/schedule", { navigate: true });
    expect(await response!.text()).toBe("monday's classes");
  });

  it("fall back to the offline page for a screen never opened", async () => {
    await sw.install();
    const { response } = await sw.request("/attendance", { navigate: true });
    expect(await response!.text()).toContain("offline.html");
  });

  it("keep the router's payload for moving between screens", async () => {
    sw.setNetwork(async () => ok("rsc payload"));
    await sw.request("/timetable?_rsc=abc", { rsc: true });
    sw.setNetwork(async () => {
      throw new TypeError("offline");
    });
    const { response } = await sw.request("/timetable?_rsc=abc", { rsc: true });
    expect(await response!.text()).toBe("rsc payload");
  });

  it("never keep a bounce to the sign-in page", async () => {
    sw.setNetwork(async () => ok("sign in", { redirected: true }));
    await sw.request("/schedule", { navigate: true });
    expect(await sw.cachedUrls("plannr-pages-v1")).toEqual([]);
  });
});

describe("data", () => {
  it("keeps tRPC queries so a screen can refill offline", async () => {
    sw.setNetwork(async () => ok('{"result":1}'));
    await sw.request("/api/trpc/timetable.mySchedule?batch=1&input=%7B%7D");
    sw.setNetwork(async () => {
      throw new TypeError("offline");
    });
    const { response } = await sw.request(
      "/api/trpc/timetable.mySchedule?batch=1&input=%7B%7D",
    );
    expect(await response!.text()).toBe('{"result":1}');
  });

  it("leaves writes, the REST API, auth and other sites alone", async () => {
    const mutation = await sw.request("/api/trpc/events.create?batch=1", {
      method: "POST",
      body: "{}",
    });
    const rest = await sw.request("/api/v1/me");
    const cron = await sw.request("/api/cron/calendar");
    const other = await sw.request("https://example.com/x.png");
    expect([mutation, rest, cron, other].map((r) => r.handled)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("build files", () => {
  it("are served from the cache once saved", async () => {
    sw.setNetwork(async () => ok("chunk"));
    await sw.request("/_next/static/chunks/app.js");
    sw.setNetwork(async () => {
      throw new TypeError("offline");
    });
    const { response } = await sw.request("/_next/static/chunks/app.js");
    expect(await response!.text()).toBe("chunk");
  });
});

describe("signing in and out", () => {
  it("forgets one person's screens and data, and keeps the shared files", async () => {
    sw.setNetwork(async () => ok("x"));
    await sw.request("/schedule", { navigate: true });
    await sw.request("/api/trpc/attendance.mine?batch=1");
    await sw.request("/_next/static/chunks/app.js");

    const signOut = await sw.request("/api/auth/signout");
    expect(signOut.handled).toBe(false); // passes through untouched

    expect(await sw.cachedUrls("plannr-pages-v1")).toEqual([]);
    expect(await sw.cachedUrls("plannr-data-v1")).toEqual([]);
    expect(await sw.cachedUrls("plannr-static-v1")).toHaveLength(1);
  });

  it("clears on sign-in too, so nobody inherits the last person's day", async () => {
    sw.setNetwork(async () => ok("x"));
    await sw.request("/schedule", { navigate: true });
    await sw.request("/api/auth/callback/google?code=1");
    expect(await sw.cachedUrls("plannr-pages-v1")).toEqual([]);
  });
});
