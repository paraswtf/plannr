-- Booking a room is for faculty and above. The built-in Student role is
-- re-upserted from src/lib/permissions.ts by the seed, but the seed is never
-- run against a live database, so the stored row is brought level here.
--
-- Clears the BookRoom bit (1 << 4 = 16) and nothing else, so anything else a
-- college has since granted the role survives. Bookings already made are left
-- as they are; a personal grant of BookRoom to a particular student is a
-- different row and is not touched.
UPDATE "Role"
SET "permissions" = "permissions" & ~16::bigint,
    "description" = 'Sees their own timetable and attendance.'
WHERE "key" = 'student' AND "isSystem" = true;
