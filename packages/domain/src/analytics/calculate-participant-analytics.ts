import {
  calculatePositionTransition,
  createInitialPositionState,
} from "./calculate-position";
import {
  ROLLING_WINDOW_MS,
  roundAnalyticsPoints,
  realizedPnlPointsToTomans,
} from "./constants";
import type {
  DataCoverageConfidence,
  AnalyticsContribution,
  ParticipantAnalytics7D,
  ParticipantTrade,
  PositionState,
} from "./types";

export interface CalculateAnalyticsInput {
  readonly alias: string;
  /** Chronologically sorted trades for this participant (announcedAt ASC, sourceMessageId ASC). */
  readonly allTradesChronological: readonly ParticipantTrade[];
  readonly windowStart: Date;
  readonly windowEnd: Date;
  /** Earliest date the system began collecting data, used for data span checks. */
  readonly earliestSystemDate?: Date;
  /** An accepted first settlement resets uncertain historical inventory. */
  readonly baselineMessageId?: number;
  /** Supplied only by coverage-aware callers; legacy callers retain their previous rule. */
  readonly coverageVerified?: boolean;
  /** The caller already sorted by effective Telegram message ID. */
  readonly replayByMessageId?: boolean;
}

/**
 * Replays participant historical trades to establish the opening position state at windowStart,
 * then processes trades within [windowStart, windowEnd] to aggregate 7-day rolling performance.
 */
