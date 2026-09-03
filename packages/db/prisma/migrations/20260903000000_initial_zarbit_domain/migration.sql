-- CreateTable
CREATE TABLE "TelegramUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telegramUserId" TEXT NOT NULL,
    "firstName" TEXT,
    "username" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TelegramUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUser_telegramUserId_key" ON "TelegramUser"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Request_claimToken_key" ON "Request"("claimToken");

-- CreateIndex
CREATE INDEX "Request_userId_status_idx" ON "Request"("userId", "status");

-- CreateIndex
CREATE INDEX "Request_status_claimToken_idx" ON "Request"("status", "claimToken");
