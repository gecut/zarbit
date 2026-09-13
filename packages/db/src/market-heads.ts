import type { MarketNotification } from "@zarbit/contracts";
import type { PrismaClient } from "../prisma/generated/client";

const quoteSelect = {
  compactQuote: true,
  announcedAt: true,
  sourceMessageId: true,
} as const;
const tradeSelect = {
  id: true,
  compactPrice: true,
  quantity: true,
  announcedAt: true,
  sourceMessageId: true,
} as const;

export function createMarketHeadsStore(db: PrismaClient) {
  return {
    marketHeads: async () => {
      const [quote, trade] = await Promise.all([
        db.quoteHistory.findFirst({
          orderBy: { sourceMessageId: "desc" },
          select: quoteSelect,
        }),
        db.trade.findFirst({
          orderBy: { sourceMessageId: "desc" },
          select: tradeSelect,
        }),
      ]);
      return { quote, trade };
    },
    marketEvent: async (event: MarketNotification) => {
      if (event.type === "QUOTE") {
        const row = await db.quoteHistory.findUnique({
          where: { sourceMessageId: event.sourceMessageId },
          select: quoteSelect,
        });
        return row
          ? {
              type: "QUOTE" as const,
              sourceMessageId: row.sourceMessageId,
              compactPrice: row.compactQuote,
              announcedAt: row.announcedAt.toISOString(),
            }
          : null;
      }
      const row = await db.trade.findFirst({
        where: { sourceMessageId: event.sourceMessageId },
        select: tradeSelect,
      });
      return row
        ? {
            type: "TRADE" as const,
            ...row,
            announcedAt: row.announcedAt.toISOString(),
          }
        : null;
    },
  };
}
