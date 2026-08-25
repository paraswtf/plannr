import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A real key, over real HTTP, against a real database.
 *
 * Every other test of this layer stops short of the thing the layer is for.
 * `registry.test.ts` proves the declarations are complete, `coerce.test.ts`
 * proves a query string becomes the right input, `handler.test.ts` builds
 * requests but only ones that fail before a procedure is reached. None of them
 * ever authenticated a token, and none of them ever got an answer out of
 * Postgres — so until this file existed, the sentence the whole feature rests
 * on ("an app with a key can do what a person can") had never once been
 * demonstrated.
 *
 * What is worth asserting here is only what needs all three pieces at once:
 * that a minted secret authenticates, that the scopes on the row are the ones
 * the procedures enforce, that a revoked key stops working immediately, that
 * the values crossing the wire survive the trip in both directions, and that a
 * list too long for one response can actually be walked to its end. The
 * penultimate of those is not theoretical — the body-coercion path was broken
 * for the whole of this feature's first draft, compiled cleanly, and would have
 * rejected every ISO date the documentation tells callers to send.
 *
 * `server-only` is mocked because it exists to fail this import outside a
 * server component graph, which is the guarantee we want in the build and an
 * obstacle here. Everything else is genuine: real rows, real tokens, real
 * `Request` objects.
 *
 * Run with `npm run test:integration` (needs `npm run db:start`).
 */
vi.mock("server-only", () => ({}));

import { SYSTEM_ROLES } from "~/lib/permissions";
import { appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { db } from "~/server/db";
import { handleApiRequest } from "./handler";

const TZ = "Asia/Kolkata";
const ORG = "http-itest";
const ADMIN_EMAIL = "http-admin@plannr-demo.invalid";
const ORIGIN = "https://plannr.test";
const createCaller = createCallerFactory(appRouter);

let orgId: string;
let admin: ReturnType<typeof callerFor>;
let buildingId: string;
let roomId: string;
/** Scoped to look, not touch. */
let readerToken: string;
/** Scoped to put things on the timetable, and to book a room outright. */
let schedulerToken: string;

function callerFor(user: {
  id: string;
  orgId: string;
  roles: Array<{ id: string; name: string; key: string | null }>;
  permissions: bigint;
}) {
  return createCaller({
    db,
    headers: new Headers(),
    session: {
      expires: new Date(Date.now() + 3_600_000).toISOString(),
      user: {
        id: user.id,
        orgId: user.orgId,
        roles: user.roles,
        permissions: user.permissions.toString(),
        isActive: true,
        isServiceAccount: false,
      },
    },
  });
}

/** A request as an app would actually make it. */
function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<Response> {
  const headers = new Headers();
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  return handleApiRequest(
    new Request(`${ORIGIN}/api/v1${path}`, {
      method,
      headers,
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    }),
  );
}

/** One page of a list, as a caller would read it off the wire. */
interface PageBody {
  rows: Array<{ id: string; code: string }>;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const pageOf = async (path: string): Promise<PageBody> => {
  const response = await call("GET", path, { token: readerToken });
  expect(response.status).toBe(200);
  return (await response.json()) as PageBody;
};

const errorOf = async (response: Response) => {
  const body = (await response.json()) as {
    error?: { code?: string; message?: string };
  };
  return body.error ?? {};
};

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: ORG },
    update: {},
    create: { slug: ORG, name: "HTTP itest", timezone: TZ },
  });
  orgId = org.id;
  await db.orgSettings.upsert({
    where: { orgId },
    update: {},
    create: { orgId },
  });

  // Keys before principals: the key holds the foreign key, so the reverse order
  // leaves a row nothing can delete.
  await db.apiKey.deleteMany({ where: { orgId } });
  await db.user.deleteMany({ where: { orgId, isServiceAccount: true } });
  await db.eventOccurrence.deleteMany({ where: { orgId } });
  await db.event.deleteMany({ where: { orgId } });
  await db.room.deleteMany({ where: { orgId } });
  await db.building.deleteMany({ where: { orgId } });
  await db.user.deleteMany({ where: { email: ADMIN_EMAIL } });

  for (const role of SYSTEM_ROLES) {
    await db.role.upsert({
      where: { orgId_key: { orgId, key: role.key } },
      update: {},
      create: {
        orgId,
        key: role.key,
        name: role.name,
        permissions: role.permissions,
        isSystem: true,
      },
    });
  }
  const adminRole = await db.role.findUniqueOrThrow({
    where: { orgId_key: { orgId, key: "admin" } },
  });
  const adminUser = await db.user.create({
    data: { orgId, email: ADMIN_EMAIL, name: "Administrator" },
  });
  admin = callerFor({
    id: adminUser.id,
    orgId,
    roles: [{ id: adminRole.id, name: adminRole.name, key: adminRole.key }],
    permissions: adminRole.permissions,
  });

  const building = await db.building.create({
    data: { orgId, name: "Symbiosis Block" },
  });
  buildingId = building.id;
  const room = await db.room.create({
    data: {
      orgId,
      buildingId: building.id,
      code: "A-101",
      floor: 1,
      capacity: 60,
      type: "LECTURE",
    },
  });
  roomId = room.id;

  readerToken = (
    await admin.apiKeys.create({ name: "Noticeboard", scopes: ["ViewRooms"] })
  ).token;
  schedulerToken = (
    await admin.apiKeys.create({
      name: "Timetable Sync",
      scopes: ["ManageAllEvents", "ViewRooms", "BookRoom"],
    })
  ).token;
});

