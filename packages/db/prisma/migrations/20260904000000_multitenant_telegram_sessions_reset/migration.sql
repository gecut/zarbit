-- This is an intentional product reset. Existing single-account users,
-- requests, and MTProto session metadata are not safe to migrate to the
-- per-user QR ownership model.
PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS "Request";
DROP TABLE IF EXISTS "TelegramSession";
DROP TABLE IF EXISTS "TelegramUser";

PRAGMA foreign_keys=ON;

CREATE TABLE "TelegramUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telegramUserId" TEXT NOT NULL,
    "firstName" TEXT,
    "username" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "TelegramSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT,
    "connectedTelegramUserId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING_QR',
    "membershipCheckedAt" DATETIME,
    "lastError" TEXT,
    "stateChangedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TelegramSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TelegramUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "targetPrice" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "units" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "claimToken" TEXT,
    "claimedAt" DATETIME,
    "triggeredQuote" INTEGER,
    "triggeredMessageId" INTEGER,
    "completedAt" DATETIME,
    "failureReason" TEXT,
    "cancellationReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TelegramUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TelegramUser_telegramUserId_key" ON "TelegramUser"("telegramUserId");
CREATE UNIQUE INDEX "TelegramSession_userId_key" ON "TelegramSession"("userId");
CREATE UNIQUE INDEX "TelegramSession_storageKey_key" ON "TelegramSession"("storageKey");
CREATE UNIQUE INDEX "TelegramSession_connectedTelegramUserId_key" ON "TelegramSession"("connectedTelegramUserId");
CREATE INDEX "TelegramSession_state_updatedAt_idx" ON "TelegramSession"("state", "updatedAt");
CREATE UNIQUE INDEX "Request_claimToken_key" ON "Request"("claimToken");
CREATE INDEX "Request_userId_status_idx" ON "Request"("userId", "status");
CREATE INDEX "Request_status_claimToken_idx" ON "Request"("status", "claimToken");
