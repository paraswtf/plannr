-- CreateEnum
CREATE TYPE "RequestScope" AS ENUM ('OCCURRENCE', 'FOLLOWING', 'SERIES');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "decisionNote" TEXT;

-- CreateTable
CREATE TABLE "EventChangeRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "scope" "RequestScope" NOT NULL DEFAULT 'SERIES',
    "originalStart" TIMESTAMP(3),
    "newRoomId" TEXT,
    "newStartTime" TIMESTAMP(3),
    "newEndTime" TIMESTAMP(3),
    "newTitle" TEXT,
    "cancelling" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventChangeRequest_orgId_status_createdAt_idx" ON "EventChangeRequest"("orgId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EventChangeRequest_eventId_status_idx" ON "EventChangeRequest"("eventId", "status");

-- CreateIndex
CREATE INDEX "EventChangeRequest_requestedById_status_idx" ON "EventChangeRequest"("requestedById", "status");

-- AddForeignKey
ALTER TABLE "EventChangeRequest" ADD CONSTRAINT "EventChangeRequest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChangeRequest" ADD CONSTRAINT "EventChangeRequest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChangeRequest" ADD CONSTRAINT "EventChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChangeRequest" ADD CONSTRAINT "EventChangeRequest_newRoomId_fkey" FOREIGN KEY ("newRoomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChangeRequest" ADD CONSTRAINT "EventChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
