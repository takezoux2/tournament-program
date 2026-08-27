/*
  Warnings:

  - A unique constraint covering the columns `[issuer,accountId]` on the table `Account` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `issuer` to the `Account` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Account_providerId_accountId_key";

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "issuer" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Account_issuer_accountId_key" ON "Account"("issuer", "accountId");
