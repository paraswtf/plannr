import { randomBytes } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A fixed server key, so these tests do not depend on a .env being present.
const KEY = Buffer.alloc(32, 9).toString("base64");
const settings = { QUESTION_PAPER_KEY: KEY as string | undefined };

vi.mock("~/env", () => ({
  get env() {
    return settings;
  },
}));

const {
  openPaper,
  papersEnabled,
  sealPaper,
  teacherSecret,
  WrongPasswordError,
} = await import("./crypto");
type Db = Parameters<typeof teacherSecret>[0];

/**
 * Sealing question papers.
 *
 * What is being protected is a test paper before the test: anybody who reads
 * it early has the answers. So these tests are about the refusals, more than
 * about the round trip: the wrong password, a ciphertext moved to another
 * paper or another teacher, and a byte changed anywhere must all fail, and
 * fail the same way.
 */

const PASSWORD = "correct horse battery";
const PDF = new Uint8Array(Buffer.from("%PDF-1.7 a question paper"));
const CONTENT = new Uint8Array(Buffer.from('{"sections":[]}'));

async function sealed(overrides: { content?: Uint8Array | null } = {}) {
  const secret = new Uint8Array(randomBytes(32));
  const paper = await sealPaper({
    paperId: "paper-1",
    ownerId: "teacher-1",
    secret,
    password: PASSWORD,
    pdf: PDF,
    content: overrides.content === undefined ? CONTENT : overrides.content,
  });
  return { secret, paper };
}

/** A copy with one byte flipped. */
function flipped(bytes: Uint8Array, at = 0): Uint8Array {
  const copy = new Uint8Array(bytes);
  copy[at] = copy[at]! ^ 0x01;
  return copy;
}

