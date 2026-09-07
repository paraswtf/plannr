/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import superjson from "superjson";
import { ZodError } from "zod";

import { PermissionBitField, PermissionFlags } from "~/lib/permissions";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: {
  headers: Headers;
  /**
   * An already-resolved session, for callers that did not arrive with a cookie.
   *
   * The public REST API authenticates a bearer token itself and hands the
   * result in here, which is the seam that lets an API key reach the very same
   * procedures a browser does. Passing `null` means "definitely nobody";
   * omitting it entirely means "look for a cookie", which is what every
   * in-app caller wants.
   */
  session?: Session | null;
}) => {
  const { session: provided, ...rest } = opts;
  const session = provided !== undefined ? provided : await auth();

  return {
    db,
    session,
    ...rest,
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    // artificial delay in dev
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    if (!ctx.session.user.isActive) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This account has been deactivated.",
      });
    }

    const user = ctx.session.user;
    // Already the union of every role held plus personal grants; the session
    // callback did that against live data on this request.
    const permissions = BigInt(user.permissions);
    const actor = {
      id: user.id,
      orgId: user.orgId,
      roles: user.roles,
      permissions,
      /**
       * Whether a person or an app is on the other end, and how they arrived.
       *
       * Almost nothing should branch on this — the permission bits are the
       * authorisation story, and a key that holds the bit may do the thing.
       * It exists for the handful of operations that are meaningless without a
       * human behind them: connecting somebody's Google Calendar, reading
       * "my" timetable. Those refuse a service principal outright rather than
       * quietly returning an empty answer.
       *
       * Three values, not two, because a personal key is both things at once.
       * It *is* a person — it carries their id and their timetable, so "my
       * classes" is a question it can answer — and it is also a credential
       * somebody could leave in a Shortcut on a lost phone. So the operations
       * that need a human behind them get one, and the operations that must
       * never be reachable from a token still refuse it: see `refuseApiKey` in
       * the API-keys router, which is why a key of any kind cannot mint a key.
       */
      kind: user.isServiceAccount
        ? ("service" as const)
        : user.viaApiKey
          ? ("personal" as const)
          : ("user" as const),
    };

    return next({
      ctx: {
        // infers the `session` as non-nullable
        session: { ...ctx.session, user },
        /** The acting user, plus their resolved permission bits. */
        actor,
        bits: new PermissionBitField(permissions),
        /** Every domain query filters by this. */
        orgId: user.orgId,
      },
    });
  });

/**
 * Permission-gated procedure.
 *
 * Reads declaratively at the call site:
 *   `permissionProcedure(PermissionFlags.ManageRooms).mutation(...)`
 *
 * Ownership rules ("faculty may edit the classes they teach") are finer-grained
 * than a flag, so they stay in the procedure body — this only gates the coarse
 * capability.
 */
export const permissionProcedure = (...required: bigint[]) =>
  protectedProcedure.use(({ ctx, next }) => {
    if (!ctx.bits.hasAll(...required)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have permission to do that.",
      });
    }
    return next();
  });

/** Convenience for the admin-only console procedures. */
export const adminProcedure = permissionProcedure(
  PermissionFlags.Administrator,
);
