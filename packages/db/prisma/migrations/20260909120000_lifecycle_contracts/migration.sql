CREATE TYPE "TelegramConnectionState" AS ENUM ('CONNECTED', 'CONNECTING', 'OFFLINE', 'DEGRADED');
CREATE TYPE "RequestExecutionPhase" AS ENUM ('WAITING_QUOTE', 'CLAIMED', 'SENDING', 'DONE', 'FAILED', 'CANCELLED', 'UNKNOWN');
CREATE TYPE "RequestResolutionState" AS ENUM ('NOT_APPLICABLE', 'UNRESOLVED');

ALTER TABLE "TelegramSession"
  ADD COLUMN "connectionState" "TelegramConnectionState" NOT NULL DEFAULT 'OFFLINE',
  ADD COLUMN "reasonCode" TEXT,
  ADD COLUMN "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastErrorCode" TEXT,
  ADD COLUMN "revokedAt" TIMESTAMP(3);

ALTER TABLE "Request"
  ADD COLUMN "executionPhase" "RequestExecutionPhase" NOT NULL DEFAULT 'WAITING_QUOTE',
  ADD COLUMN "outcomeCode" TEXT,
  ADD COLUMN "deliveryStartedAt" TIMESTAMP(3),
  ADD COLUMN "unknownReason" TEXT,
  ADD COLUMN "resolutionState" "RequestResolutionState" NOT NULL DEFAULT 'NOT_APPLICABLE';

UPDATE "TelegramSession"
SET "connectionState" = CASE WHEN "state" = 'ACTIVE' AND "runtimeReady" THEN 'CONNECTED'::"TelegramConnectionState" ELSE 'OFFLINE'::"TelegramConnectionState" END,
    "reasonCode" = CASE WHEN "state" = 'REVOKED' THEN 'TELEGRAM_LOGGED_OUT' ELSE NULL END,
    "revokedAt" = CASE WHEN "state" = 'REVOKED' THEN COALESCE("stateChangedAt", CURRENT_TIMESTAMP) ELSE NULL END;

UPDATE "Request"
SET "executionPhase" = CASE
      WHEN "status" = 'DONE' THEN 'DONE'::"RequestExecutionPhase"
      WHEN "status" = 'FAILED' THEN 'FAILED'::"RequestExecutionPhase"
      WHEN "status" = 'CANCELLED' THEN 'CANCELLED'::"RequestExecutionPhase"
      WHEN "status" = 'UNKNOWN' THEN 'UNKNOWN'::"RequestExecutionPhase"
      WHEN "claimToken" IS NOT NULL THEN 'CLAIMED'::"RequestExecutionPhase"
      ELSE 'WAITING_QUOTE'::"RequestExecutionPhase"
    END,
    "resolutionState" = CASE WHEN "status" = 'UNKNOWN' THEN 'UNRESOLVED'::"RequestResolutionState" ELSE 'NOT_APPLICABLE'::"RequestResolutionState" END,
    "unknownReason" = CASE WHEN "status" = 'UNKNOWN' THEN "failureReason" ELSE NULL END;

CREATE INDEX "TelegramSession_state_connectionState_idx" ON "TelegramSession"("state", "connectionState");
