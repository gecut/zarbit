CREATE TABLE "QuoteHistory" (
    "id" SERIAL NOT NULL,
    "compactQuote" INTEGER NOT NULL,
    "announcedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "sourceMessageId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuoteHistory_sourceMessageId_key" ON "QuoteHistory"("sourceMessageId");
CREATE INDEX "QuoteHistory_announcedAt_idx" ON "QuoteHistory"("announcedAt");
