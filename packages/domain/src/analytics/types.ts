export type TradeSide = "BUY" | "SELL";

export type DataCoverageConfidence =
  "HIGH" | "ESTIMATED" | "UNVERIFIED_INVENTORY";

export interface ParticipantTrade {
  readonly id: string;
  readonly sourceMessageId: number;
  readonly side: TradeSide;
  readonly quantity: number;
  readonly compactPrice: number;
  readonly announcedAt: Date;
}

export interface PositionState {
  /** Signed net quantity: > 0 for Long, < 0 for Short, 0 for Flat. */
  readonly netQuantity: number;
  /** Weighted-average cost basis per unit. 0 if Flat. */
  readonly costBasis: number;
  /** True if the position has reached 0 (flat) at least once in the observed stream. */
  readonly hasZeroCrossing: boolean;
  /** Number of units closed without recorded opening basis (unverified historical inventory). */
  readonly unmatchedUnits: number;
}

export interface TradeTransition {
  readonly previousPosition: PositionState;
  readonly nextPosition: PositionState;
  readonly trade: ParticipantTrade;
  /** Realized P&L in compact price points. Zero if trade only added/opened inventory. */
  readonly realizedPnlPoints: number;
  /** Realized P&L converted to Tomans using RECEIPT_TOMAN_MULTIPLIER. */
  readonly realizedPnlTomans: number;
  /** Quantity of units closed in this trade (0 if pure add/open). */
  readonly closedQuantity: number;
  /** Quantity of units opened in this trade (0 if pure close). */
  readonly openedQuantity: number;
  /** True if this trade flipped the position between Long and Short across zero. */
  readonly isCrossing: boolean;
}

export interface ParticipantAnalytics7D {
  readonly alias: string;
  readonly windowStart: Date;
  readonly windowEnd: Date;

  // 7-day activity metrics (attributed strictly to trades in window)
  readonly realizedPnlPoints: number;
  readonly realizedPnlTomans: number;
  readonly totalVolume: number;
  readonly buyVolume: number;
  readonly sellVolume: number;
  readonly totalTrades: number;
  readonly buyTrades: number;
  readonly sellTrades: number;
  readonly averageTradeSize: number;

  // Current position state at windowEnd
  readonly observedPosition: number;
  readonly currentCostBasis: number;

  // Data coverage and confidence
  readonly confidence: DataCoverageConfidence;
  readonly hasZeroCrossing: boolean;
  readonly unmatchedUnits: number;
  readonly totalObservedTrades: number;
  readonly firstTradeAt: Date | null;
}
