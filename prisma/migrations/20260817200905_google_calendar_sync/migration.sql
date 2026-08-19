-- CreateEnum
CREATE TYPE "CalendarSyncStatus" AS ENUM ('ACTIVE', 'REVOKED', 'PAUSED');

-- CreateEnum
CREATE TYPE "CalendarTaskStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "googleSub" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "accessExpiresAt" TIMESTAMP(3),
    "calendarId" TEXT,
    "status" "CalendarSyncStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarMirror" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "originalStart" TIMESTAMP(3) NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarMirror_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSyncTask" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "CalendarTaskStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarSyncTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_userId_key" ON "CalendarConnection"("userId");

-- CreateIndex
CREATE INDEX "CalendarConnection_status_syncedAt_idx" ON "CalendarConnection"("status", "syncedAt");

-- CreateIndex
CREATE INDEX "CalendarConnection_orgId_idx" ON "CalendarConnection"("orgId");

-- CreateIndex
CREATE INDEX "CalendarMirror_connectionId_idx" ON "CalendarMirror"("connectionId");

-- CreateIndex
CREATE INDEX "CalendarMirror_eventId_idx" ON "CalendarMirror"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarMirror_connectionId_eventId_originalStart_key" ON "CalendarMirror"("connectionId", "eventId", "originalStart");

-- CreateIndex
CREATE INDEX "CalendarSyncTask_status_nextAttemptAt_idx" ON "CalendarSyncTask"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSyncTask_connectionId_eventId_key" ON "CalendarSyncTask"("connectionId", "eventId");

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarMirror" ADD CONSTRAINT "CalendarMirror_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncTask" ADD CONSTRAINT "CalendarSyncTask_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
