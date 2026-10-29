import { TRPCError } from "@trpc/server";

import { DEFAULT_TIMEZONE, formatHourLabel } from "~/lib/dates";
import type { AccessContext } from "../assignments/access";
import type { Db } from "../occurrences";
import {
  openPaper,
  papersEnabled,
  teacherSecret,
  WrongPasswordError,
  type SealedPaper,
} from "./crypto";

/**
 * Opening a question paper with its owner's password, and the lockout that
 * keeps anybody from guessing it.
 *
 * Every procedure that takes a paper's password comes through here, so the
 * rules are the same whichever screen asked: only the owner, never while the
 * paper is locked, and five wrong tries in a row lock it for fifteen minutes.
 */

/** Wrong passwords in a row before the paper is locked. */
export const UNLOCK_ATTEMPTS = 5;
/** How long a paper stays locked after too many wrong passwords. */
export const LOCK_MS = 15 * 60_000;

/**
 * How long after a try took the last of the five a lock may be taken as never
 * coming. The request that took it writes the lock within a second or two of
 * scrypt; one that has gone quiet for longer than any request may run (60
 * seconds) has died on the way, and nothing else would ever clear its count.
 */
export const STUCK_COUNT_MS = 90_000;

/** The message for anybody but the owner, whatever their permissions. */
export const NOT_OWNER_MESSAGE =
  "Only the teacher who set this paper can open it.";

/** Refuses every paper procedure on a server without a paper key. */
export function requirePapers() {
  if (!papersEnabled()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Question papers are not set up on this server. Ask whoever runs Plannr to set the question paper key.",
    });
  }
}

/**
 * The paper's owner, signed in at a browser, and nobody else. A paper whose
 * owner's account was deleted has no owner: its teacher's secret went with the
 * account, so nobody can ever open it again.
 */
export function requireOwner<P extends { ownerId: string | null }>(
  ctx: Pick<AccessContext, "actor">,
  paper: P,
): asserts paper is P & { ownerId: string } {
  if (paper.ownerId === null) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "The teacher who set this paper no longer has an account, so nobody can open it. What students were shown stays with their answers.",
    });
  }
  // A personal API key carries its owner's id, but a password typed into a
  // script is not the person at the paper, so even their own key is refused.
  if (paper.ownerId !== ctx.actor.id || ctx.actor.kind !== "user") {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_OWNER_MESSAGE });
  }
}

export async function orgTimezone(db: Db, orgId: string) {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true },
  });
  return org?.timezone ?? DEFAULT_TIMEZONE;
}

function lockedError(until: Date, timeZone: string) {
  return new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: `Too many wrong passwords. Try again at ${formatHourLabel(until, timeZone)}.`,
  });
}

/**
 * Opens the paper for its owner, counting wrong passwords.
 *
 * Writes through `ctx.db`, never a transaction, and must be called outside
 * one: a wrong password ends in a thrown error, and the count it made has to
 * survive that, or the lockout would never lock.
 */
export async function openForOwner(
  ctx: Pick<AccessContext, "db" | "orgId" | "actor">,
  paperId: string,
  password: string,
): Promise<{
  pdf: Uint8Array;
  content: Uint8Array | null;
  /**
   * The salt of the sealed copy that was opened. A sealing is never reused,
   * so a write conditional on it fails when the paper was re-sealed since.
   */
  kdfSalt: Uint8Array<ArrayBuffer>;
}> {
  requirePapers();
  // Read again rather than trusting a row the caller loaded earlier: the lock
  // may have been set by another attempt since.
  const paper = await ctx.db.questionPaper.findUnique({
    where: { id: paperId },
  });
  if (!paper) throw new TRPCError({ code: "NOT_FOUND" });
  requireOwner(ctx, paper);

  // Each attempt takes one of the five tries before scrypt runs, in one
  // conditional statement. Checking the lock and counting afterwards would let
  // a burst of guesses sent together all pass the check before any of them
  // was counted. A locked paper is refused here and costs the server nothing.
  const now = new Date();
  const reserved = await ctx.db.questionPaper.updateMany({
    where: {
      id: paper.id,
      failedUnlocks: { lt: UNLOCK_ATTEMPTS },
      OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
    },
    data: { failedUnlocks: { increment: 1 } },
  });
  if (reserved.count === 0) {
    // All five tries are taken and no lock is running. Either the fifth try is
    // still running scrypt and will write the lock itself, or the request that
    // took it died before it could (a dropped connection, a deploy, the
    // function's time limit). In the second case nothing would ever clear the
    // count, so once it has gone quiet the lock it never wrote is written now,
    // and the paper opens again when that lock ends.
    await ctx.db.questionPaper.updateMany({
      where: {
        id: paper.id,
        failedUnlocks: { gte: UNLOCK_ATTEMPTS },
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
        updatedAt: { lt: new Date(now.getTime() - STUCK_COUNT_MS) },
      },
      data: {
        failedUnlocks: 0,
        lockedUntil: new Date(now.getTime() + LOCK_MS),
      },
    });
    const current = await ctx.db.questionPaper.findUnique({
      where: { id: paper.id },
      select: { lockedUntil: true },
    });
    // The fifth try may still be running and not have written the lock yet.
    const until =
      current?.lockedUntil && current.lockedUntil > now
        ? current.lockedUntil
        : new Date(now.getTime() + LOCK_MS);
    throw lockedError(until, await orgTimezone(ctx.db, ctx.orgId));
  }

  const sealed: SealedPaper = {
    kdfSalt: paper.kdfSalt,
    kdfN: paper.kdfN,
    kdfR: paper.kdfR,
    kdfP: paper.kdfP,
    pdfNonce: paper.pdfNonce,
    pdfCipher: paper.pdfCipher,
    contentNonce: paper.contentNonce,
    contentCipher: paper.contentCipher,
  };

  try {
    const opened = await openPaper({
      paperId: paper.id,
      ownerId: paper.ownerId,
      secret: await teacherSecret(ctx.db, paper.ownerId),
      password,
      sealed,
    });
    await ctx.db.questionPaper.update({
      where: { id: paper.id },
      data: { failedUnlocks: 0, lockedUntil: null },
    });
    return { ...opened, kdfSalt: new Uint8Array(paper.kdfSalt) };
  } catch (error) {
    if (!(error instanceof WrongPasswordError)) {
      // Not a guess: give the try back, so a server fault never locks a paper.
      await ctx.db.questionPaper.updateMany({
        where: { id: paper.id, failedUnlocks: { gt: 0 } },
        data: { failedUnlocks: { decrement: 1 } },
      });
      throw error;
    }

    const counted = await ctx.db.questionPaper.findUniqueOrThrow({
      where: { id: paper.id },
      select: { failedUnlocks: true },
    });
    if (counted.failedUnlocks >= UNLOCK_ATTEMPTS) {
      const until = new Date(Date.now() + LOCK_MS);
      await ctx.db.questionPaper.update({
        where: { id: paper.id },
        data: { failedUnlocks: 0, lockedUntil: until },
      });
      throw lockedError(until, await orgTimezone(ctx.db, ctx.orgId));
    }
    const left = UNLOCK_ATTEMPTS - counted.failedUnlocks;
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `That password does not open this paper. Check it and try again (${left} ${left === 1 ? "try" : "tries"} left before it locks for 15 minutes).`,
    });
  }
}
