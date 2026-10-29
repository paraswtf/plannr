import {
  createCipheriv,
  createDecipheriv,
  hkdf,
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

import { TRPCError } from "@trpc/server";

import { env } from "~/env";
import type { Db } from "../occurrences";

/**
 * Sealing question papers so that only the teacher who set one can open it.
 *
 * Two things are needed to open a paper, and nobody but its teacher has both:
 *
 * - the password the teacher chose, which is never stored, logged or sent
 *   anywhere but into scrypt;
 * - the teacher's own 32-byte secret, kept in `PaperKeyring` sealed under the
 *   server's `QUESTION_PAPER_KEY`.
 *
 * A database dump alone therefore opens nothing (the secrets are sealed), and
 * the server key alone opens nothing either (the password is missing). An
 * administrator who knows a teacher's password still cannot use it from their
 * own account, because the routers only ever fetch the secret of the paper's
 * owner for the owner.
 *
 * The paper key is HKDF-SHA256 over scrypt(password), salted with the
 * teacher's secret, with the paper's id in the info, so every paper has its own
 * key even when a teacher reuses a password. Each blob is AES-256-GCM with its
 * own nonce and `<paperId>:<ownerId>:<blob>` as additional data, so a
 * ciphertext copied onto another paper, another owner or the other column
 * fails to open instead of decrypting.
 */

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const SALT_BYTES = 16;

/** The scrypt cost every new paper is sealed with. */
const KDF = { N: 32768, r: 8, p: 1 } as const;
/**
 * scrypt needs 128 * N * r bytes, 32 MiB at the cost above. The cap is twice
 * that, which also bounds what a tampered row can make the server allocate.
 */
const KDF_MAXMEM = 64 * 1024 * 1024;

export const PAPER_PASSWORD_MIN = 8;
export const PAPER_PASSWORD_MAX = 200;

const KEYRING_VERSION = "v1";

// ─── The server key and the keyring ─────────────────────────────────────────

/**
 * The server key, decoded and checked.
 *
 * Read on every call rather than at module load, as calendar/crypto.ts does
 * for its own key: a deployment without question papers must still import
 * this module, and anything that reaches for the key without one gets a
 * precise error rather than a zero key.
 */
function serverKey(): Buffer {
  const raw = env.QUESTION_PAPER_KEY;
  if (!raw) {
    throw new Error(
      "QUESTION_PAPER_KEY is not set, so question papers cannot be sealed or " +
        "opened. Generate one with `openssl rand -base64 32`.",
    );
  }
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== KEY_BYTES) {
    throw new Error(
      `QUESTION_PAPER_KEY must decode to ${KEY_BYTES} bytes, got ${decoded.length}. ` +
        "Generate one with `openssl rand -base64 32`.",
    );
  }
  return decoded;
}

