-- CreateEnum
CREATE TYPE "TraderRuleTrigger" AS ENUM ('ORDER_PLACED', 'TRADE_CONFIRMED');

-- CreateEnum
CREATE TYPE "TraderRuleSide" AS ENUM ('BUY', 'SELL', 'BOTH');

-- CreateEnum
CREATE TYPE "TraderRuleStatus" AS ENUM ('ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "TraderFollowDirection" AS ENUM ('DIRECT', 'INVERSE');

-- CreateEnum
CREATE TYPE "TraderFollowSizing" AS ENUM ('FIXED', 'SAME');

-- CreateEnum
CREATE TYPE "TraderRuleAlertStatus" AS ENUM ('SKIPPED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "TraderRuleFollowStatus" AS ENUM ('SKIPPED', 'SUBMITTED', 'FAILED');

-- CreateTable
CREATE TABLE "TraderRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "traderAlias" TEXT NOT NULL,
    "trigger" "TraderRuleTrigger" NOT NULL,
    "side" "TraderRuleSide" NOT NULL,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "alertEnabled" BOOLEAN NOT NULL DEFAULT true,
    "followEnabled" BOOLEAN NOT NULL DEFAULT false,
    "followDirection" "TraderFollowDirection",
    "followSizing" "TraderFollowSizing",
    "fixedQuantity" INTEGER,
    "maxQuantity" INTEGER,
    "status" "TraderRuleStatus" NOT NULL DEFAULT 'ENABLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TraderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraderRuleExecution" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "traderAlias" TEXT NOT NULL,
    "trigger" "TraderRuleTrigger" NOT NULL,
    "eventSide" "TradingSide" NOT NULL,
    "eventQuantity" INTEGER NOT NULL,
    "eventPrice" INTEGER NOT NULL,
    "sourceMessageId" INTEGER,
    "chatId" BIGINT,
    "alertStatus" "TraderRuleAlertStatus" NOT NULL DEFAULT 'SKIPPED',
    "followStatus" "TraderRuleFollowStatus" NOT NULL DEFAULT 'SKIPPED',
    "followSide" "TradingSide",
    "followQuantity" INTEGER,
    "followPrice" INTEGER,
    "outgoingMessageId" INTEGER,
    "errorMessage" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraderRuleExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TraderRule_userId_status_idx" ON "TraderRule"("userId", "status");

-- CreateIndex
CREATE INDEX "TraderRule_traderAlias_trigger_status_idx" ON "TraderRule"("traderAlias", "trigger", "status");

-- CreateIndex
CREATE INDEX "TraderRuleExecution_ruleId_executedAt_idx" ON "TraderRuleExecution"("ruleId", "executedAt");

-- CreateIndex
CREATE INDEX "TraderRuleExecution_userId_executedAt_idx" ON "TraderRuleExecution"("userId", "executedAt");

-- CreateIndex
CREATE INDEX "TraderRuleExecution_traderAlias_executedAt_idx" ON "TraderRuleExecution"("traderAlias", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TraderRuleExecution_ruleId_chatId_sourceMessageId_key" ON "TraderRuleExecution"("ruleId", "chatId", "sourceMessageId");

-- AddForeignKey
ALTER TABLE "TraderRule" ADD CONSTRAINT "TraderRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TelegramUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraderRule" ADD CONSTRAINT "TraderRule_traderAlias_fkey" FOREIGN KEY ("traderAlias") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraderRuleExecution" ADD CONSTRAINT "TraderRuleExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "TraderRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
