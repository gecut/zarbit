import type {
  ParticipantAnalyticsDetail,
  ParticipantAnalyticsSummary,
  TraderRecentTrade,
} from "@zarbit/contracts";

export type TradersScenario = "normal" | "empty" | "loading" | "error";

export function getTradersScenario(search: string): TradersScenario {
  const value = new URLSearchParams(search).get("tradersScenario");
  if (value === "empty" || value === "loading" || value === "error") {
    return value;
  }
  return "normal";
}

export const mockWhalesList: ParticipantAnalyticsSummary[] = [
  {
    alias: "اسکان",
    realizedPnlPoints: 420,
    realizedPnlTomans: 42_000,
    totalVolume: 20,
    buyVolume: 10,
    sellVolume: 10,
    totalTrades: 15,
    buyTrades: 8,
    sellTrades: 7,
    averageTradeSize: 1.33,
    observedPosition: 0,
    currentCostBasis: 0,
    confidence: "HIGH",
    hasZeroCrossing: true,
    unmatchedUnits: 0,
    firstTradeAt: "2026-09-03T09:14:00.000Z",
  },
  {
    alias: "مرداد",
    realizedPnlPoints: 310,
    realizedPnlTomans: 31_000,
    totalVolume: 16,
    buyVolume: 6,
    sellVolume: 10,
    totalTrades: 15,
    buyTrades: 6,
    sellTrades: 9,
    averageTradeSize: 1.07,
    observedPosition: -4,
    currentCostBasis: 105_120,
    confidence: "HIGH",
    hasZeroCrossing: true,
    unmatchedUnits: 0,
    firstTradeAt: "2026-09-03T09:13:00.000Z",
  },
  {
    alias: "عرفاان",
    realizedPnlPoints: 250,
    realizedPnlTomans: 25_000,
    totalVolume: 18,
    buyVolume: 8,
    sellVolume: 10,
    totalTrades: 17,
    buyTrades: 8,
    sellTrades: 9,
    averageTradeSize: 1.06,
    observedPosition: -2,
    currentCostBasis: 105_080,
    confidence: "ESTIMATED",
    hasZeroCrossing: false,
    unmatchedUnits: 0,
    firstTradeAt: "2026-09-05T11:20:00.000Z",
  },
  {
    alias: "افق",
    realizedPnlPoints: 150,
    realizedPnlTomans: 15_000,
    totalVolume: 15,
    buyVolume: 8,
    sellVolume: 7,
    totalTrades: 15,
    buyTrades: 8,
    sellTrades: 7,
    averageTradeSize: 1.0,
    observedPosition: 1,
    currentCostBasis: 105_020,
    confidence: "HIGH",
    hasZeroCrossing: true,
    unmatchedUnits: 0,
    firstTradeAt: "2026-09-03T10:00:00.000Z",
  },
  {
    alias: "عالی",
    realizedPnlPoints: 120,
    realizedPnlTomans: 12_000,
    totalVolume: 14,
    buyVolume: 7,
    sellVolume: 7,
    totalTrades: 14,
    buyTrades: 7,
    sellTrades: 7,
    averageTradeSize: 1.0,
    observedPosition: 0,
    currentCostBasis: 0,
    confidence: "HIGH",
    hasZeroCrossing: true,
    unmatchedUnits: 0,
    firstTradeAt: "2026-09-03T10:30:00.000Z",
  },
  {
    alias: "اشرف تک",
    realizedPnlPoints: 80,
    realizedPnlTomans: 8_000,
    totalVolume: 14,
    buyVolume: 8,
    sellVolume: 6,
    totalTrades: 14,
    buyTrades: 8,
    sellTrades: 6,
    averageTradeSize: 1.0,
    observedPosition: 2,
    currentCostBasis: 104_980,
    confidence: "UNVERIFIED_INVENTORY",
    hasZeroCrossing: false,
    unmatchedUnits: 1,
    firstTradeAt: "2026-09-04T12:00:00.000Z",
  },
  {
    alias: "ساشا",
    realizedPnlPoints: 60,
    realizedPnlTomans: 6_000,
    totalVolume: 8,
    buyVolume: 4,
    sellVolume: 4,
    totalTrades: 8,
    buyTrades: 4,
    sellTrades: 4,
    averageTradeSize: 1.0,
    observedPosition: 0,
    currentCostBasis: 0,
    confidence: "HIGH",
    hasZeroCrossing: true,
    unmatchedUnits: 0,
    firstTradeAt: "2026-09-03T11:00:00.000Z",
  },
  {
    alias: "عینک",
    realizedPnlPoints: 40,
    realizedPnlTomans: 4_000,
    totalVolume: 8,
    buyVolume: 4,
    sellVolume: 4,
    totalTrades: 8,
    buyTrades: 4,
    sellTrades: 4,
    averageTradeSize: 1.0,
    observedPosition: 0,
    currentCostBasis: 0,
    confidence: "HIGH",
    hasZeroCrossing: true,
    unmatchedUnits: 0,
    firstTradeAt: "2026-09-03T11:30:00.000Z",
  },
  {
    alias: "یزد",
    realizedPnlPoints: -50,
    realizedPnlTomans: -5_000,
    totalVolume: 13,
    buyVolume: 9,
    sellVolume: 4,
    totalTrades: 13,
    buyTrades: 9,
    sellTrades: 4,
    averageTradeSize: 1.0,
    observedPosition: 5,
    currentCostBasis: 105_150,
    confidence: "HIGH",
    hasZeroCrossing: true,
    unmatchedUnits: 0,
    firstTradeAt: "2026-09-03T09:45:00.000Z",
  },
  {
    alias: "شهاب و مرضی",
    realizedPnlPoints: -180,
    realizedPnlTomans: -18_000,
    totalVolume: 15,
    buyVolume: 5,
    sellVolume: 10,
    totalTrades: 13,
    buyTrades: 4,
    sellTrades: 9,
    averageTradeSize: 1.15,
    observedPosition: -5,
    currentCostBasis: 105_090,
    confidence: "HIGH",
    hasZeroCrossing: true,
    unmatchedUnits: 0,
    firstTradeAt: "2026-09-03T09:30:00.000Z",
  },
];

