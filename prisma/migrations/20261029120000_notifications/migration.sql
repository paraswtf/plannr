-- Notifications: a per-person inbox, and what each item still owes that
-- person's devices by push. Class changes used to go straight from
-- ClassChangeNotice to phones; now each notice is fanned out to a row per
-- person first, so it can be read, cleared and switched off by category.

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('CLASS_CHANGES', 'REQUESTS', 'APPROVALS', 'PLAN_REVIEWS');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceKey" TEXT,
    "inInbox" BOOLEAN NOT NULL DEFAULT true,
    "readAt" TIMESTAMP(3),
    "pushPending" BOOLEAN NOT NULL DEFAULT false,
    "pushClaimedAt" TIMESTAMP(3),
    "pushAttempts" INTEGER NOT NULL DEFAULT 0,
    "pushedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "push" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId","category")
);

-- CreateIndex
CREATE INDEX "Notification_userId_inInbox_createdAt_idx" ON "Notification"("userId", "inInbox", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_pushPending_createdAt_idx" ON "Notification"("pushPending", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_sourceKey_key" ON "Notification"("userId", "sourceKey");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

