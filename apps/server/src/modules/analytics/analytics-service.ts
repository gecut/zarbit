import type { Store } from "@zarbit/db";
import {
  calculateParticipantAnalytics7D,
  ROLLING_WINDOW_MS,
  type ParticipantTrade,
} from "@zarbit/domain";
import type {
  ParticipantAnalyticsDetail,
  ParticipantAnalyticsSummary,
  TraderListQuery,
  TraderRecentTrade,
} from "@zarbit/contracts";

export class AnalyticsService {
  constructor(
    private readonly store: Store,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getTradersList(
    query: TraderListQuery,
  ): Promise<ParticipantAnalyticsSummary[]> {
    const windowEnd = this.now();
    const windowStart = new Date(windowEnd.getTime() - ROLLING_WINDOW_MS);

    // 1. Find all active aliases in the 7-day rolling window
    const activeAliases = await this.store.activeParticipantAliasesInWindow(
      windowStart,
      windowEnd,
    );
    if (activeAliases.length === 0) return [];

    // 2. Fetch all historical and window trades for these active participants
    const allTrades =
      await this.store.tradesForParticipantsChronological(activeAliases);
    const earliestDate = await this.store.earliestTradeDate();

    // 3. Group trades per participant
    const tradesByAlias = new Map<string, ParticipantTrade[]>();
    for (const alias of activeAliases) {
      tradesByAlias.set(alias, []);
    }

    for (const trade of allTrades) {
      if (tradesByAlias.has(trade.buyerParticipantId)) {
        tradesByAlias.get(trade.buyerParticipantId)!.push({
          id: trade.id,
          sourceMessageId: trade.sourceMessageId,
          side: "BUY",
          quantity: trade.quantity,
          compactPrice: trade.compactPrice,
          announcedAt: trade.announcedAt,
        });
      }
      if (tradesByAlias.has(trade.sellerParticipantId)) {
        tradesByAlias.get(trade.sellerParticipantId)!.push({
          id: trade.id,
          sourceMessageId: trade.sourceMessageId,
          side: "SELL",
          quantity: trade.quantity,
          compactPrice: trade.compactPrice,
          announcedAt: trade.announcedAt,
        });
      }
    }

    // 4. Calculate analytics per participant using pure domain engine
    const summaries: ParticipantAnalyticsSummary[] = [];

    for (const alias of activeAliases) {
      const participantTrades = tradesByAlias.get(alias) ?? [];
      const analytics = calculateParticipantAnalytics7D({
        alias,
        allTradesChronological: participantTrades,
        windowStart,
        windowEnd,
        earliestSystemDate: earliestDate ?? undefined,
      });

      summaries.push({
        alias: analytics.alias,
        realizedPnlPoints: analytics.realizedPnlPoints,
        realizedPnlTomans: analytics.realizedPnlTomans,
        totalVolume: analytics.totalVolume,
        buyVolume: analytics.buyVolume,
        sellVolume: analytics.sellVolume,
        totalTrades: analytics.totalTrades,
        buyTrades: analytics.buyTrades,
        sellTrades: analytics.sellTrades,
        averageTradeSize: analytics.averageTradeSize,
        observedPosition: analytics.observedPosition,
        currentCostBasis: analytics.currentCostBasis,
        confidence: analytics.confidence,
        hasZeroCrossing: analytics.hasZeroCrossing,
        unmatchedUnits: analytics.unmatchedUnits,
        firstTradeAt: analytics.firstTradeAt
          ? analytics.firstTradeAt.toISOString()
          : null,
      });
    }

    // 5. Sort by requested metric
    summaries.sort((a, b) => {
      let diff = 0;
      switch (query.sortBy) {
        case "REALIZED_PNL":
          diff = a.realizedPnlPoints - b.realizedPnlPoints;
          break;
        case "VOLUME":
          diff = a.totalVolume - b.totalVolume;
          break;
        case "TRADE_COUNT":
          diff = a.totalTrades - b.totalTrades;
          break;
        case "AVG_TRADE_SIZE":
          diff = a.averageTradeSize - b.averageTradeSize;
          break;
      }
      return query.sortOrder === "DESC" ? -diff : diff;
    });

    return summaries.slice(0, query.limit);
  }

  async getTraderDetail(
    alias: string,
  ): Promise<ParticipantAnalyticsDetail | null> {
    const rawTrades = await this.store.participantTradesChronological(alias);
    if (rawTrades.length === 0) {
      // Check if participant exists at all
      const participant = await this.store.participant(alias);
      if (!participant) return null;
    }

    const windowEnd = this.now();
    const windowStart = new Date(windowEnd.getTime() - ROLLING_WINDOW_MS);
    const earliestDate = await this.store.earliestTradeDate();

    const participantTrades: ParticipantTrade[] = rawTrades.map((t) => ({
      id: t.id,
      sourceMessageId: t.sourceMessageId,
      side: t.buyerParticipantId === alias ? "BUY" : "SELL",
      quantity: t.quantity,
      compactPrice: t.compactPrice,
      announcedAt: t.announcedAt,
    }));

    const analytics = calculateParticipantAnalytics7D({
      alias,
      allTradesChronological: participantTrades,
      windowStart,
      windowEnd,
      earliestSystemDate: earliestDate ?? undefined,
    });

    const summary: ParticipantAnalyticsSummary = {
      alias: analytics.alias,
      realizedPnlPoints: analytics.realizedPnlPoints,
      realizedPnlTomans: analytics.realizedPnlTomans,
      totalVolume: analytics.totalVolume,
      buyVolume: analytics.buyVolume,
      sellVolume: analytics.sellVolume,
      totalTrades: analytics.totalTrades,
      buyTrades: analytics.buyTrades,
      sellTrades: analytics.sellTrades,
      averageTradeSize: analytics.averageTradeSize,
      observedPosition: analytics.observedPosition,
      currentCostBasis: analytics.currentCostBasis,
      confidence: analytics.confidence,
      hasZeroCrossing: analytics.hasZeroCrossing,
      unmatchedUnits: analytics.unmatchedUnits,
      firstTradeAt: analytics.firstTradeAt
        ? analytics.firstTradeAt.toISOString()
        : null,
    };

    // Return up to 20 most recent trades (newest first)
    const recentTrades: TraderRecentTrade[] = rawTrades
      .slice(-20)
      .reverse()
      .map((t) => ({
        id: t.id,
        sourceMessageId: t.sourceMessageId,
        side: t.buyerParticipantId === alias ? "BUY" : "SELL",
        quantity: t.quantity,
        compactPrice: t.compactPrice,
        counterpartyAlias:
          t.buyerParticipantId === alias
            ? t.sellerParticipantId
            : t.buyerParticipantId,
        announcedAt: t.announcedAt.toISOString(),
      }));

    return {
      summary,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      recentTrades,
    };
  }
}
