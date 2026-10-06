-- CreateEnum
CREATE TYPE "RequestPriceMode" AS ENUM ('TARGET_PRICE', 'LAST_TRADE');

-- AlterTable
ALTER TABLE "Request" ADD COLUMN "priceMode" "RequestPriceMode" NOT NULL DEFAULT 'TARGET_PRICE';