export function getMockTradersList(
  search = "",
  sortBy:
    | "REALIZED_PNL"
    | "VOLUME"
    | "TRADE_COUNT"
    | "AVG_TRADE_SIZE" = "REALIZED_PNL",
  sortOrder: "ASC" | "DESC" = "DESC",
): ParticipantAnalyticsSummary[] {
  const scenario = getTradersScenario(search);
  if (scenario === "empty") return [];

  const copy = [...mockWhalesList];
  copy.sort((a, b) => {
    let diff = 0;
    switch (sortBy) {
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
    return sortOrder === "DESC" ? -diff : diff;
  });

  return copy;
}

export function createMockTraderDetail(
  alias: string,
  now = Date.now(),
): ParticipantAnalyticsDetail | null {
  const summary = mockWhalesList.find((w) => w.alias === alias);
  if (!summary) return null;

  const nowIso = new Date(now).toISOString();
  const startIso = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

  const recentTrades: TraderRecentTrade[] = [
    {
      id: "rt-1",
      sourceMessageId: 888808,
      side: "BUY",
      quantity: 1,
      compactPrice: 105050,
      counterpartyAlias: "سناتور",
      announcedAt: new Date(now - 20 * 60_000).toISOString(),
    },
    {
      id: "rt-2",
      sourceMessageId: 888500,
      side: "SELL",
      quantity: 2,
      compactPrice: 105120,
      counterpartyAlias: "مرداد",
      announcedAt: new Date(now - 80 * 60_000).toISOString(),
    },
    {
      id: "rt-3",
      sourceMessageId: 887900,
      side: "BUY",
      quantity: 1,
      compactPrice: 104950,
      counterpartyAlias: "افق",
      announcedAt: new Date(now - 240 * 60_000).toISOString(),
    },
  ];

  return {
    summary,
    windowStart: startIso,
    windowEnd: nowIso,
    recentTrades,
  };
}
