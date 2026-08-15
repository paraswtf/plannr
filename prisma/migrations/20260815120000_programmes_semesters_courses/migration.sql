-- Renames what the app calls things, and gives a lecture a subject to belong to.
--
-- "Course" used to mean BCA or BBA-IT; it now means one subject, e.g. Deep
-- Learning. So the old table becomes Programme and the name is freed for the
-- new one. "Term" becomes "Semester", which is what the college calls it and
-- what everything per-semester now hangs off.
--
-- Every statement here is a rename or an addition. Nothing is dropped and no
-- row is rewritten: the 442 students, 1,100 events, 10,908 occurrences and 57
-- groups already in this database come through untouched.

-- ─── Course → Programme ─────────────────────────────────────────────────────

ALTER TABLE "Course" RENAME TO "Programme";
ALTER TABLE "Programme" RENAME CONSTRAINT "Course_pkey" TO "Programme_pkey";
ALTER TABLE "Programme" RENAME CONSTRAINT "Course_orgId_fkey" TO "Programme_orgId_fkey";
ALTER INDEX "Course_orgId_code_key" RENAME TO "Programme_orgId_code_key";

ALTER TABLE "Batch" RENAME COLUMN "courseId" TO "programmeId";
ALTER TABLE "Batch" RENAME CONSTRAINT "Batch_courseId_fkey" TO "Batch_programmeId_fkey";
ALTER INDEX "Batch_orgId_courseId_idx" RENAME TO "Batch_orgId_programmeId_idx";

ALTER TABLE "Group" RENAME COLUMN "courseId" TO "programmeId";
ALTER TABLE "Group" RENAME CONSTRAINT "Group_courseId_fkey" TO "Group_programmeId_fkey";

-- ─── Term → Semester ────────────────────────────────────────────────────────

ALTER TABLE "Term" RENAME TO "Semester";
ALTER TABLE "Semester" RENAME CONSTRAINT "Term_pkey" TO "Semester_pkey";
ALTER TABLE "Semester" RENAME CONSTRAINT "Term_orgId_fkey" TO "Semester_orgId_fkey";
ALTER INDEX "Term_orgId_name_key" RENAME TO "Semester_orgId_name_key";

ALTER TABLE "Group" RENAME COLUMN "termId" TO "semesterId";
ALTER TABLE "Group" RENAME CONSTRAINT "Group_termId_fkey" TO "Group_semesterId_fkey";
ALTER INDEX "Group_courseId_termId_name_key" RENAME TO "Group_programmeId_semesterId_name_key";

ALTER TABLE "Event" RENAME COLUMN "termId" TO "semesterId";
ALTER TABLE "Event" RENAME CONSTRAINT "Event_termId_fkey" TO "Event_semesterId_fkey";
ALTER INDEX "Event_termId_idx" RENAME TO "Event_semesterId_idx";

ALTER TABLE "SchedulePlan" RENAME COLUMN "termId" TO "semesterId";
ALTER TABLE "SchedulePlan" RENAME CONSTRAINT "SchedulePlan_termId_fkey" TO "SchedulePlan_semesterId_fkey";

ALTER TABLE "OrgSettings" RENAME COLUMN "activeTermId" TO "activeSemesterId";

-- ─── Which semester number a batch is in, in a given semester ───────────────

CREATE TABLE "BatchSemester" (
    "batchId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "number" TEXT NOT NULL,

    CONSTRAINT "BatchSemester_pkey" PRIMARY KEY ("batchId","semesterId")
);

CREATE INDEX "BatchSemester_semesterId_idx" ON "BatchSemester"("semesterId");

ALTER TABLE "BatchSemester" ADD CONSTRAINT "BatchSemester_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatchSemester" ADD CONSTRAINT "BatchSemester_semesterId_fkey"
    FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Course, meaning a subject ──────────────────────────────────────────────

CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "programmeId" TEXT,
    "code" TEXT,
    "title" TEXT NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Course_orgId_idx" ON "Course"("orgId");
CREATE INDEX "Course_semesterId_idx" ON "Course"("semesterId");
CREATE UNIQUE INDEX "Course_semesterId_programmeId_title_key"
    ON "Course"("semesterId", "programmeId", "title");

ALTER TABLE "Course" ADD CONSTRAINT "Course_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Course" ADD CONSTRAINT "Course_semesterId_fkey"
    FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Course" ADD CONSTRAINT "Course_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Who may teach it: several per course, one chosen when a lecture is scheduled.
CREATE TABLE "CourseFaculty" (
    "courseId" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseFaculty_pkey" PRIMARY KEY ("courseId","facultyId")
);

CREATE INDEX "CourseFaculty_facultyId_idx" ON "CourseFaculty"("facultyId");

ALTER TABLE "CourseFaculty" ADD CONSTRAINT "CourseFaculty_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseFaculty" ADD CONSTRAINT "CourseFaculty_facultyId_fkey"
    FOREIGN KEY ("facultyId") REFERENCES "FacultyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Which courses a group takes. A student's courses follow from this.
CREATE TABLE "GroupCourse" (
    "groupId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupCourse_pkey" PRIMARY KEY ("groupId","courseId")
);

CREATE INDEX "GroupCourse_courseId_idx" ON "GroupCourse"("courseId");

ALTER TABLE "GroupCourse" ADD CONSTRAINT "GroupCourse_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupCourse" ADD CONSTRAINT "GroupCourse_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── A lecture teaches a course ─────────────────────────────────────────────

ALTER TABLE "Event" ADD COLUMN "courseId" TEXT;
CREATE INDEX "Event_courseId_idx" ON "Event"("courseId");
ALTER TABLE "Event" ADD CONSTRAINT "Event_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
