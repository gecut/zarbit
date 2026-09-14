ALTER TABLE "TelegramSession" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "loginId" TEXT;
CREATE TYPE "TelegramOperationStatus" AS ENUM ('ACCEPTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED', 'INTERRUPTED');
CREATE TABLE "TelegramOperation" (
  "userId" TEXT NOT NULL, "id" UUID NOT NULL, "type" TEXT NOT NULL,
  "status" "TelegramOperationStatus" NOT NULL DEFAULT 'ACCEPTED',
  "revision" INTEGER NOT NULL, "challengeId" UUID, "requestId" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  "errorCode" TEXT, "errorMessage" TEXT, "errorField" TEXT, "retryAt" TIMESTAMP(3),
  "cancelledRequests" INTEGER NOT NULL DEFAULT 0, "sendingRequests" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "TelegramOperation_pkey" PRIMARY KEY ("userId", "id"),
  CONSTRAINT "TelegramOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TelegramUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TelegramOperation_userId_status_acceptedAt_idx" ON "TelegramOperation"("userId", "status", "acceptedAt");
CREATE INDEX "TelegramOperation_completedAt_idx" ON "TelegramOperation"("completedAt");
