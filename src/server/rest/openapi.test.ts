import { describe, expect, it, vi } from "vitest";

/**
 * Three pieces of scaffolding, all for the same reason.
 *
 * Building the document means introspecting `appRouter`, and importing
 * `appRouter` drags in the whole server boot sequence — next-auth, the
 * environment schema, a Prisma client. None of it is used: the document is
 * assembled from static schemas and authenticates nobody. So each is neutered
 * rather than satisfied, which is also what keeps this a unit test that runs
 * without a database or a `.env`.
 *
 * 1. `SKIP_ENV_VALIDATION` — `src/env.js` validates on import, and the unit
 *    vitest config deliberately does not load `.env` (the integration one does,
 *    because it needs a real database). Hoisted, so it lands before the import.
 * 2. `~/server/auth` — mirrors `src/server/auth/__stub__.ts`, which exists for
 *    exactly this. `auth()` is never called.
 * 3. `next-auth` — `verbatimModuleSyntax` turns `import { type Session } from
 *    "next-auth"` in `trpc.ts` into a real side-effect import, and next-auth's
 *    Next.js-only entry points do not resolve under plain Node.
 */
vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

vi.mock("~/server/auth", () => ({
  auth: async () => null,
  handlers: {},
  signIn: async () => undefined,
  signOut: async () => undefined,
}));

vi.mock("next-auth", () => ({ default: () => ({}) }));

import { buildOpenApiDocument } from "./openapi";
import { ROUTES } from "./registry";
import { compileRoute, inputSourceOf } from "./types";

const ORIGIN = "https://plannr.example.ac.in";

