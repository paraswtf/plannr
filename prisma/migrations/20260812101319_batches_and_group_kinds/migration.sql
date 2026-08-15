-- CreateEnum
CREATE TYPE "GroupKind" AS ENUM ('DIVISION', 'MAJOR', 'MINOR', 'SUBJECT', 'OTHER');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "kind" "GroupKind" NOT NULL DEFAULT 'DIVISION';

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Batch_orgId_courseId_idx" ON "Batch"("orgId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_orgId_name_key" ON "Batch"("orgId", "name");

-- CreateIndex
CREATE INDEX "Group_batchId_idx" ON "Group"("batchId");

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
