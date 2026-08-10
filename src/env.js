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
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
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
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
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
