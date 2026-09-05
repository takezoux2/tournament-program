-- CreateEnum
CREATE TYPE "ScheduleItemKind" AS ENUM ('MATCH', 'DIVIDER');

-- CreateTable
CREATE TABLE "ScheduleItem" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "ScheduleItemKind" NOT NULL,
    "divisionId" TEXT,
    "matchId" TEXT,
    "label" TEXT,
    "startsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleItem_tournamentId_idx" ON "ScheduleItem"("tournamentId");

-- CreateIndex
CREATE INDEX "ScheduleItem_divisionId_idx" ON "ScheduleItem"("divisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleItem_tournamentId_order_key" ON "ScheduleItem"("tournamentId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleItem_tournamentId_divisionId_matchId_key" ON "ScheduleItem"("tournamentId", "divisionId", "matchId");

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;