describe("a key that works", () => {
  it("reads the room list it was scoped for", async () => {
    const response = await call("GET", "/rooms", { token: readerToken });

    expect(response.status).toBe(200);
    const page = (await response.json()) as {
      rows: Array<{ id: string; code: string }>;
      total: number;
    };
    expect(page.rows.map((r) => r.code)).toContain("A-101");
    expect(page.total).toBe(page.rows.length);
  });

  /**
   * The endpoint an integrator hits first, to find out whether the token they
   * pasted is the one they think it is.
   */
  it("describes itself at /me as a machine, not a person", async () => {
    const response = await call("GET", "/me", { token: readerToken });

    expect(response.status).toBe(200);
    const me = (await response.json()) as {
      kind?: string;
      scopes?: string[];
      key?: { name?: string };
    };
    expect(me.kind).toBe("service");
    expect(me.key?.name).toBe("Noticeboard");
    expect(me.scopes).toContain("ViewRooms");
  });

  it("stamps the key as used", async () => {
    await call("GET", "/rooms", { token: readerToken });

    const key = await db.apiKey.findFirstOrThrow({
      where: { orgId, name: "Noticeboard" },
    });
    expect(key.requestCount).toBeGreaterThan(0);
    expect(key.lastUsedAt).not.toBeNull();
  });
});

describe("values crossing the wire", () => {
  /**
   * A query-string date reaching a `z.date()` input. Every read endpoint with a
   * window depends on this, and a string arriving where a Date was expected is
   * a validation failure, not a coercion the procedure could recover from.
   */
  it("coerces an ISO date out of the query string", async () => {
    const from = new Date("2026-09-01T04:00:00.000Z");
    const to = new Date("2026-09-01T06:00:00.000Z");

    const response = await call(
      "GET",
      `/rooms/available?from=${from.toISOString()}&to=${to.toISOString()}`,
      { token: readerToken },
    );

    expect(response.status).toBe(200);
    const page = (await response.json()) as { rows: Array<{ code: string }> };
    expect(page.rows.map((r) => r.code)).toContain("A-101");
  });

  /**
   * The same coercion, in a JSON body. This is the one that was broken: the
   * merged input was never walked, so `startTime` arrived as a string and the
   * procedure refused it. Nothing about the code looked wrong, which is exactly
   * why it needs a test that actually posts.
   *
   * A booking rather than a class only because a class needs a cohort attending
   * it, and the fixture that rule would demand says nothing about dates.
   */
  it("coerces ISO dates out of a JSON body", async () => {
    const response = await call("POST", "/events", {
      token: schedulerToken,
      body: {
        kind: "BOOKING",
        title: "Data Structures",
        roomId,
        startTime: "2026-09-01T04:00:00.000Z",
        endTime: "2026-09-01T05:00:00.000Z",
      },
    });

    expect(response.status).toBe(201);
    const created = (await response.json()) as {
      event?: { id?: string; title?: string };
    };
    expect(created.event?.title).toBe("Data Structures");

    const stored = await db.event.findFirstOrThrow({ where: { orgId } });
    expect(stored.startTime.toISOString()).toBe("2026-09-01T04:00:00.000Z");
  });

  /**
   * Coming back the other way, a Date must be an ISO string and never
   * superjson's `{ json, meta }` envelope — a caller in another language has no
   * way to unwrap that.
   */
  it("returns dates as plain ISO strings", async () => {
    await call("POST", "/events", {
      token: schedulerToken,
      body: {
        kind: "BOOKING",
        title: "Networks",
        roomId,
        startTime: "2026-09-02T04:00:00.000Z",
        endTime: "2026-09-02T05:00:00.000Z",
      },
    });

    const response = await call(
      "GET",
      `/rooms/available?from=2026-09-02T04:30:00.000Z&to=2026-09-02T04:45:00.000Z`,
      { token: readerToken },
    );
    const text = await response.text();

    expect(text).not.toContain('"meta"');
    expect(text).not.toContain('"json"');
    // The booked room is busy in that window, so it is not on offer.
    expect(text).not.toContain("A-101");
  });
});