/** Whether this deployment can seal papers at all. */
export function papersEnabled(): boolean {
  try {
    serverKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * The additional data a keyring row is sealed with. It names the user, so a
 * sealed secret copied onto somebody else's row fails to open rather than
 * handing them the first teacher's papers.
 */
const keyringAad = (userId: string) =>
  Buffer.from(`plannr/paper-keyring/${KEYRING_VERSION}/${userId}`, "utf8");

function sealSecret(userId: string, secret: Buffer): string {
  const iv = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", serverKey(), iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(keyringAad(userId));
  const body = Buffer.concat([cipher.update(secret), cipher.final()]);
  return [
    KEYRING_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

function openSecret(userId: string, sealed: string): Buffer {
  const parts = sealed.split(".");
  if (parts.length !== 4) {
    throw new Error("A paper keyring entry is malformed.");
  }
  const [version, iv, tag, body] = parts as [string, string, string, string];
  // Compared byte-wise so a later version cannot be talked into the v1 path by
  // somebody who can write to the column.
  const expected = Buffer.from(KEYRING_VERSION);
  const given = Buffer.from(version);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new Error(`Unknown paper keyring version: ${version}`);
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      serverKey(),
      Buffer.from(iv, "base64url"),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAAD(keyringAad(userId));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const secret = Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]);
    if (secret.length !== KEY_BYTES) throw new Error("wrong length");
    return secret;
  } catch {
    // Not a wrong password: the server key changed, or the row was edited.
    // Either way nobody can open this teacher's papers any more, and making a
    // new secret here would hide that by quietly locking them out for good.
    throw new Error(
      "This teacher's paper keyring cannot be opened with the current " +
        "QUESTION_PAPER_KEY. Restore the key it was sealed with.",
    );
  }
}

/** The teacher's own secret, made and sealed the first time it is needed. */
export async function teacherSecret(
  db: Db,
  userId: string,
): Promise<Uint8Array> {
  const existing = await db.paperKeyring.findUnique({
    where: { userId },
    select: { sealedSecret: true },
  });
  if (existing) return openSecret(userId, existing.sealedSecret);

  // Two first requests can arrive together (an upload and a preview, say).
  // ON CONFLICT DO NOTHING lets both try without either failing, and a caught
  // unique violation would abort the caller's transaction in Postgres, which
  // `create` plus a catch would do. Whichever row won is the secret; the
  // loser's random bytes are thrown away before they were ever used.
  await db.paperKeyring.createMany({
    data: [
      { userId, sealedSecret: sealSecret(userId, randomBytes(KEY_BYTES)) },
    ],
    skipDuplicates: true,
  });
  const row = await db.paperKeyring.findUniqueOrThrow({
    where: { userId },
    select: { sealedSecret: true },
  });
  return openSecret(userId, row.sealedSecret);
}

// ─── Papers ─────────────────────────────────────────────────────────────────

/** Raised for a password that does not open the paper. Nothing else is said. */
export class WrongPasswordError extends Error {
  constructor() {
    super("That password does not open this paper.");
    this.name = "WrongPasswordError";
  }
}

/** The stored half of a sealed paper, column for column. */
export interface SealedPaper {
  kdfSalt: Uint8Array;
  kdfN: number;
  kdfR: number;
  kdfP: number;
  pdfNonce: Uint8Array;
  pdfCipher: Uint8Array;
  contentNonce: Uint8Array | null;
  contentCipher: Uint8Array | null;
}

/**
 * The password as scrypt sees it. NFC, so the same password typed on a phone
 * and on a laptop (which may compose accents differently) is the same bytes.
 * Changing this would make every sealed paper unopenable, so it never changes.
 */
const passwordBytes = (password: string) =>
  Buffer.from(password.normalize("NFC"), "utf8");

function checkPassword(password: string) {
  const length = Array.from(password.normalize("NFC")).length;
  if (length < PAPER_PASSWORD_MIN || length > PAPER_PASSWORD_MAX) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `A paper's password must be ${PAPER_PASSWORD_MIN} to ${PAPER_PASSWORD_MAX} characters long. Choose one in that range.`,
    });
  }
}

function scryptAsync(
  password: Buffer,
  salt: Uint8Array,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_BYTES, options, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

function hkdfAsync(
  ikm: Buffer,
  salt: Uint8Array,
  info: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    hkdf("sha256", ikm, salt, info, KEY_BYTES, (err, key) =>
      err ? reject(err) : resolve(Buffer.from(key)),
    ),
  );
}

async function paperKey(args: {
  paperId: string;
  secret: Uint8Array;
  password: string;
  salt: Uint8Array;
  kdf: { N: number; r: number; p: number };
}): Promise<Buffer> {
  if (args.secret.length !== KEY_BYTES) {
    throw new Error("A teacher's paper secret must be 32 bytes.");
  }
  const stretched = await scryptAsync(passwordBytes(args.password), args.salt, {
    ...args.kdf,
    maxmem: KDF_MAXMEM,
  });
  try {
    return await hkdfAsync(
      stretched,
      args.secret,
      `plannr/question-paper/v1/${args.paperId}`,
    );
  } finally {
    stretched.fill(0);
  }
}

const blobAad = (paperId: string, ownerId: string, blob: "pdf" | "content") =>
  Buffer.from(`${paperId}:${ownerId}:${blob}`, "utf8");

function encryptBlob(key: Buffer, aad: Buffer, plaintext: Uint8Array) {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(aad);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    nonce: new Uint8Array(nonce),
    cipher: new Uint8Array(Buffer.concat([body, cipher.getAuthTag()])),
  };
}

