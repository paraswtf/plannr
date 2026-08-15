-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'APPLIED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlanDecision" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateTable
CREATE TABLE "SchedulePlan" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "termId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "rootId" TEXT,
    "parentId" TEXT,
    "createdById" TEXT,
    "weekStart" DATE NOT NULL,
    "repeatUntil" DATE,
    "slotMinutes" INTEGER NOT NULL,
    "dayStartMinutes" INTEGER NOT NULL,
    "dayEndMinutes" INTEGER NOT NULL,
    "workingDays" INTEGER[],
    "maxPerDay" INTEGER NOT NULL DEFAULT 0,
    "spreadAcrossDays" BOOLEAN NOT NULL DEFAULT true,
    "respectLiveTimetable" BOOLEAN NOT NULL DEFAULT true,
    "sharedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "appliedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulePlanRequirement" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sessionsPerWeek" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "facultyIds" TEXT[],
    "requiredFeatures" "RoomFeature"[],
    "roomType" "RoomType",
    "minCapacity" INTEGER,
    "preferredRoomId" TEXT,
    "sourceLine" INTEGER,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SchedulePlanRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulePlanSession" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "requirementId" TEXT,
    "title" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "facultyIds" TEXT[],
    "dayOfWeek" INTEGER,
    "startMinutes" INTEGER,
    "durationMinutes" INTEGER NOT NULL,
    "roomId" TEXT,
    "reason" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "appliedEventId" TEXT,

    CONSTRAINT "SchedulePlanSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulePlanReviewer" (
    "planId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decision" "PlanDecision" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchedulePlanReviewer_pkey" PRIMARY KEY ("planId","userId")
);

-- CreateTable
CREATE TABLE "SchedulePlanComment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sessionId" TEXT,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchedulePlanComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchedulePlan_parentId_key" ON "SchedulePlan"("parentId");

-- CreateIndex
CREATE INDEX "SchedulePlan_orgId_status_idx" ON "SchedulePlan"("orgId", "status");

-- CreateIndex
CREATE INDEX "SchedulePlan_orgId_rootId_idx" ON "SchedulePlan"("orgId", "rootId");

-- CreateIndex
CREATE INDEX "SchedulePlan_createdById_idx" ON "SchedulePlan"("createdById");

-- CreateIndex
CREATE INDEX "SchedulePlanRequirement_planId_position_idx" ON "SchedulePlanRequirement"("planId", "position");

-- CreateIndex
CREATE INDEX "SchedulePlanRequirement_groupId_idx" ON "SchedulePlanRequirement"("groupId");

-- CreateIndex
CREATE INDEX "SchedulePlanSession_planId_dayOfWeek_startMinutes_idx" ON "SchedulePlanSession"("planId", "dayOfWeek", "startMinutes");

-- CreateIndex
CREATE INDEX "SchedulePlanSession_requirementId_idx" ON "SchedulePlanSession"("requirementId");

-- CreateIndex
CREATE INDEX "SchedulePlanSession_groupId_idx" ON "SchedulePlanSession"("groupId");

-- CreateIndex
CREATE INDEX "SchedulePlanReviewer_userId_idx" ON "SchedulePlanReviewer"("userId");

-- CreateIndex
CREATE INDEX "SchedulePlanComment_planId_createdAt_idx" ON "SchedulePlanComment"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "SchedulePlanComment_sessionId_idx" ON "SchedulePlanComment"("sessionId");

-- AddForeignKey
ALTER TABLE "SchedulePlan" ADD CONSTRAINT "SchedulePlan_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlan" ADD CONSTRAINT "SchedulePlan_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlan" ADD CONSTRAINT "SchedulePlan_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SchedulePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlan" ADD CONSTRAINT "SchedulePlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlanRequirement" ADD CONSTRAINT "SchedulePlanRequirement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SchedulePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlanRequirement" ADD CONSTRAINT "SchedulePlanRequirement_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlanRequirement" ADD CONSTRAINT "SchedulePlanRequirement_preferredRoomId_fkey" FOREIGN KEY ("preferredRoomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlanSession" ADD CONSTRAINT "SchedulePlanSession_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SchedulePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlanSession" ADD CONSTRAINT "SchedulePlanSession_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "SchedulePlanRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlanSession" ADD CONSTRAINT "SchedulePlanSession_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlanSession" ADD CONSTRAINT "SchedulePlanSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlanReviewer" ADD CONSTRAINT "SchedulePlanReviewer_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SchedulePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlanReviewer" ADD CONSTRAINT "SchedulePlanReviewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlanComment" ADD CONSTRAINT "SchedulePlanComment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SchedulePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlanComment" ADD CONSTRAINT "SchedulePlanComment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SchedulePlanSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulePlanComment" ADD CONSTRAINT "SchedulePlanComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

