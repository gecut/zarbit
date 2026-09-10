-- CreateEnum
CREATE TYPE "ParticipantResolutionStatus" AS ENUM ('UNRESOLVED', 'CANDIDATE', 'VERIFIED', 'CONFLICT', 'CONFLICT_FLAGGED');

-- CreateEnum
CREATE TYPE "TradingActionType" AS ENUM ('ORDER_BUY', 'ORDER_SELL', 'TAKE_ALL', 'TAKE_QUANTITY', 'CANCEL');

-- CreateEnum
CREATE TYPE "TradingActionStatus" AS ENUM ('OBSERVED', 'CONFIRMED_BY_BOT', 'REJECTED_BY_BOT', 'AMBIGUOUS', 'UNRESOLVED_TARGET');

-- AlterTable
ALTER TABLE "QuoteHistory" ADD COLUMN     "chatId" BIGINT;

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "resolutionStatus" "ParticipantResolutionStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "confirmationCount" INTEGER NOT NULL DEFAULT 0,
    "lastConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingAction" (
    "id" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "sourceMessageId" INTEGER NOT NULL,
    "senderId" TEXT NOT NULL,
    "actionType" "TradingActionType" NOT NULL,
    "rawText" TEXT NOT NULL,
    "quantity" INTEGER,
    "compactPrice" INTEGER,
    "replyToMessageId" INTEGER,
    "replyToSenderId" TEXT,
    "targetOrderMessageId" INTEGER,
    "status" "TradingActionStatus" NOT NULL DEFAULT 'OBSERVED',
    "confirmedByMessageId" INTEGER,
    "participantId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "sourceMessageId" INTEGER NOT NULL,
    "referenceNumber" TEXT,
    "buyerParticipantId" TEXT NOT NULL,
    "sellerParticipantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "compactPrice" INTEGER NOT NULL,
    "rawPrice" BIGINT NOT NULL,
    "receiptTimeText" TEXT,
    "announcedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Participant_telegramUserId_idx" ON "Participant"("telegramUserId");

-- CreateIndex
CREATE INDEX "TradingAction_sourceMessageId_idx" ON "TradingAction"("sourceMessageId");

-- CreateIndex
CREATE INDEX "TradingAction_senderId_observedAt_idx" ON "TradingAction"("senderId", "observedAt");

-- CreateIndex
CREATE INDEX "TradingAction_participantId_observedAt_idx" ON "TradingAction"("participantId", "observedAt");

-- CreateIndex
CREATE INDEX "TradingAction_targetOrderMessageId_idx" ON "TradingAction"("targetOrderMessageId");

-- CreateIndex
CREATE INDEX "TradingAction_observedAt_sourceMessageId_idx" ON "TradingAction"("observedAt", "sourceMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "TradingAction_chatId_sourceMessageId_key" ON "TradingAction"("chatId", "sourceMessageId");

-- CreateIndex
CREATE INDEX "Trade_sourceMessageId_idx" ON "Trade"("sourceMessageId");

-- CreateIndex
CREATE INDEX "Trade_announcedAt_sourceMessageId_idx" ON "Trade"("announcedAt", "sourceMessageId");

-- CreateIndex
CREATE INDEX "Trade_buyerParticipantId_announcedAt_idx" ON "Trade"("buyerParticipantId", "announcedAt");

-- CreateIndex
CREATE INDEX "Trade_sellerParticipantId_announcedAt_idx" ON "Trade"("sellerParticipantId", "announcedAt");

-- CreateIndex
CREATE INDEX "Trade_referenceNumber_idx" ON "Trade"("referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_chatId_sourceMessageId_key" ON "Trade"("chatId", "sourceMessageId");

-- CreateIndex
CREATE INDEX "QuoteHistory_announcedAt_sourceMessageId_idx" ON "QuoteHistory"("announcedAt", "sourceMessageId");

-- AddForeignKey
ALTER TABLE "TradingAction" ADD CONSTRAINT "TradingAction_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_buyerParticipantId_fkey" FOREIGN KEY ("buyerParticipantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_sellerParticipantId_fkey" FOREIGN KEY ("sellerParticipantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
