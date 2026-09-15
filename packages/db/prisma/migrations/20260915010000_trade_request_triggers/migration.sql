ALTER TYPE "RequestExecutionPhase" RENAME VALUE 'WAITING_QUOTE' TO 'WAITING_TRADE';
CREATE TYPE "RequestTriggerSource" AS ENUM ('QUOTE', 'TRADE');
ALTER TABLE "Request" RENAME COLUMN "triggeredQuote" TO "triggeredPrice";
ALTER TABLE "Request"
  ADD COLUMN "armedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "armedAfterMessageId" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "triggerSource" "RequestTriggerSource",
  ADD COLUMN "triggeredTradeId" TEXT,
  ADD COLUMN "triggeredChatId" BIGINT,
  ADD COLUMN "triggeredAt" TIMESTAMP(3);

UPDATE "Request" SET "triggerSource" = 'QUOTE' WHERE "triggeredPrice" IS NOT NULL;
UPDATE "Request" AS r SET "triggeredAt" = q."announcedAt", "triggeredChatId" = q."chatId"
FROM "QuoteHistory" AS q WHERE r."triggeredMessageId" = q."sourceMessageId" AND r."triggerSource" = 'QUOTE';

UPDATE "Request" SET "armedAfterMessageId" = COALESCE((SELECT MAX("sourceMessageId") FROM "Trade"), 0)
WHERE "status" = 'ACTIVE';

CREATE TABLE "TradeRequestCursor" (
  "chatId" BIGINT NOT NULL PRIMARY KEY,
  "sourceMessageId" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "TradeRequestCursor" ("chatId", "sourceMessageId")
SELECT "chatId", MAX("sourceMessageId") FROM "Trade" GROUP BY "chatId";
