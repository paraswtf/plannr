-- CreateEnum
CREATE TYPE "ScheduleFavouriteKind" AS ENUM ('PERSPECTIVE', 'PERSON');

-- CreateTable
CREATE TABLE "ScheduleFavourite" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ScheduleFavouriteKind" NOT NULL,
    "subject" TEXT NOT NULL,
    "personId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleFavourite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleFavourite_userId_createdAt_idx" ON "ScheduleFavourite"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleFavourite_personId_idx" ON "ScheduleFavourite"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleFavourite_userId_kind_subject_key" ON "ScheduleFavourite"("userId", "kind", "subject");

-- AddForeignKey
ALTER TABLE "ScheduleFavourite" ADD CONSTRAINT "ScheduleFavourite_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleFavourite" ADD CONSTRAINT "ScheduleFavourite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleFavourite" ADD CONSTRAINT "ScheduleFavourite_personId_fkey" FOREIGN KEY ("personId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
