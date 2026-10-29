-- When each person last used Plannr, so the directory can list the people
-- actually using it, most recent first.
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

-- A first value from the sessions already open. Sessions are kept in the
-- database for thirty days and Auth.js pushes a session's expiry forward to
-- thirty days from its use, at most once a day, so its expiry less thirty days
-- is when it was last used, to within a day. People with no open session keep
-- no value until they are next seen.
UPDATE "User" AS u
SET "lastSeenAt" = LEAST(s."last" - INTERVAL '30 days', NOW())
FROM (
  SELECT "userId", MAX("expires") AS "last"
  FROM "Session"
  GROUP BY "userId"
) AS s
WHERE s."userId" = u."id";
