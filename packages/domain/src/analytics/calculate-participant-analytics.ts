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
  } = input;

  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();

  // 1. Separate historical trades (pre-window) from active window trades
  const preWindowTrades: ParticipantTrade[] = [];
  const windowTrades: ParticipantTrade[] = [];

  for (const trade of allTradesChronological) {
    const tradeTime = trade.announcedAt.getTime();
    if (tradeTime < windowStartMs) {
      preWindowTrades.push(trade);
    } else if (tradeTime <= windowEndMs) {
      windowTrades.push(trade);
    }
  }

  // 2. Replay pre-window trades to establish opening position & cost basis at windowStart
  let openingState: PositionState = createInitialPositionState();
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

  for (const trade of windowTrades) {
    const transition = calculatePositionTransition(currentState, trade);
    currentState = transition.nextPosition;

    realizedPnlPoints += transition.unroundedRealizedPnlPoints;

    if (trade.side === "BUY") {
      buyVolume += trade.quantity;
      buyTrades += 1;
    } else {
      sellVolume += trade.quantity;
      sellTrades += 1;
    }
  }

  const totalVolume = buyVolume + sellVolume;
  const totalTrades = buyTrades + sellTrades;
  const averageTradeSize =
    totalTrades > 0 ? Math.round((totalVolume / totalTrades) * 100) / 100 : 0;

  const firstTradeAt =
    allTradesChronological.length > 0
      ? (allTradesChronological[0]?.announcedAt ?? null)
      : null;

  // 4. Determine Data Coverage Confidence
  // HIGH: Zero crossing occurred AND system/participant history covers at least 7 days
  // ESTIMATED: History is shorter than 7 days OR position has never reset to flat
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

    if (currentState.hasZeroCrossing && hasFullWindowCoverage) {
      confidence = "HIGH";
    } else {
      confidence = "ESTIMATED";
    }
  }

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
  };
}
