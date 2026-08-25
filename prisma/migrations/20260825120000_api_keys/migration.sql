-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isServiceAccount" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "scopes" BIGINT NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 120,
    "windowStartedAt" TIMESTAMP(3),
    "windowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_principalId_key" ON "ApiKey"("principalId");

-- CreateIndex
CREATE INDEX "ApiKey_orgId_createdAt_idx" ON "ApiKey"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiKey_orgId_revokedAt_idx" ON "ApiKey"("orgId", "revokedAt");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

