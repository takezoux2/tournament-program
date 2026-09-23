-- ダブルエリミネーション形式を廃止する。
-- 該当部門は行ごと消す（ScheduleItem は FK の ON DELETE CASCADE で追従する）。
-- PostgreSQL は enum 値を直接 DROP できないため型を作り直す。

DELETE FROM "Division"
 WHERE "format" IN ('DOUBLE_ELIMINATION_GRAND_FINAL', 'DOUBLE_ELIMINATION_THIRD_PLACE');

CREATE TYPE "DivisionFormat_new" AS ENUM ('SINGLE_ELIMINATION', 'ROUND_ROBIN');
ALTER TABLE "Division" ALTER COLUMN "format"
  TYPE "DivisionFormat_new" USING ("format"::text::"DivisionFormat_new");
ALTER TYPE "DivisionFormat" RENAME TO "DivisionFormat_old";
ALTER TYPE "DivisionFormat_new" RENAME TO "DivisionFormat";
DROP TYPE "DivisionFormat_old";
