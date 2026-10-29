-- A person with no name has a NULL name, never an empty one. The student
-- import used to write '' for a roster row with no name, and Postgres sorts ''
-- ahead of every letter, so those students led every view of the directory
-- while NULL names sort last. The import now writes NULL; this brings the rows
-- it has already written level.
--
-- A name of only spaces is blank too. Nothing else in the row is touched.
UPDATE "User"
SET "name" = NULL
WHERE btrim("name") = '';
