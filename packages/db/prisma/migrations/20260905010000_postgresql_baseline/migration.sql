-- PostgreSQL baseline for a fresh Zarbit installation. SQLite history is intentionally incompatible.
CREATE TYPE "RequestCondition" AS ENUM ('LTE', 'GTE');
CREATE TYPE "RequestAction" AS ENUM ('ALERT', 'BUY', 'SELL');
CREATE TYPE "RequestStatus" AS ENUM ('ACTIVE', 'DONE', 'CANCELLED', 'FAILED');
CREATE TYPE "TelegramSessionState" AS ENUM ('PENDING_OTP', 'ACTIVE', 'NOT_IN_GROUP', 'REVOKED', 'REVOKING', 'ERROR');

CREATE TABLE "TelegramUser" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "firstName" TEXT,
    "username" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT,
    "connectedTelegramUserId" TEXT,
    "state" "TelegramSessionState" NOT NULL DEFAULT 'PENDING_OTP',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "runtimeReady" BOOLEAN NOT NULL DEFAULT false,
    "runtimeCheckedAt" TIMESTAMP(3),
    "membershipCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "stateChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "condition" "RequestCondition" NOT NULL,
    "targetPrice" INTEGER NOT NULL,
    "action" "RequestAction" NOT NULL,
    "units" INTEGER,
    "status" "RequestStatus" NOT NULL DEFAULT 'ACTIVE',
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "triggeredQuote" INTEGER,
    "triggeredMessageId" INTEGER,
    "outgoingMessageId" INTEGER,
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoginRateLimit" (
    "key" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),

    CONSTRAINT "LoginRateLimit_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "TelegramUser_telegramUserId_key" ON "TelegramUser"("telegramUserId");
CREATE UNIQUE INDEX "TelegramSession_userId_key" ON "TelegramSession"("userId");
CREATE UNIQUE INDEX "TelegramSession_storageKey_key" ON "TelegramSession"("storageKey");
CREATE UNIQUE INDEX "TelegramSession_connectedTelegramUserId_key" ON "TelegramSession"("connectedTelegramUserId");
CREATE INDEX "TelegramSession_state_updatedAt_idx" ON "TelegramSession"("state", "updatedAt");
CREATE UNIQUE INDEX "Request_claimToken_key" ON "Request"("claimToken");
CREATE INDEX "Request_userId_status_createdAt_id_idx" ON "Request"("userId", "status", "createdAt" DESC, "id" DESC);
CREATE INDEX "Request_active_lte_candidate_idx" ON "Request"("userId", "targetPrice", "createdAt")
WHERE "status" = 'ACTIVE' AND "claimToken" IS NULL AND "condition" = 'LTE';
CREATE INDEX "Request_active_gte_candidate_idx" ON "Request"("userId", "targetPrice", "createdAt")
WHERE "status" = 'ACTIVE' AND "claimToken" IS NULL AND "condition" = 'GTE';

ALTER TABLE "TelegramSession" ADD CONSTRAINT "TelegramSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "TelegramUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Request" ADD CONSTRAINT "Request_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "TelegramUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- `zarbit_migrator` owns schema changes; the runtime role has CRUD only.
GRANT USAGE ON SCHEMA "public" TO "zarbit_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "zarbit_app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "public" TO "zarbit_app";
ALTER DEFAULT PRIVILEGES FOR ROLE "zarbit_migrator" IN SCHEMA "public"
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "zarbit_app";
ALTER DEFAULT PRIVILEGES FOR ROLE "zarbit_migrator" IN SCHEMA "public"
GRANT USAGE, SELECT ON SEQUENCES TO "zarbit_app";
