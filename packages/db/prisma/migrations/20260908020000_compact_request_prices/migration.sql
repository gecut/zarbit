-- Requests created before compact quote values reached the form stored their
-- target in full toman amounts. Convert only exact legacy display amounts.
UPDATE "Request"
SET "targetPrice" = "targetPrice" / 1000
WHERE "targetPrice" >= 10000000
  AND MOD("targetPrice", 1000) = 0;

UPDATE "Request"
SET "triggeredQuote" = "triggeredQuote" / 1000
WHERE "triggeredQuote" >= 10000000
  AND MOD("triggeredQuote", 1000) = 0;
