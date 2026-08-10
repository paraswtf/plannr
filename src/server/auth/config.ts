import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { env } from "~/env";
import { db } from "~/server/db";
import { getOrgId } from "~/server/org";
import type { Role } from "~/lib/permissions";

/**
 * Module augmentation for `next-auth`. The session carries what authorisation
 * decisions need, so callers rarely have to re-query the user.
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      orgId: string;
      role: Role;
      /** Extra permission bits, serialised as a decimal string for the client. */
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
      return db.user.create({
        data: {
          id: user.id,
          name: user.name,
          email: user.email.toLowerCase(),
          emailVerified: user.emailVerified,
          image: user.image,
          orgId,
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
    session({ session, user }) {
      // With the database strategy `user` is the freshly-read row, so role and
      // permission changes are picked up without waiting for a token refresh.
      const row = user as typeof user & {
        orgId: string;
        role: Role;
        permissions: bigint;
        isActive: boolean;
      };
      return {
        ...session,
        user: {
          ...session.user,
          id: row.id,
          orgId: row.orgId,
          role: row.role,
          permissions: row.permissions.toString(),
          isActive: row.isActive,
        },
      };
    },
  },
} satisfies NextAuthConfig;
