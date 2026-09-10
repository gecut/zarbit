-- CreateEnum
CREATE TYPE "TradingSide" AS ENUM ('BUY', 'SELL');

-- AlterTable
ALTER TABLE "TradingAction" ADD COLUMN "side" "TradingSide";

-- DropIndex
DROP INDEX "Participant_telegramUserId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Participant_telegramUserId_key" ON "Participant"("telegramUserId");
