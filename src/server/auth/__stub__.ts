/**
 * Stand-in for `~/server/auth` in integration tests.
 *
 * The tRPC router imports `auth()` to build its context, but these tests supply
 * a context directly and never call it. Loading the real module would drag in
 * next-auth's Next.js runtime imports, which do not resolve under plain Node.
 */

export const auth = async () => null;
export const handlers = {};
export const signIn = async () => undefined;
export const signOut = async () => undefined;
