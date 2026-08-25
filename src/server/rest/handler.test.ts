import { describe, expect, it, vi } from "vitest";

/**
 * The first HTTP request this API ever answers.
 *
 * Everything else about the REST layer is checked structurally — `registry.test.ts`
 * proves the declarations are complete and coherent, `coerce.test.ts` proves a
 * query string becomes the right input. Neither of them ever builds a `Request`,
 * so until this file existed the pipeline in `handler.ts` had never actually
 * run: not the mount-prefix strip, not the built-ins, not the 404/405 split, and
 * not the refusal a caller with no credential gets. Those are the responses an
 * integrator meets first and the ones a structural test cannot reach.
 *
 * The subject is deliberately the half that needs no database. Every path below
 * either answers before authentication or refuses before a procedure is
 * resolved, which is what makes them testable as units at all — the moment a
 * real credential is involved the answer comes out of Postgres, and that is
 * `api-keys.integration.test.ts`'s job.
 *
 * `server-only` is mocked because it exists precisely to fail this import: the
 * package resolves to a throwing module outside a server component graph, which
 * is the guarantee we want in the build and an obstacle in a plain Node test.
 * `~/server/db` is mocked so that constructing a Prisma client does not require
 * a `DATABASE_URL` that none of these assertions would use.
 */
vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

vi.mock("server-only", () => ({}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("next-auth", () => ({ default: () => ({}) }));
vi.mock("~/server/auth", () => ({
  auth: async () => null,
  handlers: {},
  signIn: async () => undefined,
  signOut: async () => undefined,
}));

import { handleApiRequest } from "./handler";

const ORIGIN = "https://plannr.test";

const call = (
  method: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> =>
  handleApiRequest(new Request(`${ORIGIN}${path}`, { method, ...init }));

/** Every error this API emits shares one envelope; unwrap it in one place. */
async function errorOf(response: Response) {
  const body = (await response.json()) as {
    error?: { code?: string; message?: string };
  };
  return body.error ?? {};
}

describe("GET /api/v1/health", () => {
  /**
   * The one endpoint with no credential in front of it. If this ever starts
   * needing a key, somebody will paste one into a status-page dashboard.
   */
  it("answers without authentication", async () => {
    const response = await call("GET", "/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it("answers a HEAD with the status and no body", async () => {
    const response = await call("HEAD", "/api/v1/health");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("refuses a write, and says which method it wanted", async () => {
    const response = await call("POST", "/api/v1/health");

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });
});

describe("routing", () => {
  it("404s an unknown path and points at the document that lists the real ones", async () => {
    const response = await call("GET", "/api/v1/there-is-no-such-thing");

    expect(response.status).toBe(404);
    expect((await errorOf(response)).message).toContain("/api/v1/openapi.json");
  });

  /**
   * The distinction that saves somebody an afternoon: a 405 means they found
   * the right endpoint and reached for the wrong verb.
   */
  it("405s a known path with the wrong method, listing what it does accept", async () => {
    const response = await call("DELETE", "/api/v1/rooms");

    expect(response.status).toBe(405);
    const allow = response.headers.get("allow") ?? "";
    expect(allow).toContain("GET");
    expect(allow).toContain("POST");
  });

  it("treats a trailing slash as the same endpoint", async () => {
    const [bare, slashed] = await Promise.all([
      call("GET", "/api/v1/health"),
      call("GET", "/api/v1/health/"),
    ]);

    expect(slashed.status).toBe(bare.status);
  });

  /**
   * The mount prefix is stripped, not matched loosely — a path that merely
   * starts with something familiar is still nothing.
   */
  it("does not answer outside its mount", async () => {
    const response = await call("GET", "/api/v2/health");
    expect(response.status).toBe(404);
  });
});

describe("authentication", () => {
  it("401s a registry route with no credential at all", async () => {
    const response = await call("GET", "/api/v1/rooms");

    expect(response.status).toBe(401);
    const error = await errorOf(response);
    // The message has to name both ways in, because a reader who got here
    // knows only that something was missing.
    expect(error.message).toMatch(/bearer|key|session|sign/i);
  });

  it("401s a bearer token that is not shaped like one of ours", async () => {
    const response = await call("GET", "/api/v1/rooms", {
      headers: { authorization: "Bearer not-a-plannr-key" },
    });

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).toBe("invalid_token");
  });

  /**
   * A Basic header is not a malformed key, it is a different scheme — it must
   * fall through to the cookie path and fail as "no credential", not as a bad
   * token, or the error sends the reader hunting for a typo in a key they never
   * sent.
   */
  it("does not mistake another auth scheme for a key", async () => {
    const response = await call("GET", "/api/v1/rooms", {
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });

    expect(response.status).toBe(401);
    expect((await errorOf(response)).code).not.toBe("invalid_token");
  });

  /** Reference documentation is still the institution's, not the internet's. */
  it("401s the OpenAPI document", async () => {
    const response = await call("GET", "/api/v1/openapi.json");
    expect(response.status).toBe(401);
  });

  it("401s /me", async () => {
    const response = await call("GET", "/api/v1/me");
    expect(response.status).toBe(401);
  });
});

describe("error envelope", () => {
  /**
   * One shape for every failure, so a client writes the unwrapping once.
   */
  it("is the same for a 404, a 405 and a 401", async () => {
    const responses = await Promise.all([
      call("GET", "/api/v1/nope"),
      call("DELETE", "/api/v1/rooms"),
      call("GET", "/api/v1/rooms"),
    ]);

    for (const response of responses) {
      const error = await errorOf(response);
      expect(typeof error.code).toBe("string");
      expect(typeof error.message).toBe("string");
      expect(error.message!.length).toBeGreaterThan(0);
    }
  });

  /**
   * Nothing that fails before a procedure runs may leak a stack, a query or a
   * file path. These are the responses an unauthenticated caller can provoke at
   * will, so they are the ones worth asserting about.
   */
  it("never leaks internals to an unauthenticated caller", async () => {
    const responses = await Promise.all([
      call("GET", "/api/v1/nope"),
      call("GET", "/api/v1/rooms"),
      call("GET", "/api/v1/rooms", {
        headers: {
          authorization: "Bearer plk_live_deadbeef.aaaaaaaaaaaaaaaaaaaaaaaa",
        },
      }),
    ]);

    for (const response of responses) {
      const text = await response.text();
      expect(text).not.toMatch(/at \w+ \(|node_modules|prisma|\/Users\//i);
    }
  });
});
