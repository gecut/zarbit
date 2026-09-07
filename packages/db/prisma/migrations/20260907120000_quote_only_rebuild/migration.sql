DROP TABLE IF EXISTS "Request";
DROP TYPE IF EXISTS "RequestCondition";
DROP TYPE IF EXISTS "RequestAction";
DROP TYPE IF EXISTS "RequestStatus";

CREATE TABLE "LatestQuote" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "compactQuote" INTEGER NOT NULL,
    "announcedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "sourceMessageId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LatestQuote_pkey" PRIMARY KEY ("id")
);