function decryptBlob(
  key: Buffer,
  aad: Buffer,
  nonce: Uint8Array,
  sealed: Uint8Array,
): Uint8Array {
  // Every way this can go wrong is the same answer to the person typing: the
  // password did not open the paper. Saying which check failed would tell
  // somebody probing the paper more than they need.
  if (nonce.length !== NONCE_BYTES || sealed.length < TAG_BYTES) {
    throw new WrongPasswordError();
  }
  try {
    const body = sealed.subarray(0, sealed.length - TAG_BYTES);
    const tag = sealed.subarray(sealed.length - TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return new Uint8Array(
      Buffer.concat([decipher.update(body), decipher.final()]),
    );
  } catch {
    throw new WrongPasswordError();
  }
}

/** Seals a paper's PDF and, for one written in Plannr, its content. */
export async function sealPaper(args: {
  paperId: string;
  ownerId: string;
  secret: Uint8Array;
  password: string;
  pdf: Uint8Array;
  content: Uint8Array | null;
}): Promise<SealedPaper> {
  checkPassword(args.password);
  const salt = new Uint8Array(randomBytes(SALT_BYTES));
  const key = await paperKey({ ...args, salt, kdf: KDF });
  try {
    const pdf = encryptBlob(
      key,
      blobAad(args.paperId, args.ownerId, "pdf"),
      args.pdf,
    );
    const content = args.content
      ? encryptBlob(
          key,
          blobAad(args.paperId, args.ownerId, "content"),
          args.content,
        )
      : null;
    return {
      kdfSalt: salt,
      kdfN: KDF.N,
      kdfR: KDF.r,
      kdfP: KDF.p,
      pdfNonce: pdf.nonce,
      pdfCipher: pdf.cipher,
      contentNonce: content?.nonce ?? null,
      contentCipher: content?.cipher ?? null,
    };
  } finally {
    key.fill(0);
  }
}

/**
 * The scrypt cost a stored paper names, if it is one this code could have
 * written. A row edited to ask for more would only make the server spend
 * memory; one asking for less would weaken nothing that is not already lost.
 */
function storedKdf(sealed: SealedPaper) {
  const { kdfN: N, kdfR: r, kdfP: p } = sealed;
  const powerOfTwo = Number.isInteger(N) && N >= 2 && (N & (N - 1)) === 0;
  if (
    !powerOfTwo ||
    N > 65536 ||
    !Number.isInteger(r) ||
    r < 1 ||
    r > 16 ||
    !Number.isInteger(p) ||
    p < 1 ||
    p > 4 ||
    128 * N * r > KDF_MAXMEM
  ) {
    throw new Error(
      "This paper's stored key settings are not ones Plannr uses.",
    );
  }
  return { N, r, p };
}

/** Opens a sealed paper. Throws `WrongPasswordError` for a wrong password. */
export async function openPaper(args: {
  paperId: string;
  ownerId: string;
  secret: Uint8Array;
  password: string;
  sealed: SealedPaper;
}): Promise<{ pdf: Uint8Array; content: Uint8Array | null }> {
  const { sealed } = args;
  // A password outside the rules was never one a paper was sealed with.
  const length = Array.from(args.password.normalize("NFC")).length;
  if (length < PAPER_PASSWORD_MIN || length > PAPER_PASSWORD_MAX) {
    throw new WrongPasswordError();
  }
  if ((sealed.contentNonce === null) !== (sealed.contentCipher === null)) {
    throw new Error("This paper's stored content is incomplete.");
  }
  const key = await paperKey({
    ...args,
    salt: sealed.kdfSalt,
    kdf: storedKdf(sealed),
  });
  try {
    const pdf = decryptBlob(
      key,
      blobAad(args.paperId, args.ownerId, "pdf"),
      sealed.pdfNonce,
      sealed.pdfCipher,
    );
    const content =
      sealed.contentNonce && sealed.contentCipher
        ? decryptBlob(
            key,
            blobAad(args.paperId, args.ownerId, "content"),
            sealed.contentNonce,
            sealed.contentCipher,
          )
        : null;
    return { pdf, content };
  } finally {
    key.fill(0);
  }
}