describe("sealing a paper", () => {
  beforeEach(() => {
    settings.QUESTION_PAPER_KEY = KEY;
  });

  it("opens with the password it was sealed with", async () => {
    const { secret, paper } = await sealed();
    const opened = await openPaper({
      paperId: "paper-1",
      ownerId: "teacher-1",
      secret,
      password: PASSWORD,
      sealed: paper,
    });
    expect(Buffer.from(opened.pdf).toString()).toBe(
      Buffer.from(PDF).toString(),
    );
    expect(Buffer.from(opened.content!).toString()).toBe(
      Buffer.from(CONTENT).toString(),
    );
  });

  it("keeps an uploaded paper, which has no content, to its PDF", async () => {
    const { secret, paper } = await sealed({ content: null });
    expect(paper.contentNonce).toBeNull();
    expect(paper.contentCipher).toBeNull();
    const opened = await openPaper({
      paperId: "paper-1",
      ownerId: "teacher-1",
      secret,
      password: PASSWORD,
      sealed: paper,
    });
    expect(opened.content).toBeNull();
  });

  it("stores the scrypt cost and a fresh salt and nonce every time", async () => {
    const a = await sealed();
    const b = await sealed();
    expect(a.paper).toMatchObject({ kdfN: 32768, kdfR: 8, kdfP: 1 });
    expect(a.paper.kdfSalt).toHaveLength(16);
    expect(a.paper.pdfNonce).toHaveLength(12);
    expect(
      Buffer.from(a.paper.kdfSalt).equals(Buffer.from(b.paper.kdfSalt)),
    ).toBe(false);
    expect(
      Buffer.from(a.paper.pdfNonce).equals(Buffer.from(a.paper.contentNonce!)),
    ).toBe(false);
    // The ciphertext carries the 16-byte tag after the body.
    expect(a.paper.pdfCipher).toHaveLength(PDF.length + 16);
  });

  it("does not leave the paper readable in the ciphertext", async () => {
    const { paper } = await sealed();
    expect(Buffer.from(paper.pdfCipher).includes(Buffer.from("question"))).toBe(
      false,
    );
  });

  it("refuses the wrong password", async () => {
    const { secret, paper } = await sealed();
    await expect(
      openPaper({
        paperId: "paper-1",
        ownerId: "teacher-1",
        secret,
        password: "correct horse battery!",
        sealed: paper,
      }),
    ).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("refuses a ciphertext, a nonce or a tag with one byte changed", async () => {
    const { secret, paper } = await sealed();
    const open = (changed: Partial<typeof paper>) =>
      openPaper({
        paperId: "paper-1",
        ownerId: "teacher-1",
        secret,
        password: PASSWORD,
        sealed: { ...paper, ...changed },
      });
    const tagAt = paper.pdfCipher.length - 1;
    await expect(
      open({ pdfCipher: flipped(paper.pdfCipher, 0) }),
    ).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(
      open({ pdfCipher: flipped(paper.pdfCipher, tagAt) }),
    ).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(
      open({ pdfNonce: flipped(paper.pdfNonce) }),
    ).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(
      open({ contentCipher: flipped(paper.contentCipher!) }),
    ).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(
      open({ kdfSalt: flipped(paper.kdfSalt) }),
    ).rejects.toBeInstanceOf(WrongPasswordError);
    // Cut short, the tag is gone altogether.
    await expect(
      open({ pdfCipher: paper.pdfCipher.subarray(0, 10) }),
    ).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("refuses the PDF moved into the content's place", async () => {
    const { secret, paper } = await sealed();
    await expect(
      openPaper({
        paperId: "paper-1",
        ownerId: "teacher-1",
        secret,
        password: PASSWORD,
        sealed: {
          ...paper,
          contentNonce: paper.pdfNonce,
          contentCipher: paper.pdfCipher,
        },
      }),
    ).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("refuses a ciphertext moved to another paper or another owner", async () => {
    const { secret, paper } = await sealed();
    const base = { secret, password: PASSWORD, sealed: paper };
    await expect(
      openPaper({ ...base, paperId: "paper-2", ownerId: "teacher-1" }),
    ).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(
      openPaper({ ...base, paperId: "paper-1", ownerId: "teacher-2" }),
    ).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("refuses another teacher's secret, even with the right password", async () => {
    const { paper } = await sealed();
    await expect(
      openPaper({
        paperId: "paper-1",
        ownerId: "teacher-1",
        secret: new Uint8Array(randomBytes(32)),
        password: PASSWORD,
        sealed: paper,
      }),
    ).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("refuses a password shorter than 8 or longer than 200 characters", async () => {
    const seal = (password: string) =>
      sealPaper({
        paperId: "paper-1",
        ownerId: "teacher-1",
        secret: new Uint8Array(32),
        password,
        pdf: PDF,
        content: null,
      });
    await expect(seal("short")).rejects.toBeInstanceOf(TRPCError);
    await expect(seal("x".repeat(201))).rejects.toThrow(/8 to 200 characters/);
    await expect(seal("x".repeat(200))).resolves.toBeDefined();
  });

  it("treats a password typed with composed or separate accents as one", async () => {
    const { secret } = await sealed();
    const paper = await sealPaper({
      paperId: "paper-1",
      ownerId: "teacher-1",
      secret,
      password: "café au lait",
      pdf: PDF,
      content: null,
    });
    const opened = await openPaper({
      paperId: "paper-1",
      ownerId: "teacher-1",
      secret,
      password: "café au lait",
      sealed: paper,
    });
    expect(opened.pdf).toHaveLength(PDF.length);
  });
});

/** Just enough of Prisma's `paperKeyring` for `teacherSecret`, with its unique key. */
function fakeDb() {
  const rows = new Map<string, { userId: string; sealedSecret: string }>();
  let inserts = 0;
  const db = {
    paperKeyring: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        rows.get(where.userId) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { userId: string } }) => {
        const row = rows.get(where.userId);
        if (!row) throw new Error("not found");
        return row;
      },
      createMany: async ({
        data,
      }: {
        data: Array<{ userId: string; sealedSecret: string }>;
      }) => {
        let count = 0;
        for (const row of data) {
          if (rows.has(row.userId)) continue;
          rows.set(row.userId, row);
          inserts += 1;
          count += 1;
        }
        return { count };
      },
    },
  };
  return { db: db as unknown as Db, rows, inserts: () => inserts };
}

describe("a teacher's secret", () => {
  beforeEach(() => {
    settings.QUESTION_PAPER_KEY = KEY;
  });

  it("is made once and then reused", async () => {
    const { db, rows, inserts } = fakeDb();
    const first = await teacherSecret(db, "teacher-1");
    const again = await teacherSecret(db, "teacher-1");
    expect(first).toHaveLength(32);
    expect(Buffer.from(again).equals(Buffer.from(first))).toBe(true);
    expect(inserts()).toBe(1);
    // Sealed at rest, never the raw bytes.
    const stored = rows.get("teacher-1")!.sealedSecret;
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored).not.toContain(Buffer.from(first).toString("base64url"));
  });

  it("gives every teacher a different one", async () => {
    const { db } = fakeDb();
    const a = await teacherSecret(db, "teacher-1");
    const b = await teacherSecret(db, "teacher-2");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it("agrees on one secret when two requests make it at once", async () => {
    const { db, inserts } = fakeDb();
    const [a, b] = await Promise.all([
      teacherSecret(db, "teacher-1"),
      teacherSecret(db, "teacher-1"),
    ]);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(inserts()).toBe(1);
  });

  it("will not open one teacher's sealed secret for another", async () => {
    const { db, rows } = fakeDb();
    await teacherSecret(db, "teacher-1");
    rows.set("teacher-2", {
      userId: "teacher-2",
      sealedSecret: rows.get("teacher-1")!.sealedSecret,
    });
    await expect(teacherSecret(db, "teacher-2")).rejects.toThrow(
      /cannot be opened/,
    );
  });

  it("will not open under a different server key", async () => {
    const { db } = fakeDb();
    await teacherSecret(db, "teacher-1");
    settings.QUESTION_PAPER_KEY = Buffer.alloc(32, 1).toString("base64");
    await expect(teacherSecret(db, "teacher-1")).rejects.toThrow(
      /cannot be opened/,
    );
  });
});

describe("whether papers are on", () => {
  it("is on with a 32-byte key", () => {
    settings.QUESTION_PAPER_KEY = KEY;
    expect(papersEnabled()).toBe(true);
  });

  it("is off without the key", () => {
    settings.QUESTION_PAPER_KEY = undefined;
    expect(papersEnabled()).toBe(false);
  });

  it("is off with a key of the wrong length", () => {
    settings.QUESTION_PAPER_KEY = Buffer.alloc(16).toString("base64");
    expect(papersEnabled()).toBe(false);
  });
});
