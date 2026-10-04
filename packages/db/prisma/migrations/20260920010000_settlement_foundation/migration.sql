CREATE TYPE "TradeType" AS ENUM ('NORMAL', 'SETTLEMENT');
CREATE TYPE "SettlementStatus" AS ENUM ('RECEIVED', 'APPLIED', 'REVIEW_REQUIRED');

ALTER TABLE "Trade"
  ADD COLUMN "type" "TradeType" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "settlementMessageId" INTEGER,
  ALTER COLUMN "sourceMessageId" DROP NOT NULL,
  ALTER COLUMN "buyerParticipantId" DROP NOT NULL,
  ALTER COLUMN "sellerParticipantId" DROP NOT NULL;

CREATE TABLE "Settlement" (
  "id" TEXT NOT NULL,
  "chatId" BIGINT NOT NULL,
  "sourceMessageId" INTEGER NOT NULL,
  "senderId" TEXT NOT NULL,
  "compactPrice" INTEGER NOT NULL,
  "announcedAt" TIMESTAMP(3) NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" "SettlementStatus" NOT NULL DEFAULT 'RECEIVED',
  "reviewReason" TEXT,
  "coverageDigest" TEXT,
  "coverageReviewedBy" TEXT,
  "isBootstrap" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialInbox" (
  "id" TEXT NOT NULL,
  "chatId" BIGINT NOT NULL,
  "sourceMessageId" INTEGER NOT NULL,
  "senderId" TEXT NOT NULL,
  "eventKind" TEXT NOT NULL,
  "rawText" TEXT,
  "payloadHash" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  CONSTRAINT "FinancialInbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupIngestionState" (
  "chatId" BIGINT NOT NULL,
  "historyRecoveryRequired" BOOLEAN NOT NULL DEFAULT false,
  "scannedThroughMessageId" INTEGER NOT NULL DEFAULT 0,
  "appliedThroughMessageId" INTEGER NOT NULL DEFAULT 0,
  "coverageVerifiedThroughMessageId" INTEGER NOT NULL DEFAULT 0,
  "coverageDigest" TEXT,
  "gateStatus" TEXT NOT NULL DEFAULT 'OPEN',
  "analyticsRevision" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupIngestionState_pkey" PRIMARY KEY ("chatId")
);

CREATE UNIQUE INDEX "Settlement_chatId_sourceMessageId_key" ON "Settlement"("chatId", "sourceMessageId");
CREATE UNIQUE INDEX "FinancialInbox_observation_key" ON "FinancialInbox"("chatId", "sourceMessageId", "eventKind", "payloadHash");
CREATE INDEX "Trade_chatId_settlementMessageId_idx" ON "Trade"("chatId", "settlementMessageId");

ALTER TABLE "Trade" ADD CONSTRAINT "Trade_settlement_fkey"
  FOREIGN KEY ("chatId", "settlementMessageId") REFERENCES "Settlement"("chatId", "sourceMessageId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Trade" ADD CONSTRAINT "Trade_shape_ck" CHECK (
  ("type" = 'NORMAL' AND "sourceMessageId" IS NOT NULL AND "settlementMessageId" IS NULL
    AND "buyerParticipantId" IS NOT NULL AND "sellerParticipantId" IS NOT NULL)
  OR
  ("type" = 'SETTLEMENT' AND "sourceMessageId" IS NULL AND "settlementMessageId" IS NOT NULL
    AND (("buyerParticipantId" IS NOT NULL) <> ("sellerParticipantId" IS NOT NULL))
  )
);
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_positive_values_ck"
  CHECK ("quantity" > 0 AND "compactPrice" > 0 AND "rawPrice" > 0);
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_settlement_price_ck"
  CHECK ("type" = 'NORMAL' OR "rawPrice" = ("compactPrice"::bigint * 1000));

CREATE UNIQUE INDEX "Trade_settlement_participant_key"
  ON "Trade" (
    "chatId",
    "settlementMessageId",
    (COALESCE("buyerParticipantId", "sellerParticipantId"))
  )
  WHERE "type" = 'SETTLEMENT';

ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_values_ck"
  CHECK ("sourceMessageId" > 0 AND "compactPrice" > 0);

ALTER TABLE "FinancialInbox" ADD CONSTRAINT "FinancialInbox_values_ck"
  CHECK ("sourceMessageId" > 0 AND (("eventKind" = 'DELETE' AND "rawText" IS NULL)
    OR ("eventKind" IN ('NEW', 'EDIT') AND "rawText" IS NOT NULL)));
ALTER TABLE "GroupIngestionState" ADD CONSTRAINT "GroupIngestionState_values_ck"
  CHECK ("scannedThroughMessageId" >= 0 AND "appliedThroughMessageId" >= 0
    AND "coverageVerifiedThroughMessageId" >= 0
    AND "gateStatus" IN ('OPEN', 'REVIEW_REQUIRED'));
