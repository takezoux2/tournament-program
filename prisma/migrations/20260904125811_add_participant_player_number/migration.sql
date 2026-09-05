-- 列を一旦 NULL 許容で足し、大会ごとに createdAt 順の連番で埋めてから NOT NULL にする。
ALTER TABLE "Participant" ADD COLUMN "playerNumber" TEXT;

UPDATE "Participant" AS p
SET "playerNumber" = numbered.rn::text
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "tournamentId"
      ORDER BY "createdAt", "id"
    ) AS rn
  FROM "Participant"
) AS numbered
WHERE p."id" = numbered."id";

ALTER TABLE "Participant" ALTER COLUMN "playerNumber" SET NOT NULL;
