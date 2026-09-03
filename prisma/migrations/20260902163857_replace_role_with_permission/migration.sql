/*
  Warnings:

  - `OrganizationUser.role` と `OrganizationRole` を削除し、Permission テーブルに置き換える。
  - `User.username` を必須・unique で追加する。既存行は email のローカル部で埋め、
    衝突時は連番を付ける。開発 DB 前提の簡易対応であり、本番データには使えない。

*/

-- AlterTable: User.username を段階的に足す（既存行を埋めてから NOT NULL にする）
ALTER TABLE "User" ADD COLUMN "username" TEXT;

UPDATE "User" SET "username" = split_part("email", '@', 1);

-- 同じローカル部が複数あった場合に連番を付ける（2 件目以降が taro2, taro3 ...）
UPDATE "User" AS u
SET "username" = u."username" || d."rn"::text
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "username" ORDER BY "createdAt", "id") AS "rn"
  FROM "User"
) AS d
WHERE u."id" = d."id" AND d."rn" > 1;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateTable
CREATE TABLE "Permission" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateTable
CREATE TABLE "OrganizationUserPermission" (
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationUserPermission_pkey" PRIMARY KEY ("organizationId","userId","permissionId")
);

-- CreateIndex
CREATE INDEX "OrganizationUserPermission_permissionId_idx" ON "OrganizationUserPermission"("permissionId");

-- AddForeignKey
ALTER TABLE "OrganizationUserPermission" ADD CONSTRAINT "OrganizationUserPermission_organizationId_userId_fkey" FOREIGN KEY ("organizationId", "userId") REFERENCES "OrganizationUser"("organizationId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationUserPermission" ADD CONSTRAINT "OrganizationUserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: 権限マスタ。shared/authz/ability.ts の PERMISSION_CODES と対応させる。
INSERT INTO "Permission" ("code", "description") VALUES
  ('user.view', '組織ユーザーの閲覧'),
  ('user.add', '組織ユーザーの追加'),
  ('user.remove', '組織ユーザーの削除'),
  ('user.grant', '組織ユーザーへの権限付与・剥奪'),
  ('tournament.create', '大会の作成'),
  ('tournament.edit', '大会の編集'),
  ('tournament.delete', '大会の削除'),
  ('org.edit', '組織の編集'),
  ('org.delete', '組織の削除');

-- 既存の所属ユーザーには全権限を付与する（role 撤廃で権限を失わせないため）
INSERT INTO "OrganizationUserPermission" ("organizationId", "userId", "permissionId")
SELECT ou."organizationId", ou."userId", p."id"
FROM "OrganizationUser" AS ou
CROSS JOIN "Permission" AS p;

-- AlterTable
ALTER TABLE "OrganizationUser" DROP COLUMN "role";

-- DropEnum
DROP TYPE "OrganizationRole";
