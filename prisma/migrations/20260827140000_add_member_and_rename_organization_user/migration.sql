/*
  Warnings:

  - `OrganizationMember` を `OrganizationUser` にリネームする。
  - `Participant.name` を削除し、必須の `Participant.memberId` を追加する。
    既存の `Participant` 行がある環境では、`memberId` を埋める移行処理が別途必要になる。

*/
-- RenameTable
ALTER TABLE "OrganizationMember" RENAME TO "OrganizationUser";

-- RenameConstraint
ALTER TABLE "OrganizationUser" RENAME CONSTRAINT "OrganizationMember_pkey" TO "OrganizationUser_pkey";

-- RenameConstraint
ALTER TABLE "OrganizationUser" RENAME CONSTRAINT "OrganizationMember_organizationId_fkey" TO "OrganizationUser_organizationId_fkey";

-- RenameConstraint
ALTER TABLE "OrganizationUser" RENAME CONSTRAINT "OrganizationMember_userId_fkey" TO "OrganizationUser_userId_fkey";

-- RenameIndex
ALTER INDEX "OrganizationMember_userId_idx" RENAME TO "OrganizationUser_userId_idx";

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKana" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Member_organizationId_idx" ON "Member"("organizationId");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Participant" DROP COLUMN "name",
ADD COLUMN     "memberId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Participant_memberId_idx" ON "Participant"("memberId");

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
