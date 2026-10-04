import { isFreshTrade, matchesRequest } from "@zarbit/domain";
import type { Prisma, Request, Trade } from "../prisma/generated/client";

// Shared with ingestion: a trade commit and the decision to send have one order.
export async function lockTradeStream(
  tx: Prisma.TransactionClient,
  chatId: bigint,
) {
  const key = `trade-requests:${chatId}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
}

export function latestGroupTrade(tx: Prisma.TransactionClient, chatId: bigint) {
  return tx.trade.findFirst({
    where: { chatId, type: "NORMAL" },
    orderBy: { sourceMessageId: "desc" },
  });
}

export function eligibleTrade(
  row: Request,
  trade: Trade | null,
  now: Date,
): trade is Trade & { sourceMessageId: number } {
  return (
    trade !== null &&
    trade.type === "NORMAL" &&
    trade.sourceMessageId !== null &&
    isFreshTrade(trade.announcedAt, now) &&
    trade.sourceMessageId > row.armedAfterMessageId &&
    trade.announcedAt.getTime() > row.armedAt.getTime() &&
    matchesRequest(row.condition, row.targetPrice, trade.compactPrice)
  );
}

export function tradeTrigger(trade: Trade) {
  if (trade.type !== "NORMAL" || trade.sourceMessageId === null) {
    throw new Error("Settlement cannot trigger requests");
  }
  return {
    triggeredPrice: trade.compactPrice,
    triggerSource: "TRADE" as const,
    triggeredTradeId: trade.id,
    triggeredChatId: trade.chatId,
    triggeredMessageId: trade.sourceMessageId,
    triggeredAt: trade.announcedAt,
  };
}

export const emptyTrigger = {
  triggeredPrice: null,
  triggerSource: null,
  triggeredTradeId: null,
  triggeredChatId: null,
  triggeredMessageId: null,
  triggeredAt: null,
} as const;