interface Operation {
  operationId?: unknown;
  security?: unknown;
  parameters?: Array<{ name: string; in: string; required?: boolean }>;
  requestBody?: {
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
  responses?: Record<string, unknown>;
  tags?: string[];
  summary?: unknown;
  description?: unknown;
}

const document = buildOpenApiDocument(ORIGIN) as {
  paths: Record<string, Record<string, Operation>>;
  tags: Array<{ name: string }>;
  security: Array<Record<string, unknown>>;
  servers: Array<{ url: string }>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
};

const operations = (): Array<{
  path: string;
  method: string;
  operation: Operation;
}> =>
  Object.entries(document.paths).flatMap(([path, item]) =>
    Object.entries(item).map(([method, operation]) => ({
      path,
      method,
      operation,
    })),
  );

describe("buildOpenApiDocument", () => {
  it("describes every route in the registry", () => {
    for (const route of ROUTES) {
      const item = document.paths[route.path];
      expect(item, `no path item for ${route.path}`).toBeDefined();
      expect(
        item![route.method.toLowerCase()],
        `no ${route.method} operation for ${route.path}`,
      ).toBeDefined();
    }

    // And nothing beyond them — a path nobody declared cannot be served.
    const declared = new Set(ROUTES.map((route) => route.path));
    for (const path of Object.keys(document.paths)) {
      expect(declared.has(path), `undeclared path ${path}`).toBe(true);
    }
  });

  it("gives every operation an operationId, and never the same one twice", () => {
    const seen = new Set<string>();

    for (const { path, method, operation } of operations()) {
      const id = operation.operationId;
      expect(
        typeof id === "string" && id.length > 0,
        `${method.toUpperCase()} ${path} has no operationId`,
      ).toBe(true);
      expect(
        seen.has(id as string),
        `duplicate operationId ${String(id)}`,
      ).toBe(false);
      seen.add(id as string);
    }

    expect(seen.size).toBe(ROUTES.length);
  });

  it("requires a credential everywhere", () => {
    // The requirement is declared once at the root and inherited, so the thing
    // that matters is that it exists, names a real scheme, and that no
    // operation quietly opts out of it with an empty override.
    expect(document.security).toEqual([{ apiKey: [] }]);
    expect(document.components.securitySchemes.apiKey).toMatchObject({
      type: "http",
      scheme: "bearer",
    });

    for (const { path, method, operation } of operations()) {
      if (operation.security === undefined) continue;
      expect(
        operation.security,
        `${method.toUpperCase()} ${path} opts out of authentication`,
      ).not.toEqual([]);
    }
  });

  it("serialises, and twice over produces identical bytes", () => {
    const first = JSON.stringify(buildOpenApiDocument(ORIGIN));
    const second = JSON.stringify(buildOpenApiDocument(ORIGIN));

    expect(typeof first).toBe("string");
    expect(first.length).toBeGreaterThan(0);
    expect(second).toBe(first);
  });

  it("points at the origin it was built for", () => {
    expect(document.servers).toEqual([{ url: `${ORIGIN}/api/v1` }]);
  });

  it("documents every path parameter, and documents it only once", () => {
    for (const route of ROUTES.map(compileRoute)) {
      const operation =
        document.paths[route.path]![route.method.toLowerCase()]!;
      const parameters = operation.parameters ?? [];

      for (const name of route.paramNames) {
        const parameter = parameters.find(
          (candidate) => candidate.in === "path" && candidate.name === name,
        );
        expect(
          parameter,
          `${route.path} does not document {${name}}`,
        ).toBeDefined();
        expect(parameter!.required).toBe(true);
      }

      // The field a path parameter feeds must not also be asked for in the
      // query string or the body, or a caller has two places to put it and no
      // way to know which the server believes.
      const supplied = new Set([
        ...route.paramNames.map((name) => route.params?.[name] ?? name),
        ...Object.keys(route.defaults ?? {}),
      ]);

      for (const parameter of parameters) {
        if (parameter.in !== "query") continue;
        expect(
          supplied.has(parameter.name),
          `${route.path} documents server-supplied "${parameter.name}" as a query parameter`,
        ).toBe(false);
      }

      const body = operation.requestBody?.content?.["application/json"]?.schema;
      const properties = (body?.properties ?? {}) as Record<string, unknown>;
      for (const name of Object.keys(properties)) {
        expect(
          supplied.has(name),
          `${route.path} documents server-supplied "${name}" in its body`,
        ).toBe(false);
      }
      for (const name of (body?.required as string[] | undefined) ?? []) {
        expect(
          supplied.has(name),
          `${route.path} still requires server-supplied "${name}"`,
        ).toBe(false);
      }
    }
  });

  it("puts input where the route says it goes", () => {
    for (const route of ROUTES) {
      const operation =
        document.paths[route.path]![route.method.toLowerCase()]!;
      const source = inputSourceOf(route);

      if (source !== "body") {
        expect(
          operation.requestBody,
          `${route.method} ${route.path} takes ${source} input but has a body`,
        ).toBeUndefined();
      }

      if (source !== "query") {
        const query = (operation.parameters ?? []).filter(
          (parameter) => parameter.in === "query",
        );
        expect(
          query,
          `${route.method} ${route.path} takes ${source} input but has query parameters`,
        ).toEqual([]);
      }
    }
  });

  it("answers with the route's success status, and with errors that resolve", () => {
    for (const route of ROUTES) {
      const operation =
        document.paths[route.path]![route.method.toLowerCase()]!;
      const responses = operation.responses ?? {};

      expect(responses[String(route.status ?? 200)]).toBeDefined();
      for (const code of ["400", "401", "403", "404", "429", "500"]) {
        if (code === String(route.status ?? 200)) continue;
        expect(
          responses[code],
          `${route.path} does not document a ${code}`,
        ).toBeDefined();
      }
    }

    // The shape has to stay in step with `ApiErrorBody` in `errors.ts`, which
    // is what the handler actually writes — a documented envelope that is one
    // level flatter than the real one is worse than no envelope at all.
    expect(document.components.schemas.Error).toMatchObject({
      type: "object",
      required: ["error"],
      properties: {
        error: { required: ["code", "message"] },
      },
    });
    // Every `$ref` in the document must resolve, or the spec will not load.
    for (const match of JSON.stringify(document).matchAll(
      /"\$ref":"#\/components\/schemas\/([A-Za-z0-9_]+)"/g,
    )) {
      expect(document.components.schemas[match[1]!]).toBeDefined();
    }
  });

  it("names each operation's scopes in prose a reader will see", () => {
    for (const route of ROUTES) {
      const operation =
        document.paths[route.path]![route.method.toLowerCase()]!;
      expect(typeof operation.summary).toBe("string");
      expect(operation.tags).toEqual([route.tag]);

      const description = operation.description as string;
      if (route.scopes.length > 0) {
        expect(description).toContain(
          `Requires scope(s): ${route.scopes.join(", ")}.`,
        );
      }
      if (route.actor === "session") {
        expect(description).toContain("An API key cannot call this endpoint.");
      }
    }
  });

  it("declares every tag its operations use", () => {
    const declared = new Set(document.tags.map((tag) => tag.name));
    for (const route of ROUTES) {
      expect(declared.has(route.tag), `undeclared tag ${route.tag}`).toBe(true);
    }
    expect(document.tags.length).toBe(declared.size);
  });

  it("explains authentication, scopes and service principals up front", () => {
    const info = (document as unknown as { info: { description: string } })
      .info;
    for (const phrase of [
      "Authorization: Bearer",
      "service principal",
      "Administrator",
      "403",
    ]) {
      expect(info.description).toContain(phrase);
    }
  });
});
