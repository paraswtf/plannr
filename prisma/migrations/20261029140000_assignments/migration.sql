-- Assignments: tests and presentations set for a group, the sittings they are
-- pinned to (through an EventException, so a series split carries them), the
-- teams of a presentation, question papers sealed so that only the teacher who
-- set them can open them, the pages of a paper once it is opened to students,
-- and students' answers and marks. Also the institution's document header and
-- footer for papers, and a notification category for all of it.

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('PRESENTATION', 'CLASS_TEST_ONLINE', 'CLASS_TEST_OFFLINE', 'CLASS_TEST_IN_APP_OFFLINE');

-- CreateEnum
CREATE TYPE "QuestionPaperSource" AS ENUM ('UPLOAD', 'AUTHORED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'ASSIGNMENTS';

-- AlterTable
ALTER TABLE "OrgSettings" ADD COLUMN     "documentFooter" TEXT,
ADD COLUMN     "documentHeader" TEXT,
ADD COLUMN     "documentLogo" BYTEA,
ADD COLUMN     "documentLogoType" TEXT;

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "AssignmentType" NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "groupId" TEXT NOT NULL,
    "courseId" TEXT,
    "semesterId" TEXT,
    "createdById" TEXT,
    "durationMinutes" INTEGER,
    "windowStart" DATE,
    "windowEnd" DATE,
    "minutesPerTeam" INTEGER,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "marksPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentSitting" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "exceptionId" TEXT,
    "originalStart" TIMESTAMP(3) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "scheduledForIt" BOOLEAN NOT NULL DEFAULT false,
    "teamId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentSitting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresentationTeam" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "topic" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PresentationTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresentationTeamMember" (
    "teamId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,

    CONSTRAINT "PresentationTeamMember_pkey" PRIMARY KEY ("teamId","studentId")
);

-- CreateTable
CREATE TABLE "PaperKeyring" (
    "userId" TEXT NOT NULL,
    "sealedSecret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperKeyring_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "QuestionPaper" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "ownerId" TEXT,
    "source" "QuestionPaperSource" NOT NULL,
    "kdfSalt" BYTEA NOT NULL,
    "kdfN" INTEGER NOT NULL,
    "kdfR" INTEGER NOT NULL,
    "kdfP" INTEGER NOT NULL,
    "pdfNonce" BYTEA NOT NULL,
    "pdfCipher" BYTEA NOT NULL,
    "contentNonce" BYTEA,
    "contentCipher" BYTEA,
    "fileName" TEXT,
    "byteSize" INTEGER NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "sheet" JSONB NOT NULL,
    "totalMarks" DOUBLE PRECISION NOT NULL,
    "failedUnlocks" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releasedPdf" BYTEA,
    "releasedQuestions" JSONB,
    "answerKey" JSONB,
    "answersCloseAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionPaperPage" (
    "paperId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "svg" BYTEA NOT NULL,

    CONSTRAINT "QuestionPaperPage_pkey" PRIMARY KEY ("paperId","number")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "answers" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "marks" JSONB,
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "markedById" TEXT,
    "markedAt" TIMESTAMP(3),

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assignment_orgId_endsAt_idx" ON "Assignment"("orgId", "endsAt");

-- CreateIndex
CREATE INDEX "Assignment_createdById_endsAt_idx" ON "Assignment"("createdById", "endsAt");

-- CreateIndex
CREATE INDEX "Assignment_groupId_endsAt_idx" ON "Assignment"("groupId", "endsAt");

-- CreateIndex
CREATE INDEX "AssignmentSitting_assignmentId_idx" ON "AssignmentSitting"("assignmentId");

-- CreateIndex
CREATE INDEX "AssignmentSitting_exceptionId_idx" ON "AssignmentSitting"("exceptionId");

-- CreateIndex
CREATE INDEX "AssignmentSitting_teamId_idx" ON "AssignmentSitting"("teamId");

-- CreateIndex
CREATE INDEX "PresentationTeam_assignmentId_position_idx" ON "PresentationTeam"("assignmentId", "position");

-- CreateIndex
CREATE INDEX "PresentationTeamMember_studentId_idx" ON "PresentationTeamMember"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "PresentationTeamMember_assignmentId_studentId_key" ON "PresentationTeamMember"("assignmentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionPaper_assignmentId_key" ON "QuestionPaper"("assignmentId");

-- CreateIndex
CREATE INDEX "Submission_studentId_idx" ON "Submission"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_assignmentId_studentId_key" ON "Submission"("assignmentId", "studentId");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSitting" ADD CONSTRAINT "AssignmentSitting_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSitting" ADD CONSTRAINT "AssignmentSitting_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "EventException"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSitting" ADD CONSTRAINT "AssignmentSitting_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "PresentationTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationTeam" ADD CONSTRAINT "PresentationTeam_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationTeamMember" ADD CONSTRAINT "PresentationTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "PresentationTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationTeamMember" ADD CONSTRAINT "PresentationTeamMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperKeyring" ADD CONSTRAINT "PaperKeyring_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPaper" ADD CONSTRAINT "QuestionPaper_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPaper" ADD CONSTRAINT "QuestionPaper_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPaperPage" ADD CONSTRAINT "QuestionPaperPage_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "QuestionPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The two new permission bits, granted to the built-in roles the way
-- 20261022120000_students_cannot_book_rooms changed one: with a bitwise OR, so
-- anything granted to these roles by hand survives, and assuming no earlier
-- bit is present. Administrators need nothing: Administrator implies every
-- flag, present and future.
--   ManageOwnAssignments = 1 << 53 = 9007199254740992
--   ManageAllAssignments = 1 << 54 = 18014398509481984
UPDATE "Role"
SET "permissions" = "permissions" | 9007199254740992::bigint
WHERE "key" = 'faculty' AND "isSystem" = true;

UPDATE "Role"
SET "permissions" = "permissions" | 18014398509481984::bigint
WHERE "key" = 'coordinator' AND "isSystem" = true;
