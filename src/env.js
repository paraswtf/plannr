import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // --- Database ---
    DATABASE_URL: z.string().url(),
    // Unpooled connection used by `prisma migrate`. Falls back to DATABASE_URL locally.
    DIRECT_URL: z.string().url().optional(),

    // --- Auth ---
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string().min(32)
        : z.string().optional(),
    AUTH_GOOGLE_ID: z.string(),
    AUTH_GOOGLE_SECRET: z.string(),
    /** Google Workspace domain users must belong to, e.g. "sicsr.ac.in". */
    GOOGLE_WORKSPACE_DOMAIN: z.string().min(1),
    /** Comma-separated emails seeded as ADMIN so the first admin exists pre-login. */
    SEED_ADMIN_EMAILS: z.string().optional(),

    // --- Email ---
    EMAIL_PROVIDER: z.enum(["resend", "smtp", "console"]).default("console"),
    EMAIL_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    EMAIL_FROM: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    SMTP_URL: z.string().optional(),

    /** Bearer token guarding /api/cron/outbox. */
    CRON_SECRET: z.string().min(16).optional(),

    // --- Google Calendar sync ---
    /**
     * Master switch. Off, nothing is enqueued and the connect button never
     * appears, so a deployment that has not configured the Cloud console
     * carries no half-working feature.
     */
    GOOGLE_CALENDAR_SYNC_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    /**
     * 32 bytes, base64, sealing the refresh tokens at rest (`openssl rand
     * -base64 32`). Checked below rather than here, because it is required
     * only when sync is on — and a missing key must fail at boot rather than
     * silently write plaintext tokens.
     */
    CALENDAR_TOKEN_KEY: z.string().optional(),

    // --- Push notifications ---
    /**
     * The VAPID key pair identifies this server to the browsers' push services
     * (`npx web-push generate-vapid-keys`). Unset, push is off entirely: the
     * settings screen offers nothing and class changes queue no notices, the
     * same way an unconfigured calendar sync leaves no half-working button.
     */
    VAPID_PRIVATE_KEY: z.string().optional(),
    /** A `mailto:` or https URL the push services can reach the operator at. */
    VAPID_SUBJECT: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    /**
     * Optional override for the app's own origin. Left unset on Vercel, where
     * VERCEL_PROJECT_PRODUCTION_URL supplies it — see `appUrl` below.
     */
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    /** The public half of the VAPID pair; the browser needs it to subscribe. */
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    GOOGLE_WORKSPACE_DOMAIN: process.env.GOOGLE_WORKSPACE_DOMAIN,
    SEED_ADMIN_EMAILS: process.env.SEED_ADMIN_EMAILS,
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    EMAIL_ENABLED: process.env.EMAIL_ENABLED,
    EMAIL_FROM: process.env.EMAIL_FROM,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    SMTP_URL: process.env.SMTP_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    GOOGLE_CALENDAR_SYNC_ENABLED: process.env.GOOGLE_CALENDAR_SYNC_ENABLED,
    CALENDAR_TOKEN_KEY: process.env.CALENDAR_TOKEN_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});

/**
 * The app's own origin, e.g. "https://plannr.example.edu".
 *
 * Vercel sets VERCEL_PROJECT_PRODUCTION_URL to the shortest production custom
 * domain. It is stable across deployments and present even in previews, which
 * is what an OAuth redirect_uri needs: Google only accepts URIs registered
 * ahead of time, so a value that changes per deploy can never be one. Its
 * neighbour VERCEL_URL is the generated per-deployment host and is exactly the
 * wrong choice for the same reason.
 *
 * Read from process.env rather than the validated object because it is a
 * server-only value and this module is imported from both sides.
 */
export const appUrl = (() => {
  const explicit = env.NEXT_PUBLIC_APP_URL;

  // A localhost origin inside a deployment is the specific bug this exists to
  // prevent: every OAuth consent comes back to somebody's laptop, and every
  // link preview points at a machine the scraper cannot reach.
  if (
    explicit &&
    process.env.VERCEL &&
    new URL(explicit).hostname === "localhost"
  ) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is set to a localhost origin inside a Vercel deployment. " +
        "Delete it from the project's environment variables and let " +
        "VERCEL_PROJECT_PRODUCTION_URL supply the domain, or set it to the real one.",
    );
  }
  if (explicit) return explicit;

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return production ? `https://${production}` : "http://localhost:3000";
})();
