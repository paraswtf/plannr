-- Replaces the single `User.role` enum with roles as rows, so a person can hold
-- several at once (a faculty member who also coordinates, say) and an
-- institution can define roles of its own.
--
-- Ordering matters: the new tables are populated from the old column *before*
-- it is dropped, so no one loses their access.
--
-- The permission bitfields below are generated from SYSTEM_ROLES in
-- src/lib/permissions.ts. The seed re-upserts them on every run, so if the
-- definitions there change, running the seed brings existing rows back in line.

-- Postgres gives every table an implicit type of the same name, so the old
-- `Role` enum has to move out of the way before a `Role` table can exist. It is
-- renamed rather than dropped because the data migration below still has to
-- read the column typed by it.
ALTER TYPE "Role" RENAME TO "Role_legacy";

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" BIGINT NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateIndex
CREATE INDEX "Role_orgId_idx" ON "Role"("orgId");
CREATE UNIQUE INDEX "Role_orgId_name_key" ON "Role"("orgId", "name");
CREATE UNIQUE INDEX "Role_orgId_key_key" ON "Role"("orgId", "key");
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the four locked roles for every organisation that already exists.
INSERT INTO "Role" ("id", "orgId", "key", "name", "description", "permissions", "isSystem", "createdAt", "updatedAt")
SELECT
    o."id" || '-role-' || r."key",
    o."id",
    r."key",
    r."name",
    r."description",
    r."permissions",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (VALUES
    ('student',     'Student',     'Sees their own timetable and can book a study room.',            17::BIGINT),
    ('faculty',     'Faculty',     'Teaches classes and manages their own schedule.',                1073742870::BIGINT),
    ('coordinator', 'Coordinator', 'Schedules the timetable, approves bookings and manages groups.', 6443501624::BIGINT),
    ('admin',       'Admin',       'Full access to the institution.',                                4611686018427387904::BIGINT)
) AS r("key", "name", "description", "permissions");

-- Carry every existing user's role across. FACULTY and ADMIN map to the
-- matching new role; everyone else becomes a student.
INSERT INTO "UserRole" ("userId", "roleId", "assignedAt")
SELECT
    u."id",
    o."id" || '-role-' || CASE u."role"::TEXT
        WHEN 'ADMIN' THEN 'admin'
        WHEN 'FACULTY' THEN 'faculty'
        ELSE 'student'
    END,
    CURRENT_TIMESTAMP
FROM "User" u
JOIN "Organization" o ON o."id" = u."orgId";

-- DropIndex
DROP INDEX "User_orgId_role_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role";

-- DropEnum
DROP TYPE "Role_legacy";

-- CreateIndex
CREATE INDEX "User_orgId_email_idx" ON "User"("orgId", "email");
