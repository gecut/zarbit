-- Preserve authorized sessions and all request history. Only unfinished enrollment expires.
CREATE TABLE "new_TelegramSession" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "storageKey" TEXT, "connectedTelegramUserId" TEXT,
  "state" TEXT NOT NULL DEFAULT 'PENDING_OTP', "revision" INTEGER NOT NULL DEFAULT 0,
  "runtimeReady" BOOLEAN NOT NULL DEFAULT false, "runtimeCheckedAt" DATETIME,
  "membershipCheckedAt" DATETIME, "lastError" TEXT,
  "stateChangedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "TelegramSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TelegramUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TelegramSession" ("id", "userId", "storageKey", "connectedTelegramUserId", "state", "membershipCheckedAt", "lastError", "stateChangedAt", "createdAt", "updatedAt")
SELECT "id", "userId", "storageKey", "connectedTelegramUserId", "state", "membershipCheckedAt", "lastError", "stateChangedAt", "createdAt", "updatedAt" FROM "TelegramSession";
DROP TABLE "TelegramSession";
ALTER TABLE "new_TelegramSession" RENAME TO "TelegramSession";
CREATE UNIQUE INDEX "TelegramSession_userId_key" ON "TelegramSession"("userId");
CREATE UNIQUE INDEX "TelegramSession_storageKey_key" ON "TelegramSession"("storageKey");
CREATE UNIQUE INDEX "TelegramSession_connectedTelegramUserId_key" ON "TelegramSession"("connectedTelegramUserId");
CREATE INDEX "TelegramSession_state_updatedAt_idx" ON "TelegramSession"("state", "updatedAt");
ALTER TABLE "Request" ADD COLUMN "outgoingMessageId" INTEGER;
CREATE TABLE "LoginRateLimit" ("key" TEXT NOT NULL PRIMARY KEY, "windowStartedAt" DATETIME NOT NULL, "count" INTEGER NOT NULL DEFAULT 0, "blockedUntil" DATETIME);
UPDATE "TelegramSession" SET "state" = 'ERROR', "lastError" = 'ورود قبلی منقضی شد؛ با شماره تلفن دوباره وارد شوید.', "stateChangedAt" = CURRENT_TIMESTAMP WHERE "state" = 'PENDING_QR';
