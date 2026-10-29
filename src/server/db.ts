import { env } from "~/env";
import { PrismaClient } from "../../generated/prisma";

const createPrismaClient = () =>
  new PrismaClient({
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    // The institution's letterhead logo is up to 256 KB, and the settings row
    // it sits on is read whole by the timetable grid, the plan workspace and
    // the event writes, some of them for every open tab each minute. Only the
    // code that prints or reports the logo reads it, by naming it in a select
    // (documentSettingsFor and the settings router), which overrides this.
    omit: { orgSettings: { documentLogo: true } },
    // Typed as a client without the omit, because `Db` and every function
    // that takes one are written against the plain client, which a client
    // whose types omit a field cannot be passed as. The cost is that a whole
    // row's type still lists `documentLogo`; settings.integration.test.ts
    // checks that nothing outside those two readers relies on it.
  }) as unknown as PrismaClient<{
    log: ("query" | "error" | "warn")[];
  }>;

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
