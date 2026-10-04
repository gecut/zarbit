-- AlterTable
ALTER TABLE "Request" ADD COLUMN "creationKey" UUID,
ADD COLUMN "creationPayloadHash" TEXT;

-- AlterTable
ALTER TABLE "GroupIngestionState" ADD COLUMN "historyRecoveryGeneration" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RequestCreationIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creationKey" UUID NOT NULL,
    "creationPayloadHash" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestCreationIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Request_userId_creationKey_key" ON "Request"("userId", "creationKey");

-- CreateIndex
CREATE UNIQUE INDEX "RequestCreationIdentity_userId_creationKey_key" ON "RequestCreationIdentity"("userId", "creationKey");

-- CreateIndex
CREATE UNIQUE INDEX "RequestCreationIdentity_requestId_key" ON "RequestCreationIdentity"("requestId");

-- CreateIndex
CREATE INDEX "RequestCreationIdentity_userId_createdAt_idx" ON "RequestCreationIdentity"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteHistory_chatId_sourceMessageId_idx" ON "QuoteHistory"("chatId", "sourceMessageId");

-- CheckConstraint
ALTER TABLE "Request" ADD CONSTRAINT "Request_creation_identity_ck" CHECK (("creationKey" IS NULL AND "creationPayloadHash" IS NULL) OR ("creationKey" IS NOT NULL AND "creationPayloadHash" IS NOT NULL));
