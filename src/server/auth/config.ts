import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { env } from "~/env";
import { db } from "~/server/db";
import { getOrgId } from "~/server/org";

/**
 * Module augmentation for `next-auth`. The session carries what authorisation
 * decisions need, so callers rarely have to re-query the user.
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      orgId: string;
      /** Names of the roles held, for display. */
      roles: Array<{ id: string; name: string; key: string | null }>;
      /**
       * Union of every role's bits plus personal grants, before implications
       * are applied — serialised as a decimal string because BigInt does not
       * survive JSON. Pass through `new PermissionBitField(...)` to check it.
       */
      permissions: string;
      isActive: boolean;
    } & DefaultSession["user"];
  }
}

/** Google's ID token carries the Workspace domain in `hd`. */
interface GoogleProfile {
  email?: string;
  email_verified?: boolean;
  hd?: string;
}

/**
 * The stock adapter knows nothing about `orgId`, which is required on `User`.
 * Attaching it here — rather than defaulting it in the schema — keeps the
 * single-tenant assumption in one replaceable place.
 */
function orgAwareAdapter(): Adapter {
  const adapter = PrismaAdapter(db);
  return {
    ...adapter,
    async createUser(user: AdapterUser) {
      const orgId = await getOrgId();
      // Roles live in their own table, so "new users are students" is an
      // explicit assignment rather than a column default. Someone with the
      // people permission promotes them from there.
      const student = await db.role.findUnique({
        where: { orgId_key: { orgId, key: "student" } },
        select: { id: true },
      });

      return db.user.create({
        data: {
          id: user.id,
          name: user.name,
          email: user.email.toLowerCase(),
          emailVerified: user.emailVerified,
          image: user.image,
          orgId,
          ...(student ? { roles: { create: { roleId: student.id } } } : {}),
        },
      });
    },
  };
}

export const authConfig = {
  adapter: orgAwareAdapter(),
  // Database sessions: an admin promoting someone takes effect on their very
  // next request, sign-out-everywhere is possible, and tests can mint a session
  // by inserting a row rather than driving an OAuth flow.
  session: { strategy: "database" },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    GoogleProvider({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          // A hint to Google's account chooser only — it is trivially bypassed,
          // so the real check is in `signIn` below.
          hd: env.GOOGLE_WORKSPACE_DOMAIN,
          prompt: "select_account",
        },
      },
      // Links a Google sign-in to a user an admin imported by email before they
      // ever logged in. Safe here: Google is the sole provider and every email
      // reaching this point is a verified address on our own Workspace domain.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider !== "google") return false;

      const google = profile as GoogleProfile | undefined;
      const email = google?.email?.toLowerCase();
      const domain = env.GOOGLE_WORKSPACE_DOMAIN.toLowerCase();

      // Consumer Gmail accounts carry no `hd` claim at all; checking the
      // address as well guards against a provider quirk in either direction.
      return Boolean(
        google?.email_verified === true &&
        google.hd?.toLowerCase() === domain &&
        email?.endsWith(`@${domain}`),
      );
    },
    async session({ session, user }) {
      const row = user as typeof user & {
        orgId: string;
        permissions: bigint;
        isActive: boolean;
      };

      // Roles are a separate table, so the adapter's user row cannot carry
      // them. With the database session strategy this runs per request against
      // live data, which is what makes a role change take effect immediately.
      const assignments = await db.userRole.findMany({
        where: { userId: row.id },
        select: {
          role: {
            select: { id: true, name: true, key: true, permissions: true },
          },
        },
      });

      const roles = assignments.map((a) => a.role);
      const permissions = roles.reduce(
        (bits, role) => bits | role.permissions,
        row.permissions,
      );

      return {
        ...session,
        user: {
          ...session.user,
          id: row.id,
          orgId: row.orgId,
          roles: roles.map(({ id, name, key }) => ({ id, name, key })),
          permissions: permissions.toString(),
          isActive: row.isActive,
        },
      };
    },
  },
} satisfies NextAuthConfig;