describe("paging a list", () => {
  /**
   * The convention every list in this API follows, exercised the way an
   * integrator meets it: two round trips over HTTP, and the second one asked
   * for on the strength of what the first one said.
   *
   * Nothing in the REST layer implements any of this — `rooms.list` pages at
   * the database and `coerce.ts` turns `?pageSize=3` into a number against the
   * procedure's own schema — which is exactly why it is worth a test that goes
   * end to end. The declaration is silent about paging, so the only place the
   * two halves are ever seen to meet is here.
   */
  it("hands back one page, and the rest on the next, with nothing twice", async () => {
    // A-101 comes from the fixture; four more make five rooms in one building,
    // which at three to a page is two pages with a short second one — the case
    // that catches an off-by-one in either direction.
    await db.room.createMany({
      data: ["A-102", "A-103", "A-104", "A-105"].map((code) => ({
        orgId,
        buildingId,
        code,
        floor: 1,
        capacity: 60,
        type: "LECTURE" as const,
      })),
    });

    const first = await pageOf("/rooms?page=1&pageSize=3");
    const second = await pageOf("/rooms?page=2&pageSize=3");

    // `total` counts the whole list, `pageSize` echoes what was asked for as a
    // number rather than the "3" that crossed the wire, and `pageCount` is what
    // a client loops on. All three are the envelope's promises.
    expect(first).toMatchObject({
      total: 5,
      page: 1,
      pageSize: 3,
      pageCount: 2,
    });
    expect(second).toMatchObject({
      total: 5,
      page: 2,
      pageSize: 3,
      pageCount: 2,
    });

    expect(first.rows).toHaveLength(3);
    // The last page is short, and must be handed back short rather than padded
    // or wrapped around to the beginning.
    expect(second.rows).toHaveLength(2);

    const codes = [...first.rows, ...second.rows].map((room) => room.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.sort()).toEqual(["A-101", "A-102", "A-103", "A-104", "A-105"]);
  });

  /**
   * The ceiling, at the only place it does any work.
   *
   * `pageInput` gives every list a maximum so that the size of a response is
   * decided by the endpoint and not by whoever is calling it, and a caller who
   * ignores it is refused rather than quietly handed a clamped page — which
   * they would otherwise read as the complete list.
   */
  it("refuses a page size past the endpoint's maximum", async () => {
    const response = await call("GET", "/rooms?pageSize=5000", {
      token: readerToken,
    });

    expect(response.status).toBe(400);
    const error = await errorOf(response);
    expect(error.code).toBe("BAD_REQUEST");
  });
});

describe("what a key may not do", () => {
  it("refuses a write it holds no scope for", async () => {
    const response = await call("POST", "/rooms", {
      token: readerToken,
      body: {
        code: "B-202",
        buildingId: "whatever",
        floor: 2,
        capacity: 40,
        type: "LAB",
      },
    });

    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("insufficient_scope");
    expect(await db.room.count({ where: { orgId, code: "B-202" } })).toBe(0);
  });

  /**
   * The trade-off this design makes explicit: a principal has no week, so
   * rather than answering an empty one it refuses and names the endpoint that
   * does take a subject.
   */
  it("refuses an endpoint defined relative to a person", async () => {
    const response = await call("GET", "/timetable/my-day", {
      token: schedulerToken,
    });

    expect(response.status).toBe(403);
    const error = await errorOf(response);
    expect(error.code).toBe("requires_user");
    // The refusal has to be actionable, not merely correct.
    expect(error.message).toContain("/timetable/week");
  });

  it("stops the moment it is revoked", async () => {
    const key = await db.apiKey.findFirstOrThrow({
      where: { orgId, name: "Noticeboard" },
    });
    await admin.apiKeys.revoke({ id: key.id });

    const response = await call("GET", "/rooms", { token: readerToken });

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("key_revoked");
  });

  it("stops the moment it expires", async () => {
    const key = await db.apiKey.findFirstOrThrow({
      where: { orgId, name: "Noticeboard" },
    });
    await db.apiKey.update({
      where: { id: key.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const response = await call("GET", "/rooms", { token: readerToken });

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("key_expired");
  });

  /**
   * Privilege escalation with extra steps: a key that could mint a key would
   * make every scope on it advisory.
   */
  it("cannot mint another key", async () => {
    const response = await call("POST", "/api-keys", {
      token: schedulerToken,
      body: { name: "Bootstrap", scopes: ["Administrator"] },
    });

    expect(response.status).toBe(403);
    expect(await db.apiKey.count({ where: { orgId, name: "Bootstrap" } })).toBe(
      0,
    );
  });

  it("does not authenticate a secret that was never minted", async () => {
    const key = await db.apiKey.findFirstOrThrow({
      where: { orgId, name: "Noticeboard" },
    });
    const forged = `plk_live_${key.prefix}.${"a".repeat(43)}`;

    const response = await call("GET", "/rooms", { token: forged });

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("invalid_token");
  });
});

describe("rate limiting", () => {
  /**
   * Counted on the row rather than in the process, so this is really asserting
   * that the window survives a request that shares nothing with the last one —
   * which on serverless is every request.
   */
  it("refuses once the window is spent, and says when to come back", async () => {
    const key = await db.apiKey.findFirstOrThrow({
      where: { orgId, name: "Noticeboard" },
    });
    await db.apiKey.update({
      where: { id: key.id },
      data: { rateLimitPerMinute: 2, windowStartedAt: null, windowCount: 0 },
    });

    const first = await call("GET", "/rooms", { token: readerToken });
    const second = await call("GET", "/rooms", { token: readerToken });
    const third = await call("GET", "/rooms", { token: readerToken });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(Number(third.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(first.headers.get("x-ratelimit-limit")).toBe("2");
  });
});
