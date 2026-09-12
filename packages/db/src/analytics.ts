import type { PrismaClient, Trade } from "../prisma/generated/client";

export function createAnalyticsDataStore(prisma: PrismaClient) {
  return {
    /**
     * Returns all trades for a specific participant in ascending chronological order.
     * Uses composite indices Trade(buyerParticipantId, announcedAt) and Trade(sellerParticipantId, announcedAt).
     */
    participantTradesChronological: (participantId: string): Promise<Trade[]> =>
      prisma.trade.findMany({
        where: {
          OR: [
            { buyerParticipantId: participantId },
            { sellerParticipantId: participantId },
          ],
        },
        orderBy: [{ announcedAt: "asc" }, { sourceMessageId: "asc" }],
      }),

    /**
     * Returns all distinct participant aliases that executed at least one trade within the window.
     */
    activeParticipantAliasesInWindow: async (
      windowStart: Date,
      windowEnd: Date,
    ): Promise<string[]> => {
      const trades = await prisma.trade.findMany({
        where: {
          announcedAt: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        select: {
          buyerParticipantId: true,
          sellerParticipantId: true,
        },
      });

      const aliases = new Set<string>();
      for (const trade of trades) {
        aliases.add(trade.buyerParticipantId);
        aliases.add(trade.sellerParticipantId);
      }
      return Array.from(aliases);
    },

    /**
     * Returns all chronological trades for a list of participant IDs.
     * Used to batch-evaluate opening positions and 7-day metrics in a single database round-trip.
     */
    tradesForParticipantsChronological: (
      participantIds: string[],
    ): Promise<Trade[]> => {
      if (participantIds.length === 0) return Promise.resolve([]);
      return prisma.trade.findMany({
        where: {
          OR: [
            { buyerParticipantId: { in: participantIds } },
            { sellerParticipantId: { in: participantIds } },
          ],
        },
        orderBy: [{ announcedAt: "asc" }, { sourceMessageId: "asc" }],
      });
    },

    /**
     * Returns the earliest recorded trade timestamp in the system, or null if no trades exist.
     */
    earliestTradeDate: async (): Promise<Date | null> => {
      const first = await prisma.trade.findFirst({
        orderBy: [{ announcedAt: "asc" }, { sourceMessageId: "asc" }],
        select: { announcedAt: true },
      });
      return first?.announcedAt ?? null;
    },
  };
}
