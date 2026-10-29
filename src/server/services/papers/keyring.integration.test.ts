import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";
import { papersEnabled, teacherSecret } from "./crypto";

/**
 * A teacher's paper secret against a real Postgres.
 *
 * The unit tests cover the logic; this covers what only the database can:
 * that two first requests arriving together agree on one secret, and that
 * making it inside a transaction cannot abort that transaction (a caught
 * unique violation would, in Postgres).
 *
 * Needs QUESTION_PAPER_KEY in .env. Run with `npm run test:integration`.
 */

const ORG = "paper-keyring-itest";
const EMAIL = "paper-keyring-teacher@plannr-demo.invalid";

let userId: string;

beforeEach(async () => {
  const org = await db.organization.upsert({
    where: { slug: ORG },
    update: {},
    create: { slug: ORG, name: "Keyring itest" },
  });
  // The keyring row goes with the user (Cascade).
  await db.user.deleteMany({ where: { email: EMAIL } });
  const user = await db.user.create({
    data: { orgId: org.id, email: EMAIL, name: "Teacher" },
  });
  userId = user.id;
});

describe("teacherSecret", () => {
  it("runs with a server key configured", () => {
    expect(papersEnabled()).toBe(true);
  });

  it("makes one secret when many requests ask at once", async () => {
    const secrets = await Promise.all(
      Array.from({ length: 6 }, () => teacherSecret(db, userId)),
    );
    const first = Buffer.from(secrets[0]!);
    for (const secret of secrets) {
      expect(Buffer.from(secret).equals(first)).toBe(true);
    }
    expect(await db.paperKeyring.count({ where: { userId } })).toBe(1);
  });

  it("works inside transactions that race each other", async () => {
    const secrets = await Promise.all(
      Array.from({ length: 4 }, () =>
        db.$transaction(async (tx) => {
          const secret = await teacherSecret(tx, userId);
          // The transaction is still usable afterwards.
          await tx.user.findUniqueOrThrow({ where: { id: userId } });
          return secret;
        }),
      ),
    );
    const first = Buffer.from(secrets[0]!);
    for (const secret of secrets) {
      expect(Buffer.from(secret).equals(first)).toBe(true);
    }
  });

  it("keeps the secret sealed in the table", async () => {
    const secret = await teacherSecret(db, userId);
    const row = await db.paperKeyring.findUniqueOrThrow({ where: { userId } });
    expect(row.sealedSecret.startsWith("v1.")).toBe(true);
    expect(row.sealedSecret).not.toContain(
      Buffer.from(secret).toString("base64url"),
    );
  });
});