export function calculateParticipantAnalytics7D(
  input: CalculateAnalyticsInput,
): ParticipantAnalytics7D {
  const {
    alias,
    allTradesChronological,
    windowStart,
    windowEnd,
    earliestSystemDate,
    baselineMessageId,
    coverageVerified,
    replayByMessageId,
  } = input;

  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();

  // 1. Separate historical trades (pre-window) from active window trades
  const preWindowTrades: ParticipantTrade[] = [];
  const windowTrades: ParticipantTrade[] = [];
  const preBaselineWindowTrades: ParticipantTrade[] = [];

  for (const trade of allTradesChronological) {
    const tradeTime = trade.announcedAt.getTime();
    if (
      baselineMessageId !== undefined &&
      trade.sourceMessageId <= baselineMessageId
    ) {
      if (tradeTime >= windowStartMs && tradeTime <= windowEndMs) {
        preBaselineWindowTrades.push(trade);
      }
      continue;
    }
    if (tradeTime < windowStartMs && !replayByMessageId) {
      preWindowTrades.push(trade);
    } else if (tradeTime <= windowEndMs) {
      windowTrades.push(trade);
    }
  }

  // 2. Replay pre-window trades to establish opening position & cost basis at windowStart
  let openingState: PositionState = createInitialPositionState({
    hasZeroCrossing: baselineMessageId !== undefined,
  });
  for (const trade of preWindowTrades) {
    const transition = calculatePositionTransition(openingState, trade);
    openingState = transition.nextPosition;
  }

  // 3. Process window trades, accumulating 7-day metrics
  let currentState: PositionState = openingState;
  let realizedPnlPoints = 0;
  let buyVolume = 0;
  let sellVolume = 0;
  let buyTrades = 0;
  let sellTrades = 0;
  const byType = {
    NORMAL: {
      pnl: 0,
      buyVolume: 0,
      sellVolume: 0,
      buyTrades: 0,
      sellTrades: 0,
    },
    SETTLEMENT: {
      pnl: 0,
      buyVolume: 0,
      sellVolume: 0,
      buyTrades: 0,
      sellTrades: 0,
    },
  };
  const countTrade = (
    trade: ParticipantTrade,
    bucket: typeof byType.NORMAL,
  ) => {
    if (trade.side === "BUY") {
      buyVolume += trade.quantity;
      buyTrades += 1;
      bucket.buyVolume += trade.quantity;
      bucket.buyTrades += 1;
    } else {
      sellVolume += trade.quantity;
      sellTrades += 1;
      bucket.sellVolume += trade.quantity;
      bucket.sellTrades += 1;
    }
  };

  for (const trade of preBaselineWindowTrades) {
    countTrade(trade, byType[trade.type ?? "NORMAL"]);
  }

  for (const trade of windowTrades) {
    const transition = calculatePositionTransition(currentState, trade);
    currentState = transition.nextPosition;
    if (trade.announcedAt.getTime() < windowStartMs) continue;

    realizedPnlPoints += transition.unroundedRealizedPnlPoints;
    const bucket = byType[trade.type ?? "NORMAL"];
    bucket.pnl += transition.unroundedRealizedPnlPoints;

    countTrade(trade, bucket);
  }

  const totalVolume = buyVolume + sellVolume;
  const totalTrades = buyTrades + sellTrades;
  const averageTradeSize =
    totalTrades > 0 ? Math.round((totalVolume / totalTrades) * 100) / 100 : 0;

  const firstTradeAt = allTradesChronological.reduce<Date | null>(
    (first, trade) => {
      if (
        baselineMessageId !== undefined &&
        trade.sourceMessageId <= baselineMessageId
      )
        return first;
      return first === null || trade.announcedAt < first
        ? trade.announcedAt
        : first;
    },
    null,
  );

  // 4. Determine Data Coverage Confidence
  // HIGH: Valid baseline reset occurred AND zero crossing occurred AND system/participant history covers at least 7 days
  // ESTIMATED: No valid baseline OR history is shorter than 7 days OR position has never reset to flat
  // UNVERIFIED_INVENTORY: Participant has unmatched units
  let confidence: DataCoverageConfidence;

  if (currentState.unmatchedUnits > 0) {
    confidence = "UNVERIFIED_INVENTORY";
  } else {
    const historyStart = earliestSystemDate
      ? Math.max(
          earliestSystemDate.getTime(),
          firstTradeAt ? firstTradeAt.getTime() : Infinity,
        )
      : (firstTradeAt?.getTime() ?? windowStartMs);

    const hasFullWindowCoverage =
      windowEndMs - historyStart >= ROLLING_WINDOW_MS;

    if (
      baselineMessageId !== undefined &&
      currentState.hasZeroCrossing &&
      hasFullWindowCoverage &&
      coverageVerified !== false
    ) {
      confidence = "HIGH";
    } else {
      confidence = "ESTIMATED";
    }
  }

  const contribution = (
    bucket: typeof byType.NORMAL,
  ): AnalyticsContribution => ({
    realizedPnlPoints: roundAnalyticsPoints(bucket.pnl),
    realizedPnlTomans: realizedPnlPointsToTomans(bucket.pnl),
    buyVolume: bucket.buyVolume,
    sellVolume: bucket.sellVolume,
    totalVolume: bucket.buyVolume + bucket.sellVolume,
    buyTrades: bucket.buyTrades,
    sellTrades: bucket.sellTrades,
    totalTrades: bucket.buyTrades + bucket.sellTrades,
  });
  const totalContribution: AnalyticsContribution = {
    realizedPnlPoints: roundAnalyticsPoints(realizedPnlPoints),
    realizedPnlTomans: realizedPnlPointsToTomans(realizedPnlPoints),
    buyVolume,
    sellVolume,
    totalVolume,
    buyTrades,
    sellTrades,
    totalTrades,
  };
  const normalContribution = contribution(byType.NORMAL);
  const settlementContribution = contribution(byType.SETTLEMENT);

  return {
    alias,
    windowStart,
    windowEnd,
    realizedPnlPoints: roundAnalyticsPoints(realizedPnlPoints),
    realizedPnlTomans: realizedPnlPointsToTomans(realizedPnlPoints),
    totalVolume,
    buyVolume,
    sellVolume,
    totalTrades,
    buyTrades,
    sellTrades,
    averageTradeSize,
    observedPosition: currentState.netQuantity,
    currentCostBasis: currentState.costBasis,
    confidence,
    hasZeroCrossing: currentState.hasZeroCrossing,
    unmatchedUnits: currentState.unmatchedUnits,
    totalObservedTrades: allTradesChronological.length,
    firstTradeAt,
    contributions: {
      normal: normalContribution,
      settlement: {
        ...settlementContribution,
        realizedPnlPoints: roundAnalyticsPoints(
          totalContribution.realizedPnlPoints -
            normalContribution.realizedPnlPoints,
        ),
        realizedPnlTomans:
          totalContribution.realizedPnlTomans -
          normalContribution.realizedPnlTomans,
      },
      total: totalContribution,
    },
  };
}
